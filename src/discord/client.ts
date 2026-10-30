import { Client, Events, GatewayIntentBits, MessageFlags } from 'discord.js';
import type { GiftConfig } from '../config/gifts.js';
import type { GiftStore } from '../features/gifts/store.js';
import { GiftRuntime, isGiftCommand } from './gifts.js';
import { giftTestMessage, isGiftTestCommand } from './gift-test.js';
import { handleMessage } from './messages.js';
import type { MessageServices } from './messages.js';
import { fromDiscordMessage } from './profiles.js';

export function createBot(services: MessageServices, gifts?: { config: GiftConfig; store: GiftStore }, giftTest?: { config: GiftConfig; store: GiftStore }) {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
    allowedMentions: { parse: [], repliedUser: false },
  });
  const giftRuntime = gifts ? new GiftRuntime(client, gifts.config, gifts.store) : undefined;
  client.once(Events.ClientReady, (ready) => {
    console.log(`Bot conectado como: ${ready.user.tag}`);
    giftRuntime?.start();
  });
  const pending = new Set<Promise<void>>();
  let stopping = false;
  let shutdown: Promise<void> | undefined;
  client.on(Events.MessageCreate, (message) => {
    if (stopping) return;
    if (message.author.bot || message.webhookId || !message.guildId || message.system) return;
    const task = isGiftTestCommand(message.content)
      ? giftTestMessage(message, giftTest)
      : isGiftCommand(message.content)
      ? giftRuntime
        ? giftRuntime.message(message)
        : message.reply({
          content: 'La función regalos está desactivada.',
          allowedMentions: { parse: [], repliedUser: false },
        }).then(() => undefined)
      : handleMessage(fromDiscordMessage(message), services);
    pending.add(task);
    void task
      .finally(() => pending.delete(task))
      .catch((error: unknown) => console.error('Error procesando mensaje:', error));
  });
  client.on(Events.InteractionCreate, (interaction) => {
    if (stopping || !interaction.isButton() || !interaction.customId.startsWith('gift:')) return;
    const task = giftRuntime
      ? giftRuntime.button(interaction)
      : interaction.reply({
        content: 'La función regalos está desactivada.', flags: MessageFlags.Ephemeral,
      }).then(() => undefined);
    pending.add(task);
    void task
      .finally(() => pending.delete(task))
      .catch((error: unknown) => console.error('Error procesando botón:', error));
  });
  client.on(Events.Error, (error) => console.error('Error de Discord:', error));
  return {
    client,
    stop(): Promise<void> {
      stopping = true;
      giftRuntime?.pause();
      shutdown ??= (async () => {
        try {
          // Las respuestas pendientes, incluido su aviso de error, todavía usan REST.
          await Promise.allSettled(pending);
          await giftRuntime?.drain();
        } finally {
          await client.destroy();
        }
      })();
      return shutdown;
    },
  };
}
