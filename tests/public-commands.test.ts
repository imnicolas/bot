import assert from 'node:assert/strict';
import { test } from 'node:test';
import { commandCatalog, executeCommand } from '../src/commands/registry.js';
import type { CommandContext, MemberProfile } from '../src/commands/types.js';
import { toDiscordReply } from '../src/discord/messages.js';
import { fixture } from './helpers.js';

const members: readonly MemberProfile[] = [
  { id: '101', displayName: 'Lucía' },
  { id: '102', displayName: 'Nico', avatarUrl: 'https://cdn.discordapp.com/embed/avatars/1.png' },
];

test('los siete comandos son públicos para cualquier miembro sin roles especiales', (t) => {
  const { levels } = fixture(t);
  const catalog = commandCatalog();
  assert.deepEqual(
    catalog.map((c) => c.name),
    ['grupo comando', 'desayuno', 'almuerzo', 'cena', 'nivel', 'ranking', 'ayuda'],
  );
  assert.ok(catalog.every((command) => command.access === 'public'));
  for (const userId of ['101', '102']) {
    const context: CommandContext = { levels, userId, guildId: '1', random: () => 0, members };
    for (const command of catalog) {
      const reply = executeCommand(command.name, context);
      assert.ok(reply, `${command.name} debe responder para ${userId}`);
      assert.ok(reply.content.length <= 2000);
    }
  }
});

test('nivel de otro miembro consulta XP sin notificarlo y valida el destinatario', (t) => {
  const { levels } = fixture(t);
  const context: CommandContext = { levels, userId: '101', guildId: '1', random: () => 0, members };
  levels.award('1', '102', 0, 25);
  const reply = executeCommand('!RÁNK <@!102>', context);
  assert.ok(reply);
  assert.match(reply.content, /<@102>/);
  assert.equal(reply.card?.title, 'Nivel de Nico');
  assert.equal(reply.card?.fields?.find((f) => f.name === 'Experiencia')?.value, '25 XP');
  assert.deepEqual(toDiscordReply(reply, '101').allowedMentions?.users, []);
  for (const invalid of ['<@999>', '@everyone', '<@&102>']) {
    assert.match(
      executeCommand(`nivel ${invalid}`, context)?.content ?? '',
      /Mencioná a un miembro/,
    );
  }
});

test('los comandos retirados y sus alias dejan de ejecutarse', (t) => {
  const { levels } = fixture(t);
  const context: CommandContext = { levels, userId: '101', guildId: '1', random: () => 0 };
  for (const command of [
    'hola',
    'buenas',
    'loteria',
    'lotería',
    'saldo',
    'perfil',
    'rep <@102>',
    'avatar',
    'user',
    'usuario',
    'server',
    'servidor',
    'dado',
    'roll 2d6',
    'ping',
    'decir hola',
  ]) {
    assert.equal(executeCommand(command, context), undefined, command);
    assert.equal(executeCommand(`!${command}`, context), undefined, `!${command}`);
  }
});
