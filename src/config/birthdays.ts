import { resolve } from 'node:path';

export interface BirthdayConfig {
  readonly guildId: string;
  readonly roleName: string;
  readonly workbookPath: string;
  readonly timezone: string;
}

const snowflake = /^\d{17,20}$/;
const defaultTimezone = 'America/Argentina/Buenos_Aires';
const defaultRoleName = 'Cumpleañeri';

export function loadBirthdayConfig(env: NodeJS.ProcessEnv): BirthdayConfig | undefined {
  const guildId = env['BIRTHDAY_GUILD_ID']?.trim();
  if (!guildId) return undefined;
  if (!snowflake.test(guildId)) throw new Error('BIRTHDAY_GUILD_ID debe ser un ID válido de Discord.');

  const roleName = env['BIRTHDAY_ROLE_NAME']?.trim() || defaultRoleName;
  if (roleName.length > 100) throw new Error('BIRTHDAY_ROLE_NAME no puede superar 100 caracteres.');

  const timezone = env['BIRTHDAY_TIMEZONE']?.trim() || defaultTimezone;
  try {
    new Intl.DateTimeFormat('en', { timeZone: timezone });
  } catch {
    throw new Error('BIRTHDAY_TIMEZONE debe ser una zona horaria IANA válida.');
  }

  return {
    guildId,
    roleName,
    workbookPath: resolve(env['BIRTHDAY_WORKBOOK']?.trim() || '/var/lib/discord-bot/birthdays.xlsx'),
    timezone,
  };
}