import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MessageReplyOptions } from 'discord.js';
import { handleMessage } from '../src/discord/messages.js';
import type { IncomingMessage } from '../src/discord/messages.js';
import { fixture } from './helpers.js';

function message(content: string, replies: MessageReplyOptions[]): IncomingMessage {
  return {
    author: { id: '123', bot: false },
    guildId: '456',
    system: false,
    webhookId: null,
    content,
    reply: async (options) => {
      replies.push(options);
    },
  };
}

test('GIFs, nivel y ranking se adaptan a Discord sin notificar a terceros', async (t) => {
  const services = fixture(t);
  const sent: MessageReplyOptions[] = [];
  services.levels.award('456', '123', 0, 25);
  await handleMessage(message('desayuno?', sent), services);
  assert.match(sent[0]?.content ?? '', /<@123>/);
  assert.equal(sent[0]?.embeds?.length, 1);
  assert.deepEqual(sent[0]?.allowedMentions?.users, ['123']);
  await handleMessage(message('nivel', sent), services);
  await handleMessage(message('ranking', sent), services);
  assert.match(sent[2]?.content ?? '', /Ranking de participación[\s\S]*25 XP/);
  assert.deepEqual(sent[1]?.allowedMentions?.users, []);
  assert.deepEqual(sent[2]?.allowedMentions?.users, []);
});

test('ignora bots, webhooks, privados y mensajes de sistema para comandos y XP', async (t) => {
  const services = fixture(t);
  const sent: MessageReplyOptions[] = [];
  for (const content of ['desayuno?', 'una conversación normal']) {
    const base = message(content, sent);
    for (const ignored of [
      { ...base, author: { ...base.author, bot: true } },
      { ...base, webhookId: '789' },
      { ...base, guildId: null },
      { ...base, system: true },
    ])
      await handleMessage(ignored, services);
  }
  assert.equal(sent.length, 0);
  assert.equal(services.levels.profile('456', '123').xp, 0);
});

test('participar suma XP con cooldown; comandos y mensajes cortos no suman', async (t) => {
  const services = fixture(t);
  const sent: MessageReplyOptions[] = [];
  for (const content of ['hola', 'desayuno?', 'nivel', '!otro comando', '/ping', 'hey', '   ']) {
    await handleMessage(message(content, sent), services);
  }
  assert.equal(services.levels.profile('456', '123').xp, 0);
  const repliesBeforeChat = sent.length;
  await handleMessage(message('¿qué pinta para el desayuno?', sent), services);
  const xp = services.levels.profile('456', '123').xp;
  assert.ok(xp >= 15 && xp <= 25);
  await handleMessage(message('y otro mensaje para la charla', sent), services);
  assert.equal(services.levels.profile('456', '123').xp, xp);
  assert.equal(sent.length, repliesBeforeChat);
});

test('un error de persistencia se informa sin rechazar el evento', async (t) => {
  const services = fixture(t);
  const sent: MessageReplyOptions[] = [];
  services.db.close();
  t.mock.method(console, 'error', () => {});
  await handleMessage(message('nivel', sent), services);
  assert.match(sent[0]?.content ?? '', /Se me cruzaron los cables/);
});

test('una falla de XP se registra sin responder a cada mensaje normal', async (t) => {
  const services = fixture(t);
  const sent: MessageReplyOptions[] = [];
  services.db.pragma('query_only = ON');
  t.mock.method(console, 'error', () => {});
  await handleMessage(message('estamos conversando normalmente', sent), services);
  assert.equal(sent.length, 0);
  assert.equal(services.levels.profile('456', '123').xp, 0);
});
