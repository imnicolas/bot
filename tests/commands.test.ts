import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { executeCommand } from '../src/commands/registry.js';
import type { CommandContext } from '../src/commands/types.js';
import { toDiscordReply } from '../src/discord/messages.js';
import { fixture } from './helpers.js';

function context(t: TestContext, randomIndex = 0): CommandContext {
  const services = fixture(t);
  return {
    userId: '123',
    guildId: '456',
    random: () => randomIndex,
    levels: services.levels,
  };
}

test('las variantes naturales y el alias aluerzo llegan al mismo comando', (t) => {
  const ctx = context(t);
  for (const variant of ['almuerzo?', 'ALUERZO?', ' !almuerzo ', 'almuerzo', 'Álmuerzo?']) {
    assert.equal(
      executeCommand(variant, ctx)?.content,
      '¿Almuerzo, <@123>? Sale una milanesa con fritas.',
    );
  }
  assert.match(executeCommand(' grupo   comando? ', ctx)?.content ?? '', /Grupo comando presente/);
  for (const command of ['desayuno?', 'cena?', 'nivel', '!ranking']) {
    assert.ok(executeCommand(command, ctx));
  }
});

test('la conversación común no dispara reacciones ni eco accidental', (t) => {
  const ctx = context(t);
  for (const text of [
    'ayer dije hola',
    'chocolate',
    '¿qué hay para cena?',
    'desayuno mañana',
    'decir',
    '!desconocido',
  ]) {
    assert.equal(executeCommand(text, ctx), undefined);
  }
});

test('las respuestas de desayuno varían y permiten mencionar sólo al autor', (t) => {
  const first = executeCommand('desayuno?', context(t, 0));
  const second = executeCommand('desayuno?', context(t, 1));
  assert.ok(first);
  assert.ok(second);
  assert.notEqual(first.content, second.content);
  assert.match(first.content, /llegaste tarde paps, <@123>/);
  const payload = toDiscordReply(first, '123');
  assert.deepEqual(payload.allowedMentions, { parse: [], users: ['123'], repliedUser: false });
  assert.match(first.gif ?? '', /^https:\/\//);
  assert.equal(payload.embeds?.length, 1);
});

test('ranking vacío y ayuda explican cómo empezar', (t) => {
  const ctx = context(t);
  assert.match(executeCommand('ranking', ctx)?.content ?? '', /Todavía no hay XP/);
  for (const alias of ['ayuda', '!help', 'comandos?']) {
    const content = executeCommand(alias, ctx)?.content ?? '';
    for (const command of [
      'grupo comando',
      'desayuno',
      'almuerzo',
      'cena',
      'nivel',
      'ranking',
      'ayuda',
    ]) {
      assert.ok(content.includes(command));
    }
    assert.doesNotMatch(content, /loteria|rep |perfil|dado|ping|decir/);
  }
});
