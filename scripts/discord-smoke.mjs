import assert from 'node:assert/strict';
import { setImmediate } from 'node:timers/promises';
import { Message, MessageType, TextChannel } from 'discord.js';
import { createBot } from '../dist/discord/client.js';

// Objetos reales del SDK; sólo el transporte HTTP se sustituye. Nunca hace login.
export async function verifyDiscordLifecycle(levels) {
  let clock = 1000;
  const bot = createBot({ levels, features: { social: true, meals: true, levels: true }, now: () => new Date(clock), random: () => 0 });
  const fakeToken = 'fake-token-for-offline-smoke';
  bot.client.token = fakeToken;
  bot.client.rest.setToken(fakeToken);
  const channel = new TextChannel(
    undefined,
    {
      id: '100000000000000002',
      guild_id: '10',
      type: 0,
      name: 'test',
    },
    bot.client,
  );
  bot.client.channels.cache.set(channel.id, channel);
  const data = {
    id: '100000000000000003',
    channel_id: channel.id,
    guild_id: '10',
    author: { id: '2', username: 'Demo', discriminator: '0', avatar: null, bot: false },
    timestamp: new Date().toISOString(),
    mentions: [],
    mention_roles: [],
    attachments: [],
    embeds: [],
  };
  const incoming = (content, type = MessageType.Default) =>
    new Message(bot.client, { ...data, content, type });
  const replies = [];
  let failNext = false;
  let attempts = 0;
  const errors = [];
  const originalError = console.error;
  // resolveRequest ejecuta la autenticación real de REST sin enviar la petición.
  bot.client.rest.post = async (route, options) => {
    attempts++;
    await bot.client.rest.resolveRequest({ ...options, fullRoute: route, method: 'POST' });
    if (failNext) {
      failNext = false;
      await setImmediate();
      throw new Error('Simulated response failure');
    }
    replies.push(options.body);
    return {
      ...data,
      content: options.body.content ?? '',
      embeds: options.body.embeds ?? [],
      type: MessageType.Default,
      id: '100000000000000005',
      author: { ...data.author, id: '3', bot: true },
    };
  };
  try {
    for (const content of ['Programación en TypeScript', 'desayuno?']) {
      const systemMessage = incoming(content, MessageType.ThreadCreated);
      assert.equal(systemMessage.system, true);
      bot.client.emit('messageCreate', systemMessage);
    }
    await setImmediate();
    assert.equal(attempts, 0, 'Un título de hilo no debe activar comandos.');
    assert.equal(levels.profile('10', '2').xp, 0, 'Un mensaje de sistema no debe sumar XP.');

    bot.client.emit('messageCreate', incoming('Hola, grupo, cómo andan?'));
    clock += 60_000;
    bot.client.emit('messageCreate', incoming('Respondiendo a la conversación', MessageType.Reply));
    assert.equal(levels.profile('10', '2').xp, 30, 'Mensajes normales y respuestas sí participan.');

    bot.client.emit('messageCreate', incoming('desayuno?'));
    await setImmediate();
    assert.equal(replies.length, 1);
    assert.match(replies[0].content, /<@2>/);
    assert.equal(replies[0].embeds.length, 1);

    // La primera respuesta falla mientras se cierra; el aviso aún necesita REST.
    console.error = (...args) => errors.push(args);
    failNext = true;
    bot.client.emit('messageCreate', incoming('cena?'));
    const stopping = bot.stop();
    assert.equal(bot.stop(), stopping, 'El cierre debe ser idempotente.');
    clock += 60_000;
    bot.client.emit('messageCreate', incoming('Este mensaje llegó durante el cierre'));
    await stopping;
    assert.equal(attempts, 3);
    assert.equal(replies.length, 2);
    assert.match(replies[1].content, /Se me cruzaron los cables/);
    assert.equal(errors.length, 1, 'Sólo se registra el fallo simulado; el aviso sí se envía.');
    assert.equal(bot.client.token, null);
    assert.equal(levels.profile('10', '2').xp, 30, 'No procesa eventos nuevos durante el cierre.');
  } finally {
    console.error = originalError;
    await bot.stop();
  }
}
