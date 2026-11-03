import type { GiftConfig } from '../../config/gifts.js';
import { dueBirthday, localDay } from './birthdays.js';
import { GiftStore } from './store.js';
import type { BirthdayGreeting, GiftCycle, ViewState } from './store.js';
import { notifyOtherAdmin } from './admin-notices.js';
import type { AdminMessenger } from './admin-notices.js';

export interface GiftChannel extends AdminMessenger {
  validate(operation?: 'announce' | 'restore'): Promise<void>;
  inspect(userId: string): Promise<{ visible: boolean; canHide: boolean; isAdmin: boolean; priorView: ViewState }>;
  hide(userId: string): Promise<void>;
  isHidden(userId: string): Promise<boolean>;
  restore(userId: string, view: ViewState): Promise<boolean>;
  publish(cycle: GiftCycle): Promise<string>;
  findAnnouncement(cycle: GiftCycle): Promise<string | undefined>;
  canParticipate(userId: string): Promise<boolean>;
  canGreetBirthday(userId: string): Promise<boolean>;
  greetBirthday(greeting: BirthdayGreeting): Promise<string>;
  findBirthdayGreeting(greeting: BirthdayGreeting): Promise<string | undefined>;
}

export class GiftService {
  constructor(readonly config: GiftConfig, readonly store: GiftStore, private readonly channel: GiftChannel) {
    if (store.cycles(config).some((c) => c.state !== 'restored' && c.accessRoleId !== config.roleId)) {
      throw new Error('Hay exclusiones pendientes con otro rol o con el mecanismo anterior. Restauralas antes de cambiar la configuración.');
    }
  }

  async tick(now: Date): Promise<void> {
    const errors: unknown[] = [];
    try { await this.finishBirthdays(now); } catch (error) { errors.push(error); }
    try { await this.organize(now); } catch (error) { errors.push(error); }
    if (errors.length === 1) throw errors[0];
    if (errors.length) throw new AggregateError(errors, 'Cumpleaños requiere atención; se reintenta cada minuto.');
  }

  private async finishBirthdays(now: Date): Promise<void> {
    const today = localDay(now, this.config.timeZone);
    const errors: unknown[] = [];
    // Restore even overdue/prepared cycles, independently of announcement permissions.
    for (const cycle of this.store.cycles(this.config).filter(c => c.state !== 'restored' && c.exclusionMode === 'bot' && c.birthday <= today)) {
      try {
        if (!await this.restore(cycle.userId)) throw new Error(`Regalo ${cycle.id}: no se confirmó la reincorporación.`);
      } catch (error) { errors.push(error); }
    }
    for (const birthday of this.store.birthdays(this.config.guildId).filter(b => b.category !== 'no-gift' && b.userId !== this.config.dmOnlyAdminId && dueBirthday(b.dayMonth, today) === today)) {
      try { await this.celebrate(birthday.userId, today); } catch (error) { errors.push(error); }
    }
    if (errors.length === 1) throw errors[0];
    if (errors.length) throw new AggregateError(errors, 'No se pudieron completar reincorporaciones o saludos.');
  }

  private async celebrate(userId: string, today: string, retry = false): Promise<void> {
    const greeting = this.store.greeting(this.config, userId, today);
    if (greeting.state === 'sent') return;
    const cycle = this.active(userId);
    if (cycle?.exclusionMode === 'bot' || !await this.channel.canGreetBirthday(userId)) {
      throw new Error(`Saludo ${greeting.id}: esperando reincorporación y permisos para mencionar con @here.`);
    }
    if (greeting.state === 'sending') {
      const existing = await this.channel.findBirthdayGreeting(greeting);
      if (existing) { this.store.greetingState(greeting.id, 'sent', existing); return; }
      if (!retry) throw new Error(`Saludo ${greeting.id}: envío incierto; revisar el canal y usar !regalo felicitar <@${userId}> para reintentar.`);
    }
    this.store.greetingState(greeting.id, 'sending');
    this.store.greetingState(greeting.id, 'sent', await this.channel.greetBirthday(greeting));
  }

  async retryBirthday(userId: string, now = new Date()): Promise<void> {
    const today = localDay(now, this.config.timeZone);
    const birthday = this.store.birthdays(this.config.guildId).find(b => b.userId === userId);
    if (!birthday || birthday.category === 'no-gift' || userId === this.config.dmOnlyAdminId || dueBirthday(birthday.dayMonth, today) !== today) {
      throw new Error('Sólo se puede recuperar el saludo del cumpleaños de hoy.');
    }
    if (this.active(userId)?.exclusionMode === 'bot') await this.restore(userId);
    await this.celebrate(userId, today, true);
  }

  private async organize(now: Date): Promise<void> {
    const today = await this.prepareAndHide(now);
    for (const cycle of this.store.cycles(this.config)) {
      if (cycle.birthday <= today) continue;
      if (this.store.category(this.config.guildId, cycle.userId) === 'no-gift') continue;
      if (cycle.userId === this.config.dmOnlyAdminId) continue;
      if (cycle.state === 'publishing') {
        const message = await this.channel.findAnnouncement(cycle);
        if (message) this.store.state(cycle.id, 'announced', message);
        else throw new Error(`Regalo ${cycle.id}: publicación incierta. Revisar el canal; usar !regalo anunciar <@${cycle.userId}> para reintentar conscientemente.`);
      } else if (cycle.state === 'hidden' && cycle.birthday > today) {
        await this.verifyExclusions(today);
        await this.publish(cycle);
      }
    }
  }

  private async prepareAndHide(now: Date): Promise<string> {
    const today = localDay(now, this.config.timeZone);
    for (const cycle of this.store.cycles(this.config).filter((c) => c.state === 'restoring' && c.birthday > today)) {
      await this.channel.validate('restore');
      await this.finishRestore(cycle);
    }
    const due = this.store.birthdays(this.config.guildId).filter((birthday) => birthday.category !== 'no-gift').flatMap((birthday) => {
      const date = dueBirthday(birthday.dayMonth, today);
      return date ? [{ birthday, date }] : [];
    });
    // Private reminders remain independent of problems with ordinary channel exclusions.
    for (const { birthday, date } of due.filter(({ birthday }) => this.config.adminIds?.includes(birthday.userId))) {
      await notifyOtherAdmin(this.config, this.store, this.channel, birthday, date, now);
      if (birthday.userId === this.config.dmOnlyAdminId || date <= today) continue;
      const cycles = this.store.cycles(this.config);
      if (cycles.some((c) => c.userId === birthday.userId && (c.birthday === date || c.state !== 'restored'))) continue;
      const access = await this.channel.inspect(birthday.userId);
      if (access.visible || access.isAdmin || !access.canHide) continue;
      // Humans removed access. Record the cycle without claiming or editing their permissions.
      this.store.prepare(this.config, birthday, date, access.priorView, 'manual');
    }
    for (const { birthday, date } of due.filter(({ birthday, date }) => date > today && !this.config.adminIds?.includes(birthday.userId))) {
      const cycles = this.store.cycles(this.config);
      if (cycles.some((c) => c.userId === birthday.userId && (c.birthday === date || c.state !== 'restored'))) continue;
      const before = await this.channel.inspect(birthday.userId);
      if (!before.canHide || !before.visible || before.priorView !== 1) throw new Error(`Regalos: no se puede excluir al miembro ${birthday.userId}; revisar rol Cumpleañeri, acceso, dueño o Administrador. No se publicaron convocatorias.`);
      this.store.prepare(this.config, birthday, date, before.priorView);
    }
    // Admin-only reminders do not require channel mentions or permission edits.
    if (!this.store.cycles(this.config).some((c) => c.state !== 'restored' && c.birthday > today)) return today;
    await this.channel.validate();
    for (const cycle of this.store.cycles(this.config).filter((c) => c.state === 'prepared' && c.birthday > today && c.exclusionMode === 'bot' && c.userId !== this.config.dmOnlyAdminId)) {
      await this.channel.hide(cycle.userId);
      if (!await this.channel.isHidden(cycle.userId)) throw new Error(`Regalos: exclusión no confirmada (${cycle.id}).`);
      this.store.state(cycle.id, 'hidden');
    }
    // Exclude EVERY overlapping birthday before sending ANY surprise announcement.
    await this.verifyExclusions(today);
    return today;
  }

  private async verifyExclusions(today: string): Promise<void> {
    for (const c of this.store.cycles(this.config).filter((c) => c.state !== 'restored' && c.birthday > today)) {
      if (c.userId === this.config.dmOnlyAdminId) continue;
      const hidden = c.exclusionMode === 'manual'
        ? !(await this.channel.inspect(c.userId)).visible
        : await this.channel.isHidden(c.userId);
      if (c.state === 'restoring' || !hidden) {
        throw new Error(`Regalo ${c.id}: falta confirmar la exclusión; convocatoria bloqueada.`);
      }
    }
  }

  private async publish(cycle: GiftCycle): Promise<void> {
    // Durable intent before REST: an ambiguous send is reconciled, never blindly repeated on restart.
    this.store.state(cycle.id, 'publishing');
    const messageId = await this.channel.publish(cycle);
    this.store.state(cycle.id, 'announced', messageId);
  }

  async retryAnnouncement(userId: string, now = new Date()): Promise<void> {
    if (this.store.category(this.config.guildId, userId) === 'no-gift') throw new Error('Categoría no-gift: no se organiza regalo.');
    if (userId === this.config.dmOnlyAdminId) throw new Error('Este cumpleaños se coordina fuera de Discord y sólo tiene aviso privado.');
    const today = await this.prepareAndHide(now);
    const cycle = this.active(userId);
    if (!cycle || cycle.birthday <= today || !['hidden', 'publishing'].includes(cycle.state)) throw new Error('No hay una convocatoria pendiente para ese miembro.');
    await this.verifyExclusions(today);
    const existing = await this.channel.findAnnouncement(cycle);
    if (existing) this.store.state(cycle.id, 'announced', existing);
    else await this.publish(cycle);
  }

  active(userId: string): GiftCycle | undefined {
    return this.store.cycles(this.config).find((c) => c.userId === userId && c.state !== 'restored');
  }

  async restore(userId: string): Promise<boolean> {
    const cycle = this.active(userId);
    if (!cycle) throw new Error('Ese miembro no tiene una exclusión de Pepe pendiente en este canal.');
    if (cycle.exclusionMode === 'manual') {
      const access = await this.channel.inspect(userId);
      if (!access.visible) return false;
      this.store.state(cycle.id, 'restored');
      return true;
    }
    await this.channel.validate('restore');
    this.store.state(cycle.id, 'restoring');
    return this.finishRestore(cycle);
  }

  private async finishRestore(cycle: GiftCycle): Promise<boolean> {
    if (cycle.exclusionMode === 'manual') throw new Error('La reincorporación de este miembro es manual; Pepe no modifica sus permisos.');
    const visible = await this.channel.restore(cycle.userId, cycle.priorView);
    if (visible) this.store.state(cycle.id, 'restored');
    return visible;
  }

  async participate(id: number, userId: string, messageId: string, joined: boolean): Promise<number> {
    const cycle = this.store.get(id);
    if (!cycle || cycle.guildId !== this.config.guildId || cycle.channelId !== this.config.channelId ||
      cycle.state !== 'announced' || cycle.messageId !== messageId || cycle.userId === userId ||
      !await this.channel.canParticipate(userId)) throw new Error('Esta convocatoria ya está cerrada o no tenés acceso para participar.');
    return this.store.participate(id, userId, joined);
  }
}
