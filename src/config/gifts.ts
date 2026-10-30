export interface GiftConfig {
  readonly guildId: string;
  readonly channelId: string;
  readonly roleId: string;
  readonly protectedChannelIds?: readonly string[];
  readonly timeZone: string;
  readonly adminIds?: readonly [string, string];
  readonly dmOnlyAdminId?: string;
}

export const isSnowflake = (value: string): boolean => /^[1-9]\d{16,19}$/.test(value)
  && BigInt(value) < (1n << 64n);

export function loadGiftConfig(env: NodeJS.ProcessEnv): GiftConfig | undefined {
  const enabled = env['FEATURE_GIFTS_ENABLED']?.trim().toLowerCase() ?? 'false';
  if (enabled !== 'true' && enabled !== 'false') throw new Error('FEATURE_GIFTS_ENABLED debe ser true o false.');
  if (enabled === 'false') return undefined;
  const guildId = env['GIFTS_GUILD_ID']?.trim() ?? '';
  const channelId = env['GIFTS_CHANNEL_ID']?.trim() ?? '';
  const roleId = env['GIFTS_ROLE_ID']?.trim() ?? '';
  if (!isSnowflake(guildId) || !isSnowflake(channelId) || !isSnowflake(roleId)) throw new Error('Regalos requiere GIFTS_GUILD_ID, GIFTS_CHANNEL_ID y GIFTS_ROLE_ID válidos.');
  const protectedChannelIds = [...new Set([channelId, ...(env['GIFTS_PROTECTED_CHANNEL_IDS']?.split(',').map((id) => id.trim()).filter(Boolean) ?? [])])];
  if (protectedChannelIds.length > 10 || protectedChannelIds.some((id) => !isSnowflake(id))) throw new Error('GIFTS_PROTECTED_CHANNEL_IDS debe contener hasta 10 IDs válidos separados por coma.');
  const base = { guildId, channelId, roleId, protectedChannelIds, timeZone: env['GIFTS_TIME_ZONE']?.trim() || 'America/Montevideo' };
  const timeZone = env['GIFTS_TIME_ZONE']?.trim() || 'America/Montevideo';
  try { new Intl.DateTimeFormat('en', { timeZone }).format(); }
  catch { throw new Error('GIFTS_TIME_ZONE no es una zona horaria válida.'); }
  const admins = env['GIFTS_ADMIN_IDS']?.trim();
  const dmOnlyAdminId = env['GIFTS_DM_ONLY_ADMIN_ID']?.trim();
  if (dmOnlyAdminId && !admins) throw new Error('GIFTS_DM_ONLY_ADMIN_ID requiere GIFTS_ADMIN_IDS.');
  if (!admins) return base;
  const ids = admins.split(',').map((id) => id.trim());
  const [first, second] = ids;
  if (ids.length !== 2 || !first || !second || !isSnowflake(first) || !isSnowflake(second) || first === second) {
    throw new Error('GIFTS_ADMIN_IDS requiere exactamente dos IDs distintos separados por coma.');
  }
  if (dmOnlyAdminId && dmOnlyAdminId !== first && dmOnlyAdminId !== second) {
    throw new Error('GIFTS_DM_ONLY_ADMIN_ID debe ser uno de los dos administradores configurados.');
  }
  return { ...base, adminIds: [first, second], ...(dmOnlyAdminId ? { dmOnlyAdminId } : {}) };
}
