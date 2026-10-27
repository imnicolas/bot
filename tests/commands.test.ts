import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { TestContext } from 'node:test';
import { commandCatalog, executeCommand } from '../src/commands/registry.js';
import type { CommandContext } from '../src/commands/types.js';
import { reactions } from '../src/content/reactions.js';
import { toDiscordReply } from '../src/discord/messages.js';
import { fixture } from './helpers.js';

function context(t: TestContext): CommandContext {
  const services = fixture(t);
  return {
    userId: '123',
    guildId: '456',
    random: () => 0,
    levels: services.levels,
    features: services.features,
  };
}

test('las variantes naturales y los alias aluerzo y lamuerzo llegan al mismo comando', (t) => {
  const ctx = context(t);
  const expected = executeCommand('almuerzo', ctx);
  assert.ok(expected);
  for (const variant of ['almuerzo?', 'ALUERZO?', 'lamuerzo?', ' !almuerzo ', 'almuerzo', 'Álmuerzo?']) {
    assert.deepEqual(executeCommand(variant, ctx), expected);
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

test('cada comida tiene un resultado ganador y dos perdedores, con sus variantes y GIFs', (t) => {
  const base = context(t);
  for (const meal of ['desayuno', 'almuerzo', 'cena'] as const) {
    const catalog = reactions[meal];
    const losingGifs = new Set<string>(catalog.lose.map((reaction) => reaction.gif));
    assert.ok(catalog.win.every((reaction) => !losingGifs.has(reaction.gif)));
    for (const userId of ['123', '987654321']) {
      for (const [ticket, outcome] of (['win', 'lose', 'lose'] as const).entries()) {
        for (const [variant, expected] of catalog[outcome].entries()) {
          const draws = [ticket, variant];
          const ranges: number[] = [];
          const reply = executeCommand(meal, {
            ...base,
            userId,
            random: (length) => {
              ranges.push(length);
              const draw = draws.shift();
              assert.notEqual(draw, undefined, 'Sólo se sortea resultado y variante.');
              assert.ok(draw !== undefined && draw >= 0 && draw < length);
              return draw;
            },
          });
          assert.ok(reply);
          assert.deepEqual(ranges, [3, catalog[outcome].length]);
          assert.equal(draws.length, 0);
          assert.equal(reply.content, expected.text.replaceAll('{user}', `<@${userId}>`));
          assert.equal(reply.gif, expected.gif);
          assert.match(reply.gif, /^https:\/\//);
          const payload = toDiscordReply(reply, userId);
          assert.deepEqual(payload.allowedMentions, { parse: [], users: [userId], repliedUser: false });
          assert.equal(payload.embeds?.length, 1);
        }
      }
      assert.equal(base.levels.profile(base.guildId, userId).xp, 0);
    }
    assert.match(
      commandCatalog().find((command) => command.name === meal)?.description ?? '',
      /1 en 3/,
    );
  }
});

test('grupo comando siempre responde y sólo sortea su variante', (t) => {
  const ranges: number[] = [];
  const reply = executeCommand('grupo comando?', {
    ...context(t),
    random: (length) => {
      ranges.push(length);
      return length - 1;
    },
  });
  const expected = reactions.grupo.at(-1);
  assert.ok(expected);
  assert.equal(reply?.content, expected.text.replaceAll('{user}', '<@123>'));
  assert.equal(reply?.gif, expected.gif);
  assert.deepEqual(ranges, [reactions.grupo.length]);
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
