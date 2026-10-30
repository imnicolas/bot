import 'dotenv/config';
import { loadConfig } from './config/env.js';
import { openDatabase } from './database/connection.js';
import { createBot } from './discord/client.js';
import { LevelStore } from './features/levels/store.js';
import { GiftStore } from './features/gifts/store.js';

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  console.log('Features activas:', config.features);
  const db = openDatabase(config.databasePath);
  const bot = createBot({ levels: new LevelStore(db), features: config.features },
    config.gifts ? { config: config.gifts, store: new GiftStore(db) } : undefined,
    config.giftTest ? { config: config.giftTest, store: new GiftStore(db) } : undefined);
  console.log('Regalos:', config.gifts ? 'habilitado' : 'desactivado');
  let shutdown: Promise<void> | undefined;
  const stop = (): Promise<void> => {
    shutdown ??= (async () => {
      try {
        await bot.stop();
      } finally {
        db.close();
      }
    })();
    return shutdown;
  };
  for (const signal of ['SIGINT', 'SIGTERM'] as const) {
    process.once(signal, () => {
      void stop().catch((error: unknown) => {
        console.error('No se pudo cerrar la conexión:', error);
        process.exitCode = 1;
      });
    });
  }
  try {
    await bot.client.login(config.token);
  } catch (error) {
    await stop();
    throw error;
  }
}

main().catch((error: unknown) => {
  console.error('No se pudo iniciar el bot:', error);
  process.exitCode = 1;
});
