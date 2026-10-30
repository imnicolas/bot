import 'dotenv/config';
import { loadConfig } from './config/env.js';
import { openDatabase } from './database/connection.js';
import { createBot } from './discord/client.js';
import type { BirthdayAutomation } from './discord/client.js';
import { SqliteBirthdayRoleStateStore } from './features/birthdays/roles.js';
import { loadBirthdayWorkbook } from './features/birthdays/workbook.js';
import { LevelStore } from './features/levels/store.js';

async function main(): Promise<void> {
  const config = loadConfig(process.env);
  console.log('Features activas:', config.features);
  const birthdayRecords = config.birthdays
    ? await loadBirthdayWorkbook(config.birthdays.workbookPath)
    : undefined;
  const db = openDatabase(config.databasePath);
  const birthdays: BirthdayAutomation | undefined = config.birthdays && birthdayRecords
    ? {
        config: config.birthdays,
        records: birthdayRecords,
        store: new SqliteBirthdayRoleStateStore(db),
      }
    : undefined;
  const bot = createBot({ levels: new LevelStore(db), features: config.features }, birthdays);
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
