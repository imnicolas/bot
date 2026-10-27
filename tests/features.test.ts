import assert from 'node:assert/strict';
import { test } from 'node:test';
import { commandCatalog, executeCommand } from '../src/commands/registry.js';
import { handleMessage } from '../src/discord/messages.js';
import { DemoSession } from '../src/preview/session.js';
import { fixture } from './helpers.js';

test('rank deshabilitado oculta comandos, ignora aliases y pausa XP sin borrar datos', async (t) => {
  const { levels } = fixture(t);
  for (const [index, xp] of [25, 25, 25, 20].entries()) levels.award('1', '2', index * 60_000, xp);
  const context = { levels, guildId: '1', userId: '2', random: () => 0 };
  assert.ok(commandCatalog().every((c) => c.category !== 'progress'));
  assert.doesNotMatch(executeCommand('ayuda', context)?.content ?? '', /ranking|nivel|rank/);
  for (const content of ['rank', '!rank <@2>', 'ranking texto', 'top', 'niveles', 'nivel', 'Una conversación normal']) {
    await handleMessage({ author: { id: '2', bot: false }, guildId: '1', webhookId: null,
      system: false, content, reply: async () => assert.fail('No debe responder ni avisar nivel.') }, { levels });
  }
  assert.equal(levels.profile('1', '2').xp, 95);
  const demo = new DemoSession();
  t.after(() => demo.close());
  assert.equal((await demo.send('101', 'ranking')).replies.length, 0);
  assert.ok(demo.state().commands.every((c) => c.category !== 'progress'));
});

test('cada feature filtra ejecución, aliases y ayuda; comandos apagados nunca dan XP', async (t) => {
  const { levels } = fixture(t);
  const features = { social: false, meals: false, levels: true };
  const context = { levels, features, guildId: '1', userId: '2', random: () => 0 };
  assert.deepEqual(commandCatalog(features).map((c) => c.name), ['nivel', 'ranking', 'ayuda']);
  assert.doesNotMatch(executeCommand('ayuda', context)?.content ?? '', /desayuno|mate|GIFs/);
  for (const content of ['mate?', '!café', 'buen día', 'ban?', 'aluerzo?', 'lamuerzo?', 'grupo comando?']) {
    assert.equal(executeCommand(content, context), undefined);
    await handleMessage({ author: { id: '2', bot: false }, guildId: '1', webhookId: null,
      system: false, content, reply: async () => assert.fail('Feature apagada.') }, { levels, features });
  }
  assert.equal(levels.profile('1', '2').xp, 0);
  assert.ok(executeCommand('nivel', context));
  assert.ok(commandCatalog({ social: true, meals: false, levels: false }).some((c) => c.name === 'mate'));
  assert.ok(commandCatalog({ social: false, meals: true, levels: false }).some((c) => c.name === 'desayuno'));
  assert.deepEqual(commandCatalog({ social: false, meals: false, levels: false }).map((c) => c.name), ['ayuda']);
});
