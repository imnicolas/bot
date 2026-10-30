import { openDatabase } from '../database/connection.js';
import type { GiftConfig } from '../config/gifts.js';
import type { Birthday } from '../features/gifts/birthdays.js';
import { GiftService } from '../features/gifts/service.js';
import type { GiftChannel } from '../features/gifts/service.js';
import { GiftStore } from '../features/gifts/store.js';
import type { AdminNotice, GiftCycle, ViewState } from '../features/gifts/store.js';

export interface GiftDemoMember extends Birthday { readonly username: string }
export interface GiftDemoEvent { readonly kind: 'system' | 'channel' | 'dm'; readonly text: string; readonly recipientId?: string }
export const giftDemoMembers: readonly GiftDemoMember[] = [
  { userId: '100000000000000001', username: 'lucia', name: 'Lucía', dayMonth: '12/11' },
  { userId: '100000000000000002', username: 'admin_a', name: 'Admin A (demo)', dayMonth: '07/06' },
  { userId: '100000000000000003', username: 'admin_b', name: 'Admin B (demo)', dayMonth: '24/09' },
  { userId: '100000000000000004', username: 'mara', name: 'Mara', dayMonth: '03/01' },
];
export const giftDemoConfig: GiftConfig = {
  guildId: '100000000000000010', channelId: '100000000000000011', roleId: '100000000000000012', timeZone: 'America/Montevideo',
  adminIds: ['100000000000000002', '100000000000000003'], dmOnlyAdminId: '100000000000000003',
};

// The only transport available to this sandbox records events. It has no Discord client,
// token, filesystem database path or network operations, including for the temporary command.
class DemoGiftChannel implements GiftChannel {
  readonly hidden = new Set<string>();
  readonly demoted = new Set<string>();
  readonly messages = new Map<number, string>();
  readonly dms = new Map<number, string>();
  readonly events: GiftDemoEvent[] = [];
  constructor(private readonly config: GiftConfig, private readonly members: readonly GiftDemoMember[]) {}
  private member(id: string) {
    const member = this.members.find((m) => m.userId === id);
    if (!member) throw new Error('Elegí una persona de la demo.');
    return member;
  }
  async validate() { /* This channel exists only in memory. */ }
  async inspect(id: string) {
    this.member(id);
    const isAdmin = !!this.config.adminIds?.includes(id) && !this.demoted.has(id);
    return { visible: isAdmin || !this.hidden.has(id), canHide: !isAdmin, isAdmin, priorView: (this.hidden.has(id) ? 0 : 1) as ViewState };
  }
  async hide(id: string) {
    if (!(await this.inspect(id)).canHide) throw new Error('Un administrador requiere exclusión manual.');
    this.hidden.add(id);
    this.events.push({ kind: 'system', text: `Pepe retiró el rol Cumpleañeri a ${this.member(id).name}. Retirada del rol guardada en SQLite.` });
  }
  async isHidden(id: string) { return !(await this.inspect(id)).visible; }
  async restore(id: string, _view: ViewState) {
    this.hidden.delete(id);
    this.events.push({ kind: 'system', text: `Pepe devolvió el rol Cumpleañeri a ${this.member(id).name}.` });
    return true;
  }
  async publish(cycle: GiftCycle) {
    const id = `demo-message-${cycle.id}`;
    this.messages.set(cycle.id, id);
    this.events.push({ kind: 'channel', text: `@here 🎁 ¡Organizamos el regalo!\nCumple de ${cycle.name} · ${cycle.birthday.slice(8)}/${cycle.birthday.slice(5, 7)}.\nEl cumpleañero ya no tiene acceso a este canal. Marcá ✅ si vas a colaborar. El check no confirma una transferencia.` });
    return id;
  }
  async findAnnouncement(cycle: GiftCycle) { return this.messages.get(cycle.id); }
  async canParticipate(id: string) { return (await this.inspect(id)).visible; }
  async sendAdminNotice(notice: AdminNotice) {
    const id = `demo-dm-${notice.id}`;
    this.dms.set(notice.id, id);
    this.events.push({ kind: 'dm', recipientId: notice.recipientId,
      text: `🎁 Recordatorio privado: el ${notice.birthday.slice(8)}/${notice.birthday.slice(5, 7)} cumple ${notice.name}.\n` +
        (notice.userId === this.config.dmOnlyAdminId ? 'Organicen su regalo por WhatsApp. Sólo envío este privado; no habrá convocatoria ni cambios de acceso en Discord.'
          : 'Retiren manualmente su rol de Administrador y todo acceso a #regalos. Cuando compruebe que ya no puede verlo, publicaré la convocatoria.') });
    return id;
  }
  async findAdminNotice(notice: AdminNotice) { return this.dms.get(notice.id); }
}

export type GiftDemoAction = 'tick' | 'join' | 'leave' | 'restore' | 'manual-hide' | 'manual-restore' | 'restart';

export class GiftDemoSession {
  private readonly db = openDatabase(':memory:');
  private readonly store = new GiftStore(this.db);
  private channel: DemoGiftChannel;
  private service: GiftService;
  private target: GiftDemoMember | undefined;
  private now = new Date('2026-10-29T15:00:00Z');
  private birthday = '';
  constructor(readonly members = giftDemoMembers, readonly config = giftDemoConfig) {
    this.channel = new DemoGiftChannel(config, members);
    this.service = new GiftService(config, this.store, this.channel);
  }
  state() {
    const cycle = this.target ? this.store.cycles(this.config).find((c) => c.userId === this.target?.userId) : undefined;
    return {
      simulation: true, now: this.now.toISOString(), timeZone: this.config.timeZone, birthday: this.birthday,
      targetId: this.target?.userId ?? null,
      members: this.members.map((m) => ({ ...m, category: m.category ?? 'gift', role: m.userId === this.config.dmOnlyAdminId ? 'dm-only' : this.config.adminIds?.includes(m.userId) ? 'admin' : 'member',
        hidden: this.channel.hidden.has(m.userId), demoted: this.channel.demoted.has(m.userId) })),
      cycle: cycle ? { ...cycle, participants: this.store.participants(cycle.id) } : null,
      events: [...this.channel.events],
    };
  }
  async start(userId: string) {
    const target = this.members.find((m) => m.userId === userId);
    if (!target) throw new Error('Elegí una persona de la demo.');
    // A new scenario has its own birthday and cycles; no rewrite of the imported roster.
    this.db.exec('DELETE FROM gift_participants; DELETE FROM gift_cycles; DELETE FROM gift_admin_notices; DELETE FROM gift_birthdays;');
    this.target = target;
    this.channel = new DemoGiftChannel(this.config, this.members);
    this.service = new GiftService(this.config, this.store, this.channel);
    const month = Number(target.dayMonth.slice(3));
    const day = Math.min(Number(target.dayMonth.slice(0, 2)), new Date(Date.UTC(2026, month, 0)).getUTCDate());
    const birthday = new Date(Date.UTC(2026, month - 1, day, 15));
    this.birthday = birthday.toISOString().slice(0, 10);
    this.now = new Date(birthday.getTime() - 7 * 86400000);
    this.store.import(this.config.guildId, [target]);
    this.channel.events.push({ kind: 'system', text: `!cumple @${target.username} · Simulamos 7 días antes de su cumpleaños. Cada inicio crea un escenario limpio.` });
    await this.service.tick(this.now);
    if (target.category === 'no-gift') this.channel.events.push({ kind: 'system', text: 'Categoría no-gift: Pepe ignora este cumpleaños. Sin exclusión, convocatoria ni privado.' });
    return this.state();
  }
  async action(action: GiftDemoAction, actorId?: string) {
    if (!this.target) throw new Error('Primero iniciá un cumpleaños de prueba.');
    const id = this.target.userId;
    switch (action) {
      case 'tick': await this.service.tick(this.now); break;
      case 'join': case 'leave': {
        const cycle = this.service.active(id);
        if (!cycle?.messageId || !actorId) throw new Error('Todavía no hay una convocatoria abierta.');
        const count = await this.service.participate(cycle.id, actorId, cycle.messageId, action === 'join');
        this.channel.events.push({ kind: 'system', text: `${this.members.find((m) => m.userId === actorId)?.name}: ${action === 'join' ? '✅ Participo' : 'retiró su participación'}. Total: ${count}.` });
        break;
      }
      case 'restore': {
        const visible = await this.service.restore(id);
        this.channel.events.push({ kind: 'system', text: visible ? 'Organización cerrada. El miembro vuelve a ver el canal y su historial.' : 'Falta devolver manualmente el acceso y los roles; Pepe no los modifica.' });
        break;
      }
      case 'manual-hide': case 'manual-restore':
        if (this.target.category === 'no-gift') throw new Error('Categoría no-gift: no se inicia el flujo.');
        if (!this.config.adminIds?.includes(id) || id === this.config.dmOnlyAdminId) throw new Error('Esta acción corresponde al administrador con exclusión manual.');
        if (action === 'manual-hide') { this.channel.demoted.add(id); this.channel.hidden.add(id); }
        else { this.channel.demoted.delete(id); this.channel.hidden.delete(id); }
        this.channel.events.push({ kind: 'system', text: action === 'manual-hide' ? 'Un humano retiró Administrador y todo acceso al canal (simulado).' : 'Un humano devolvió el acceso y Administrador (simulado). Ahora confirmá la reincorporación.' });
        if (action === 'manual-hide') await this.service.tick(this.now);
        break;
      case 'restart':
        this.service = new GiftService(this.config, new GiftStore(this.db), this.channel);
        await this.service.tick(this.now);
        this.channel.events.push({ kind: 'system', text: 'Servicio reiniciado sobre la misma SQLite en memoria. Sin duplicar convocatorias ni privados.' });
    }
    // Bound the inspection log even when experimenting repeatedly.
    this.channel.events.splice(0, Math.max(0, this.channel.events.length - 100));
    return this.state();
  }
  close() { this.db.close(); }
}
