import { Client, Events, GatewayIntentBits } from 'discord.js';
import { handleMessage } from './messages.js';
import type { MessageServices } from './messages.js';
import { fromDiscordMessage } from './profiles.js';

export function createBot(services: MessageServices) {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
    allowedMentions: { parse: [], repliedUser: false },
  });
  client.once(Events.ClientReady, (ready) => console.log(`Bot conectado como: ${ready.user.tag}`));
  const pending = new Set<Promise<void>>();
  let stopping = false;
  let shutdown: Promise<void> | undefined;
  client.on(Events.MessageCreate, (message) => {
    if (stopping) return;
    if (message.author.bot || message.webhookId || !message.guildId || message.system) return;
    const task = handleMessage(fromDiscordMessage(message), services);
    pending.add(task);
    void task
      .finally(() => pending.delete(task))
      .catch((error: unknown) => console.error('Error procesando mensaje:', error));
  });
  client.on(Events.Error, (error) => console.error('Error de Discord:', error));
  return {
    client,
    stop(): Promise<void> {
      stopping = true;
      shutdown ??= (async () => {
        try {
          // Las respuestas pendientes, incluido su aviso de error, todavía usan REST.
          await Promise.allSettled(pending);
        } finally {
          await client.destroy();
        }
      })();
      return shutdown;
    },
  };
}
