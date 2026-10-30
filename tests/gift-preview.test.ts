import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GiftDemoSession, giftDemoMembers, giftDemoConfig } from '../src/preview/gifts.js';
import { loadGiftTestConfig } from '../src/config/gift-test.js';
import { isGiftTestCommand } from '../src/discord/gift-test.js';

const [person, admin, owner, participant] = giftDemoMembers;
assert.ok(person && admin && owner && participant);

test('sandbox no-gift: se conserva en el padrón, sin flujo aunque se fuerce inicio o reinicio', async (t) => {
  const excluded = { ...admin, category: 'no-gift' as const };
  const demo = new GiftDemoSession([person, excluded, owner, participant]);
  t.after(() => demo.close());
  let state = await demo.start(excluded.userId);
  assert.equal(state.cycle, null);
  assert.ok(state.events.every((e) => e.kind === 'system'));
  state = await demo.action('restart');
  assert.equal(state.members.find((m) => m.userId === excluded.userId)?.category, 'no-gift');
  assert.ok(state.events.every((e) => e.kind === 'system'));
  await assert.rejects(demo.action('manual-hide'), /no-gift/);
});

test('sandbox: flujo real, adhesiones idempotentes, permisos y cierre tras reiniciar', async (t) => {
  const demo = new GiftDemoSession(); t.after(() => demo.close());
  const started = await demo.start(person.userId);
  assert.equal(started.now.slice(0, 10), '2026-11-05');
  assert.equal(started.cycle?.state, 'announced');
  assert.equal(started.members.find((m) => m.userId === person.userId)?.hidden, true);
  assert.equal(started.events.filter((e) => e.kind === 'dm').length, 0);
  await assert.rejects(demo.action('join', person.userId), /cerrada/);
  await assert.rejects(demo.action('join', 'outsider'), /persona/);
  await demo.action('join', participant.userId);
  await demo.action('join', participant.userId);
  let state = await demo.action('restart');
  assert.deepEqual(state.cycle?.participants, [participant.userId]);
  assert.equal(state.events.filter((e) => e.kind === 'channel').length, 1);
  await demo.action('leave', participant.userId);
  state = await demo.action('restore');
  assert.equal(state.cycle?.state, 'restored');
  assert.equal(state.members.find((m) => m.userId === person.userId)?.hidden, false);
  await assert.rejects(demo.action('join', participant.userId), /convocatoria/);
  await demo.action('tick');
  assert.equal(demo.state().events.filter((e) => e.kind === 'channel').length, 1);
});

test('sandbox admin: privado al contrario y convocatoria sólo tras exclusión humana', async (t) => {
  const demo = new GiftDemoSession(); t.after(() => demo.close());
  let state = await demo.start(admin.userId);
  assert.equal(state.cycle, null);
  assert.equal(state.events.find((e) => e.kind === 'dm')?.recipientId, owner.userId);
  await demo.action('restart');
  assert.equal(demo.state().events.filter((e) => e.kind === 'dm').length, 1);
  state = await demo.action('manual-hide');
  assert.equal(state.cycle?.exclusionMode, 'manual');
  assert.equal(state.cycle.state, 'announced');
  state = await demo.action('restore');
  assert.equal(state.cycle?.state, 'announced', 'Pepe no devuelve privilegios manuales.');
  await demo.action('manual-restore');
  state = await demo.action('restore');
  assert.equal(state.cycle?.state, 'restored');
});

test('sandbox admin B: sólo privado al admin A y sin convocatoria ni exclusión', async (t) => {
  const demo = new GiftDemoSession(); t.after(() => demo.close());
  await demo.start(owner.userId);
  await demo.action('tick');
  const state = await demo.action('restart');
  const dms = state.events.filter((e) => e.kind === 'dm');
  assert.equal(dms.length, 1); assert.equal(dms[0]?.recipientId, admin.userId);
  assert.match(dms[0]?.text ?? '', /WhatsApp/);
  assert.equal(state.cycle, null);
  assert.equal(state.events.filter((e) => e.kind === 'channel').length, 0);
  await assert.rejects(demo.action('manual-hide'), /exclusión manual/);
});

test('sandbox: escenario nuevo limpia el anterior, instancias independientes y cambio de año', async (t) => {
  const demo = new GiftDemoSession(); const other = new GiftDemoSession();
  t.after(() => { demo.close(); other.close(); });
  await demo.start(person.userId);
  const state = await demo.start(participant.userId);
  assert.equal(state.now.slice(0, 10), '2025-12-27');
  assert.equal(state.members.find((m) => m.userId === person.userId)?.hidden, false);
  assert.equal(state.events.filter((e) => e.kind === 'channel').length, 1);
  assert.equal(other.state().cycle, null);
  await assert.rejects(demo.start('unknown'), /persona/);
  assert.equal(demo.state().targetId, participant.userId);
});

test('comando temporal desactivado por defecto, independiente del scheduler y requiere canal propio', () => {
  assert.equal(loadGiftTestConfig({ FEATURE_GIFTS_ENABLED: 'true' }), undefined);
  assert.throws(() => loadGiftTestConfig({ GIFTS_TEST_COMMAND_ENABLED: 'yes' }), /true o false/);
  assert.throws(() => loadGiftTestConfig({ GIFTS_TEST_COMMAND_ENABLED: 'true' }), /CHANNEL/);
  const env = { FEATURE_GIFTS_ENABLED: 'false', GIFTS_TEST_COMMAND_ENABLED: 'true',
    GIFTS_GUILD_ID: giftDemoConfig.guildId, GIFTS_ROLE_ID: giftDemoConfig.roleId, GIFTS_TEST_CHANNEL_ID: giftDemoConfig.channelId };
  assert.equal(loadGiftTestConfig(env)?.channelId, giftDemoConfig.channelId);
  assert.equal(isGiftTestCommand(' !cumple <@100000000000000001> '), true);
  assert.equal(isGiftTestCommand('!cumpleaños'), false);
});
