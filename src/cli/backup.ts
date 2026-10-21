import 'dotenv/config';
import { resolve } from 'node:path';
import { databasePath } from '../config/env.js';
import { backupDatabase } from '../database/backup.js';

async function main(): Promise<void> {
  const destination = process.argv[2];
  if (!destination) throw new Error('Uso: npm run db:backup -- /ruta/backup.sqlite');
  await backupDatabase(databasePath(process.env), resolve(destination));
  console.log(`Backup completo: ${resolve(destination)}`);
}

main().catch((error: unknown) => {
  console.error('No se pudo crear el backup:', error);
  process.exitCode = 1;
});
