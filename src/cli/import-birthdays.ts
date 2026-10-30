import 'dotenv/config';
import { readFileSync, statSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { databasePath } from '../config/env.js';
import { isSnowflake } from '../config/gifts.js';
import { openDatabase } from '../database/connection.js';
import { parseBirthdays } from '../features/gifts/birthdays.js';
import { GiftStore } from '../features/gifts/store.js';

try {
  const { values } = parseArgs({ options: { guild: { type: 'string' }, file: { type: 'string' }, apply: { type: 'boolean', default: false } } });
  if (!values.guild || !isSnowflake(values.guild) || !values.file) throw new Error('Uso: npm run gifts:import -- --guild ID --file ruta.csv [--apply]');
  if (statSync(values.file).size > 1024 * 1024) throw new Error('CSV demasiado grande (máximo 1 MiB).');
  const birthdays = parseBirthdays(readFileSync(values.file, 'utf8'));
  if (!values.apply) console.log(`CSV válido: ${birthdays.length} cumpleaños. Sin cambios; agregá --apply para importar a SQLite.`);
  else {
    const db = openDatabase(databasePath(process.env));
    try { new GiftStore(db).import(values.guild, birthdays); }
    finally { db.close(); }
    console.log(`Importados ${birthdays.length} cumpleaños. No se enviaron mensajes ni cambiaron permisos de Discord.`);
  }
} catch (error) {
  console.error(error instanceof Error ? error.message : 'No se pudo importar el CSV.');
  process.exitCode = 1;
}
