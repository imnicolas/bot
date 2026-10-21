import { resolve } from 'node:path';

export function databasePath(env: NodeJS.ProcessEnv): string {
  if (env['DATA_FILE']?.trim()) {
    throw new Error(
      'DATA_FILE fue reemplazado por DATABASE_PATH. Configurá DATABASE_PATH con la ruta de SQLite; los puntos de lotería no se convierten en XP.',
    );
  }
  return resolve(env['DATABASE_PATH']?.trim() || './data/bot.sqlite');
}

export function loadConfig(env: NodeJS.ProcessEnv) {
  const token = env['DISCORD_TOKEN']?.trim();
  if (!token) throw new Error('Falta DISCORD_TOKEN. Configuralo en .env.');

  return {
    token,
    databasePath: databasePath(env),
  };
}
