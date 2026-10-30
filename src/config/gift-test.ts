import { loadGiftConfig } from './gifts.js';
import type { GiftConfig } from './gifts.js';

// Independent opt-in: a test command never starts the live birthday scheduler.
export function loadGiftTestConfig(env: NodeJS.ProcessEnv): GiftConfig | undefined {
  const enabled = env['GIFTS_TEST_COMMAND_ENABLED']?.trim().toLowerCase() ?? 'false';
  if (!['true', 'false'].includes(enabled)) throw new Error('GIFTS_TEST_COMMAND_ENABLED debe ser true o false.');
  if (enabled === 'false') return undefined;
  if (!env['GIFTS_TEST_CHANNEL_ID']?.trim()) throw new Error('Configurá GIFTS_TEST_CHANNEL_ID para el comando de prueba.');
  return loadGiftConfig({ ...env, FEATURE_GIFTS_ENABLED: 'true', GIFTS_CHANNEL_ID: env['GIFTS_TEST_CHANNEL_ID'] });
}
