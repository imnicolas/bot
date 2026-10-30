import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { loadGiftConfig } from '../src/config/gifts.js';
import { dueBirthday, localDay, parseBirthdays } from '../src/features/gifts/birthdays.js';
import { GiftService } from '../src/features/gifts/service.js';
import type { GiftChannel } from '../src/features/gifts/service.js';
import { GiftStore } from '../src/features/gifts/store.js';
import type { GiftCycle, ViewState } from '../src/features/gifts/store.js';
import type { AdminNotice } from '../src/features/gifts/store.js';
import { PrivateMessageRejected } from '../src/features/gifts/admin-notices.js';
import { fixture } from './helpers.js';

const guildId = '100000000000000010';
const channelId = '100000000000000020';
const user = '100000000000000001';
const other = '100000000000000002';
const participant = '100000000000000003';
const config = { guildId, channelId, roleId: '100000000000000030', timeZone: 'America/Montevideo' };
const now = new Date('2026-11-05T12:00:00Z');

class Channel implements GiftChannel {
  views = new Map<string, ViewState>([[user, 1], [other, 1], [participant, 1]]);
  admins = new Set<string>();
  withoutChannelRole = new Set<string>();
  messages = new Map<number, string>();
  privateMessages = new Map<number, string>();
  privateAttempts = 0;
  failPrivate: 'blocked' | 'before' | 'after' | undefined;
  operations: string[] = [];
  failHide = false;
  failRestore = false;
  failSend: 'before' | 'after' | undefined;
  private = true;
  async validate() { if (!this.private) throw new Error('Canal público'); }
  async inspect(id: string) {
    const priorView = this.views.get(id);
    if (priorView === undefined) throw new Error('Miembro no encontrado');
    return { priorView, isAdmin: this.admins.has(id), visible: this.admins.has(id) || (priorView !== -1 && !this.withoutChannelRole.has(id)), canHide: !this.admins.has(id) };
  }
  async hide(id: string) {
    this.views.set(id, -1);
    this.operations.push(`hide:${id}`);
    if (this.failHide) { this.failHide = false; throw new Error('Se perdió respuesta de exclusión'); }
  }
  async isHidden(id: string) { return this.views.get(id) === -1 && !this.admins.has(id); }
  async restore(id: string, view: ViewState) {
    this.operations.push(`restore:${id}`);
    this.views.set(id, view);
    if (this.failRestore) { this.failRestore = false; throw new Error('Se perdió respuesta de reincorporación'); }
    return view !== -1;
  }
  async publish(cycle: GiftCycle) {
    this.operations.push(`publish:${cycle.userId}`);
    const fail = this.failSend;
    this.failSend = undefined;
    if (fail === 'before') throw new Error('Falló envío');
    const id = `20000000000000000${cycle.id}`;
    this.messages.set(cycle.id, id);
    if (fail === 'after') throw new Error('Se perdió respuesta de envío');
    return id;
  }
  async findAnnouncement(cycle: GiftCycle) { return this.messages.get(cycle.id); }
  async canParticipate(id: string) { return (await this.inspect(id)).visible; }
  async sendAdminNotice(notice: AdminNotice) {
    this.privateAttempts++;
    if (notice.userId === notice.recipientId || !this.admins.has(notice.recipientId)) throw new PrivateMessageRejected('No es el otro admin');
    const failure = this.failPrivate;
    this.failPrivate = undefined;
    if (failure === 'blocked') throw new PrivateMessageRejected('DM cerrado');
    if (failure === 'before') throw new Error('Timeout antes del envío');
    const id = `40000000000000000${notice.id}`;
    this.operations.push(`dm:${notice.userId}:${notice.recipientId}`);
    this.privateMessages.set(notice.id, id);
    if (failure === 'after') throw new Error('Respuesta perdida después del envío');
    return id;
  }
  async findAdminNotice(notice: AdminNotice) { return this.privateMessages.get(notice.id); }
}

function setup(t: TestContext) {
  const f = fixture(t);
  const store = new GiftStore(f.db);
  const channel = new Channel();
  const service = new GiftService(config, store, channel);
  store.import(guildId, [{ userId: user, name: 'Persona A', dayMonth: '12/11' }]);
  return { ...f, store, channel, service };
}

function adminSetup(t: TestContext) {
  const f = setup(t);
  f.channel.admins.add(user);
  f.channel.admins.add(other);
  const adminConfig = { ...config, adminIds: [user, other] as const };
  const service = new GiftService(adminConfig, f.store, f.channel);
  return { ...f, adminConfig, service };
}

test('exclusiones pendientes conservan el ID del rol: cambiar configuración no devuelve otro rol', async (t) => {
  const f = setup(t);
  await f.service.tick(now);
  assert.equal(f.service.active(user)?.accessRoleId, config.roleId);
  assert.throws(() => new GiftService({ ...config, roleId: '100000000000000031' }, f.store, f.channel), /otro rol/);
});

test('no-gift: ignora cumpleaños sin inspeccionar, excluir, convocar ni avisar por DM, incluso siendo admin', async (t) => {
  const f = adminSetup(t);
  f.store.import(guildId, [{ userId: user, name: 'Persona excluida', dayMonth: '12/11', category: 'no-gift' }]);
  t.mock.method(f.channel, 'inspect', () => { throw new Error('No debe inspeccionar al excluido'); });
  await f.service.tick(now);
  await new GiftService(f.adminConfig, new GiftStore(f.connect()), f.channel).tick(now);
  assert.deepEqual(f.channel.operations, []);
  assert.equal(f.channel.privateAttempts, 0);
  assert.deepEqual(f.store.cycles(config), []);
  await assert.rejects(f.service.retryAnnouncement(user, now), /no-gift/);
  assert.throws(() => f.store.prepare(config, { userId: user, name: 'Persona excluida', dayMonth: '12/11' }, '2026-11-12', 0), /no-gift/);
});

test('no-gift: puede colaborar en regalos de otros; no altera la selección de los elegibles', async (t) => {
  const f = setup(t);
  f.store.import(guildId, [{ userId: other, name: 'Sin regalo', dayMonth: '12/11', category: 'no-gift' }]);
  await f.service.tick(now);
  const cycle = f.service.active(user)!;
  assert.equal(f.store.cycles(config).length, 1);
  assert.equal(await f.service.participate(cycle.id, other, cycle.messageId!, true), 1);
  assert.ok(!f.channel.operations.includes(`hide:${other}`));
});

test('no-gift: exige cerrar exclusiones antes de reclasificar, sin dejar miembros ocultos ni escrituras parciales', async (t) => {
  const f = setup(t);
  await f.service.tick(now);
  assert.throws(() => f.store.import(guildId, [
    { userId: other, name: 'No debe guardarse', dayMonth: '13/11' },
    { userId: user, name: 'Persona A', dayMonth: '12/11', category: 'no-gift' },
  ]), /Reincorporá/);
  assert.equal(f.store.category(guildId, user), 'gift');
  assert.equal(f.store.category(guildId, other), undefined);
  await f.service.restore(user);
  f.store.import(guildId, [{ userId: user, name: 'Persona A', dayMonth: '12/11', category: 'no-gift' }]);
  await f.service.tick(new Date('2027-11-05T12:00:00Z'));
  assert.equal(f.channel.messages.size, 1);
});

test('cumpleaños de ambos admins: DM sólo al contrario, sin permisos ni convocatoria compartida, una vez por año', async (t) => {
  const f = adminSetup(t);
  f.store.import(guildId, [{ userId: other, name: 'Admin B', dayMonth: '12/11' }]);
  f.channel.private = false; // Private reminders must work even if channel validation cannot pass.
  await f.service.tick(new Date('2026-11-04T12:00:00Z'));
  assert.equal(f.channel.privateAttempts, 0);
  await f.service.tick(now);
  assert.deepEqual(f.channel.operations, [`dm:${user}:${other}`, `dm:${other}:${user}`]);
  assert.equal(f.channel.messages.size, 0);
  assert.equal(f.store.cycles(config).length, 0);
  assert.equal(f.store.adminNotice(guildId, user, '2026-11-12')?.state, 'sent');
  f.db.close();
  const restarted = new GiftService(f.adminConfig, new GiftStore(f.connect()), f.channel);
  await restarted.tick(new Date('2026-11-07T12:00:00Z'));
  assert.equal(f.channel.privateAttempts, 2);
  await restarted.tick(new Date('2027-11-05T12:00:00Z'));
  assert.equal(f.channel.privateAttempts, 4);
  assert.equal(f.channel.messages.size, 0);
});

test('DM cerrado: backoff persistente de 6 horas y sin revelar la sorpresa ni frenar regalos de miembros comunes', async (t) => {
  t.mock.method(console, 'error', () => {});
  const f = adminSetup(t);
  f.store.import(guildId, [{ userId: participant, name: 'Miembro común', dayMonth: '12/11' }]);
  f.channel.failPrivate = 'blocked';
  await f.service.tick(now);
  assert.equal(f.store.adminNotice(guildId, user, '2026-11-12')?.state, 'pending');
  assert.equal(f.channel.messages.size, 1);
  assert.ok(f.channel.operations.includes(`publish:${participant}`));
  assert.ok(!f.channel.operations.includes(`publish:${user}`));
  await new GiftService(f.adminConfig, new GiftStore(f.connect()), f.channel).tick(new Date(now.getTime() + 5 * 3600000));
  assert.equal(f.channel.privateAttempts, 1);
  await f.service.tick(new Date(now.getTime() + 6 * 3600000));
  assert.equal(f.channel.privateAttempts, 2);
  assert.equal(f.store.adminNotice(guildId, user, '2026-11-12')?.state, 'sent');
});

test('DM con respuesta perdida: recupera el mensaje tras reinicio; si no aparece, nunca reenvía a ciegas', async (t) => {
  t.mock.method(console, 'error', () => {});
  const f = adminSetup(t);
  f.channel.failPrivate = 'after';
  await f.service.tick(now);
  assert.equal(f.store.adminNotice(guildId, user, '2026-11-12')?.state, 'uncertain');
  await new GiftService(f.adminConfig, new GiftStore(f.connect()), f.channel).tick(now);
  assert.equal(f.store.adminNotice(guildId, user, '2026-11-12')?.state, 'sent');
  assert.equal(f.channel.privateAttempts, 1);
  f.channel.failPrivate = 'before';
  const nextYear = new Date('2027-11-05T12:00:00Z');
  await f.service.tick(nextYear);
  await f.service.tick(nextYear);
  await f.service.tick(new Date(nextYear.getTime() + 6 * 3600000));
  assert.equal(f.channel.privateAttempts, 2);
  assert.equal(f.store.adminNotice(guildId, user, '2027-11-12')?.state, 'uncertain');
  assert.equal(f.channel.messages.size, 0);
});

test('administrador destinatario sin privilegios: no manda el privado a otra persona ni al canal', async (t) => {
  t.mock.method(console, 'error', () => {});
  const f = adminSetup(t);
  f.channel.admins.delete(other);
  await f.service.tick(now);
  assert.equal(f.channel.privateMessages.size, 0);
  assert.equal(f.channel.messages.size, 0);
  assert.equal(f.store.cycles(config).length, 0);
  assert.equal(f.store.adminNotice(guildId, user, '2026-11-12')?.state, 'pending');
});

test('admin: sólo convoca tras retirar manualmente Administrador y todo acceso, sin tocar roles ni sobrescrituras', async (t) => {
  const f = adminSetup(t);
  await f.service.tick(now);
  f.channel.views.set(user, -1); // Denying ViewChannel alone cannot hide an Administrator.
  await f.service.tick(now);
  assert.equal(f.channel.messages.size, 0);
  f.channel.admins.delete(user);
  f.channel.views.set(user, 0); // Still has a role that grants channel access.
  await f.service.tick(now);
  assert.equal(f.channel.messages.size, 0);
  f.channel.withoutChannelRole.add(user); // A human removes the final channel access.
  await f.service.tick(now);
  const cycle = f.service.active(user)!;
  assert.equal(cycle.exclusionMode, 'manual');
  assert.equal(cycle.priorView, 0, 'Manual exclusion may come from roles without an explicit member deny.');
  assert.equal(cycle.state, 'announced');
  assert.equal(f.channel.messages.size, 1);
  assert.equal(f.channel.privateAttempts, 1);
  assert.deepEqual(f.channel.operations, [`dm:${user}:${other}`, `publish:${user}`]);
  const restarted = new GiftService(f.adminConfig, new GiftStore(f.connect()), f.channel);
  await restarted.tick(now);
  assert.equal(f.channel.messages.size, 1);
  assert.equal(await restarted.restore(user), false, 'Pepe never undoes a manual exclusion.');
  assert.equal(f.store.get(cycle.id)?.state, 'announced');
  f.channel.withoutChannelRole.delete(user);
  f.channel.admins.add(user); // Humans restore access and privileges themselves.
  await assert.rejects(restarted.tick(now), /falta confirmar la exclusión/);
  assert.equal(await restarted.restore(user), true);
  assert.equal(f.store.get(cycle.id)?.state, 'restored');
  await restarted.tick(now);
  assert.equal(f.channel.messages.size, 1);
  assert.ok(f.channel.operations.every((op) => !op.startsWith('hide:') && !op.startsWith('restore:')));
});

test('admin ocultado manualmente: revalida el acceso antes de recuperar un envío incierto', async (t) => {
  const f = adminSetup(t);
  await f.service.tick(now);
  f.channel.admins.delete(user);
  f.channel.withoutChannelRole.add(user);
  f.channel.failSend = 'before';
  await assert.rejects(f.service.tick(now), /Falló envío/);
  assert.equal(f.service.active(user)?.exclusionMode, 'manual');
  f.channel.admins.add(user);
  await assert.rejects(f.service.retryAnnouncement(user, now), /falta confirmar la exclusión/);
  assert.equal(f.channel.messages.size, 0);
  f.channel.admins.delete(user);
  await f.service.retryAnnouncement(user, now);
  const cycle = f.service.active(user)!;
  assert.equal(await f.service.participate(cycle.id, other, cycle.messageId!, true), 1);
  assert.equal(f.channel.messages.size, 1);
});

test('admin sólo por privado: nunca convoca ni excluye, incluso si pierde acceso al canal', async (t) => {
  const f = adminSetup(t);
  const privateConfig = { ...f.adminConfig, dmOnlyAdminId: user };
  const service = new GiftService(privateConfig, f.store, f.channel);
  await service.tick(now);
  assert.equal(f.channel.privateMessages.size, 1);
  f.channel.admins.delete(user);
  f.channel.withoutChannelRole.add(user);
  await service.tick(now);
  await new GiftService(privateConfig, new GiftStore(f.connect()), f.channel).tick(now);
  assert.equal(f.channel.privateAttempts, 1);
  assert.equal(f.channel.messages.size, 0);
  assert.equal(service.active(user), undefined);
  assert.deepEqual(f.channel.operations, [`dm:${user}:${other}`]);
  await assert.rejects(service.retryAnnouncement(user, now), /sólo tiene aviso privado/);
});

test('regalos apagados por defecto; activación exige IDs y zona válidos', () => {
  assert.equal(loadGiftConfig({}), undefined);
  assert.equal(loadGiftConfig({ FEATURE_GIFTS_ENABLED: 'false', GIFTS_TIME_ZONE: 'no' }), undefined);
  assert.throws(() => loadGiftConfig({ FEATURE_GIFTS_ENABLED: 'yes' }), /true o false/);
  assert.throws(() => loadGiftConfig({ FEATURE_GIFTS_ENABLED: 'true' }), /válidos/);
  const env = { FEATURE_GIFTS_ENABLED: 'true', GIFTS_GUILD_ID: guildId, GIFTS_CHANNEL_ID: channelId, GIFTS_ROLE_ID: config.roleId };
  assert.deepEqual(loadGiftConfig(env), { ...config, protectedChannelIds: [channelId] });
  assert.throws(() => loadGiftConfig({ ...env, GIFTS_TIME_ZONE: 'no' }), /zona horaria/);
  assert.deepEqual(loadGiftConfig({ ...env, GIFTS_ADMIN_IDS: `${user}, ${other}` })?.adminIds, [user, other]);
  assert.equal(loadGiftConfig({ ...env, GIFTS_ADMIN_IDS: `${user},${other}`, GIFTS_DM_ONLY_ADMIN_ID: other })?.dmOnlyAdminId, other);
  assert.throws(() => loadGiftConfig({ ...env, GIFTS_DM_ONLY_ADMIN_ID: user }), /requiere GIFTS_ADMIN_IDS/);
  assert.throws(() => loadGiftConfig({ ...env, GIFTS_ADMIN_IDS: `${user},${other}`, GIFTS_DM_ONLY_ADMIN_ID: participant }), /uno de los dos/);
  for (const value of [user, `${user},${user}`, `${user},bot`, `${user},${other},${participant}`]) {
    assert.throws(() => loadGiftConfig({ ...env, GIFTS_ADMIN_IDS: value }), /dos IDs distintos/);
  }
});

test('CSV: IDs sin perder precisión, BOM, CRLF, comillas, cabecera normalizada y DD/MM', () => {
  assert.deepEqual(parseBirthdays(`\uFEFFuser_id,nombre,fecha cumple\r\n${user},"Persona, A",29/02\r\n`), [{ userId: user, name: 'Persona, A', dayMonth: '29/02' }]);
  for (const row of [`${user},Ana,31/04`, `${user},Ana,1/11`, `${user},Ana,00/01`, `${user},Ana,12/11/1990`, `1e18,Ana,12/11`, `${user},,12/11`, `${user},Ana,12/11\n${user},Ana,13/11`]) {
    assert.throws(() => parseBirthdays(`user_id,nombre,fecha cumple\n${row}`));
  }
  assert.throws(() => parseBirthdays('user_id,nombre,nombre\n1,A,B'), /Cabecera/);
  assert.throws(() => parseBirthdays('user_id,nombre,fecha cumple\n'), /entre 1 y 1000/);
});

test('calendario: exactamente 7 días, fin de año, recuperación y 29/02', () => {
  assert.equal(dueBirthday('12/11', '2026-11-04'), undefined);
  assert.equal(dueBirthday('12/11', '2026-11-05'), '2026-11-12');
  assert.equal(dueBirthday('12/11', '2026-11-12'), '2026-11-12');
  assert.equal(dueBirthday('12/11', '2026-11-13'), undefined);
  assert.equal(dueBirthday('03/01', '2026-12-27'), '2027-01-03');
  assert.equal(dueBirthday('03/01', '2026-12-26'), undefined);
  assert.equal(dueBirthday('29/02', '2027-02-21'), '2027-02-28');
  assert.equal(dueBirthday('29/02', '2028-02-21'), undefined);
  assert.equal(dueBirthday('29/02', '2028-02-22'), '2028-02-29');
  assert.equal(localDay(new Date('2026-11-05T02:59:59Z'), config.timeZone), '2026-11-04');
  assert.equal(localDay(new Date('2026-11-05T03:00:00Z'), config.timeZone), '2026-11-05');
});

test('excluye todos los cumpleaños superpuestos antes de convocar; reinicio sin duplicados', async (t) => {
  const f = setup(t);
  f.store.import(guildId, [{ userId: other, name: 'Persona B', dayMonth: '10/11' }]);
  await f.service.tick(now);
  assert.deepEqual(f.channel.operations, [`hide:${user}`, `hide:${other}`, `publish:${user}`, `publish:${other}`]);
  f.db.close();
  const store = new GiftStore(f.connect());
  const restarted = new GiftService(config, store, f.channel);
  await restarted.tick(new Date('2026-11-07T12:00:00Z'));
  assert.equal(f.channel.messages.size, 2);
  assert.equal(f.channel.operations.length, 4);
  assert.equal(await restarted.restore(user), true);
  assert.equal(f.channel.views.get(user), 1);
  assert.equal(await restarted.restore(other), true);
  assert.equal(f.channel.views.get(other), 1);
  await restarted.tick(new Date('2026-11-12T12:00:00Z'));
  assert.equal(f.channel.views.get(user), 1, 'No vuelve a excluir un ciclo reincorporado manualmente.');
  await assert.rejects(restarted.restore(user), /no tiene una exclusión/);
});

test('el cumpleaños no reincorpora automáticamente y una exclusión pendiente bloquea el siguiente año', async (t) => {
  const f = setup(t);
  await f.service.tick(new Date('2026-11-10T12:00:00Z'));
  await f.service.tick(new Date('2026-11-13T12:00:00Z'));
  await f.service.tick(new Date('2027-11-07T12:00:00Z'));
  assert.equal(f.channel.views.get(user), -1);
  assert.equal(f.store.cycles(config).length, 1);
});

test('un canal público, miembro ausente o administrador bloquea toda convocatoria', async (t) => {
  const f = setup(t);
  f.channel.private = false;
  await assert.rejects(f.service.tick(now), /público/);
  f.channel.private = true;
  f.store.import(guildId, [{ userId: other, name: 'Admin', dayMonth: '10/11' }]);
  f.channel.admins.add(other);
  await assert.rejects(f.service.tick(now), /no se puede excluir/);
  assert.equal(f.channel.messages.size, 0);
  // Manual retry must not bypass exclusion of another due birthday.
  await assert.rejects(f.service.retryAnnouncement(user, now), /no se puede excluir/);
  f.channel.admins.clear();
  f.channel.views.delete(other);
  await assert.rejects(f.service.tick(now), /no encontrado/);
  assert.equal(f.channel.messages.size, 0);
});

test('recupera una exclusión incompleta manteniendo el permiso original', async (t) => {
  const f = setup(t);
  f.channel.failHide = true;
  await assert.rejects(f.service.tick(now), /exclusión/);
  assert.equal(f.store.cycles(config)[0]?.state, 'prepared');
  assert.equal(f.channel.messages.size, 0);
  await new GiftService(config, new GiftStore(f.connect()), f.channel).tick(now);
  assert.equal(f.channel.messages.size, 1);
  await f.service.restore(user);
  assert.equal(f.channel.views.get(user), 1);
});

test('reconcilia envíos ambiguos tras reinicio; sin mensaje no reenvía automáticamente', async (t) => {
  const f = setup(t);
  f.channel.failSend = 'after';
  await assert.rejects(f.service.tick(now), /envío/);
  assert.equal(f.store.cycles(config)[0]?.state, 'publishing');
  await new GiftService(config, new GiftStore(f.connect()), f.channel).tick(now);
  assert.equal(f.store.cycles(config)[0]?.state, 'announced');
  assert.equal(f.channel.operations.filter((op) => op.startsWith('publish')).length, 1);
  await f.service.restore(user);
  f.channel.failSend = 'before';
  const nextYear = new Date('2027-11-07T12:00:00Z');
  await assert.rejects(f.service.tick(nextYear), /envío/);
  await assert.rejects(f.service.tick(nextYear), /publicación incierta/);
  await assert.rejects(f.service.tick(nextYear), /publicación incierta/);
  assert.equal(f.channel.operations.filter((op) => op.startsWith('publish')).length, 2);
  await f.service.retryAnnouncement(user, nextYear);
  assert.equal(f.channel.messages.size, 2);
});

test('participación idempotente y persistente; rechaza cumpleañero, mensaje o servidor ajeno y ciclo cerrado', async (t) => {
  const f = setup(t);
  await f.service.tick(now);
  const cycle = f.store.cycles(config)[0]!;
  const id = cycle.messageId!;
  assert.equal(await f.service.participate(cycle.id, participant, id, true), 1);
  assert.equal(await f.service.participate(cycle.id, participant, id, true), 1);
  assert.deepEqual(new GiftStore(f.connect()).participants(cycle.id), [participant]);
  assert.equal(await f.service.participate(cycle.id, participant, id, false), 0);
  assert.equal(await f.service.participate(cycle.id, participant, id, false), 0);
  await assert.rejects(f.service.participate(cycle.id, user, id, true), /cerrada/);
  await assert.rejects(f.service.participate(cycle.id, participant, 'fake', true), /cerrada/);
  const elsewhere = new GiftService({ ...config, guildId: '200000000000000010' }, f.store, f.channel);
  await assert.rejects(elsewhere.participate(cycle.id, participant, id, true), /cerrada/);
  f.channel.views.set(participant, -1);
  await assert.rejects(f.service.participate(cycle.id, participant, id, true), /cerrada/);
  await f.service.restore(user);
  await assert.rejects(f.service.participate(cycle.id, other, id, true), /cerrada/);
});

test('recupera una reincorporación manual interrumpida y conserva los cumpleaños omitidos del próximo CSV', async (t) => {
  const f = setup(t);
  await f.service.tick(now);
  f.channel.failRestore = true;
  await assert.rejects(f.service.restore(user), /reincorporación/);
  assert.equal(f.store.cycles(config)[0]?.state, 'restoring');
  await new GiftService(config, new GiftStore(f.connect()), f.channel).tick(now);
  assert.equal(f.store.cycles(config)[0]?.state, 'restored');
  assert.equal(f.channel.views.get(user), 1);
  assert.throws(() => f.store.import(guildId, parseBirthdays(`user_id,nombre,fecha cumple\n${other},B,13/11\n${user},A,99/99`)));
  assert.equal(f.store.birthdays(guildId).length, 1);
  f.store.import(guildId, [{ userId: other, name: 'B', dayMonth: '13/11' }]);
  assert.equal(f.store.birthdays(guildId).length, 2);
  assert.equal(f.store.birthdays('200000000000000010').length, 0);
});
