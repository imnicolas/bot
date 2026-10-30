import 'dotenv/config';
import { readFileSync, statSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { databasePath } from '../config/env.js';
import { isSnowflake } from '../config/gifts.js';
import { openDatabase } from '../database/connection.js';
import { GiftRosterStore, parseGiftRoster } from '../features/gifts/roster.js';

try {
  const { values } = parseArgs({ options: { guild: { type: 'string' }, file: { type: 'string' }, apply: { type: 'boolean', default: false } } });
  if (!values.guild || !isSnowflake(values.guild) || !values.file) throw new Error('Uso: npm run gifts:import-roster -- --guild ID --file ruta.csv [--apply]');
  if (statSync(values.file).size > 1024 * 1024) throw new Error('CSV demasiado grande (máximo 1 MiB).');
  const entries = parseGiftRoster(readFileSync(values.file, 'utf8'));
  if (!values.apply) console.log(`Padrón válido: ${entries.length} miembros. Sin cambios; agregá --apply para importar a SQLite.`);
  else {
    const db = openDatabase(databasePath(process.env));
    try { new GiftRosterStore(db).import(values.guild, entries); }
    finally { db.close(); }
    console.log(`Importados ${entries.length} miembros con datos de contacto. No se enviaron mensajes ni cambiaron permisos de Discord.`);
  }
} catch {
  // Keep private CSV contents and contact details out of terminal diagnostics.
  console.error('No se pudo importar el padrón. Revisá la ruta, las nueve columnas, la categoría opcional (gift/no-gift), IDs y fechas DD/MM. Cerrá organizaciones activas antes de marcar no-gift.');
  process.exitCode = 1;
}
