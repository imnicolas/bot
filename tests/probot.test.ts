import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { normalizeCommand, executeCommand } from '../src/commands/registry.js';
import { probotMedia, probotAssetBase } from '../src/content/probot.js';
import { toDiscordReply } from '../src/discord/messages.js';
import { fixture } from './helpers.js';

test('catálogo de ProBot conserva comandos y originales; sólo mate y pala tienen reemplazos', (t) => {
  const source = readFileSync(new URL('../docs/probot-commands.txt', import.meta.url), 'utf8').trim().split(/\n\s*\n/);
  const { levels } = fixture(t);
  assert.deepEqual(probotMedia.map((m) => normalizeCommand(m.name)), source.map((b) => normalizeCommand(b.split('\n')[0] ?? '')));
  for (const media of probotMedia) {
    if (!['mate', 'pala'].includes(media.name)) assert.equal(media.source, source.find((b) => normalizeCommand(b.split('\n')[0] ?? '') === normalizeCommand(media.name))?.split('\n')[1]);
    if (media.file) {
      const bytes = readFileSync(new URL(`../assets/probot/${media.file}`, import.meta.url));
      assert.ok(bytes.length > 1000);
      assert.ok(media.file.endsWith('.gif') ? bytes.subarray(0, 3).toString() === 'GIF' : bytes[0] === 0xff && bytes[1] === 0xd8);
    }
    for (const input of [`${media.name}?`, `!${normalizeCommand(media.name).toUpperCase()}`]) {
      const reply = executeCommand(input, { levels, userId: '123', guildId: '456', random: () => 0 });
      assert.ok(reply);
      assert.equal(reply.gif, media.file ? probotAssetBase + media.file : undefined);
      assert.deepEqual(toDiscordReply(reply, '123').allowedMentions?.users, ['123']);
    }
  }
});
