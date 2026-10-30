import 'dotenv/config';
import { readFileSync, statSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { isSnowflake } from '../config/gifts.js';
import { DiscordBirthdayDirectory } from '../discord/birthday-directory.js';
import { birthdaysCSV, parseBirthdayInput } from '../features/gifts/birthdays.js';
import { resolveBirthdayMembers } from '../features/gifts/resolve-members.js';

async function main(): Promise<void> {
  const { values } = parseArgs({ options: {
    guild: { type: 'string' }, file: { type: 'string' }, output: { type: 'string' },
  } });
  if (!values.guild || !isSnowflake(values.guild) || !values.file || !values.output) {
    throw new Error('Uso: npm run gifts:resolve -- --guild ID --file origen.csv --output resuelto.csv');
  }
  if (statSync(values.file).size > 1024 * 1024) throw new Error('CSV demasiado grande (máximo 1 MiB).');
  const rows = parseBirthdayInput(readFileSync(values.file, 'utf8'));
  const token = process.env['DISCORD_TOKEN']?.trim();
  if (!token) throw new Error('Resolver usernames requiere DISCORD_TOKEN. La importación de IDs sigue funcionando sin token.');
  const birthdays = await resolveBirthdayMembers(rows, DiscordBirthdayDirectory.withToken(token, values.guild));
  writeFileSync(values.output, birthdaysCSV(birthdays), { flag: 'wx', mode: 0o600 });
  console.log(`Resueltas ${birthdays.length} identidades. Revisá el CSV de salida antes de importar. No se modificó SQLite ni se enviaron mensajes o cambiaron permisos.`);
}

main().catch((error: unknown) => {
  // Avoid dumping HTTP requests, credentials or response bodies from Discord errors.
  console.error(error instanceof Error ? error.message : 'No se pudieron resolver los miembros.');
  process.exitCode = 1;
});
