import assert from 'node:assert/strict';
import { test } from 'node:test';
import { databasePath, loadConfig } from '../src/config/env.js';
import { loadFeatures } from '../src/config/features.js';
import { resolve } from 'node:path';

test('la configuración falla temprano sin token y normaliza el token recibido', () => {
  assert.throws(() => loadConfig({}), /Falta DISCORD_TOKEN/);
  assert.throws(() => loadConfig({ DISCORD_TOKEN: '   ' }), /Falta DISCORD_TOKEN/);
  assert.equal(loadConfig({ DISCORD_TOKEN: ' test ' }).token, 'test');
});

test('usa SQLite por defecto y detecta la configuración JSON anterior', () => {
  assert.equal(databasePath({}), resolve('data/bot.sqlite'));
  assert.equal(
    databasePath({ DATABASE_PATH: '/var/lib/discord-bot/bot.sqlite' }),
    '/var/lib/discord-bot/bot.sqlite',
  );
  assert.throws(() => databasePath({ DATA_FILE: './data/lottery.json' }), /DATABASE_PATH/);
});

test('features: defaults seguros, activación explícita y errores de configuración', () => {
  assert.deepEqual(loadFeatures({}), { social: true, meals: true, levels: false });
  assert.deepEqual(loadConfig({ DISCORD_TOKEN: 'test', FEATURE_LEVELS_ENABLED: 'true',
    FEATURE_SOCIAL_ENABLED: 'false', FEATURE_MEALS_ENABLED: 'false' }).features,
    { social: false, meals: false, levels: true });
  for (const flag of ['FEATURE_SOCIAL_ENABLED', 'FEATURE_MEALS_ENABLED', 'FEATURE_LEVELS_ENABLED'])
    for (const value of ['yes', '0', '']) assert.throws(() => loadFeatures({ [flag]: value }), /true o false/);
});
