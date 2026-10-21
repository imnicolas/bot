import assert from 'node:assert/strict';
import { test } from 'node:test';
import { databasePath, loadConfig } from '../src/config/env.js';
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
