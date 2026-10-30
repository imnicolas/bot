import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDatabase } from '../dist/database/connection.js';
import { backupDatabase } from '../dist/database/backup.js';
import { LevelStore } from '../dist/features/levels/store.js';
import { verifyDiscordLifecycle } from './discord-smoke.mjs';
import { verifyGiftLifecycle } from './gifts-smoke.mjs';
import { GiftStore } from '../dist/features/gifts/store.js';
import { GiftRosterStore } from '../dist/features/gifts/roster.js';

const directory = mkdtempSync(join(tmpdir(), 'discord-bot-smoke-'));
const path = join(directory, 'bot.sqlite');
const db = openDatabase(path);
const levels = new LevelStore(db);
try {
  await verifyDiscordLifecycle(levels);
  const gift = await verifyGiftLifecycle(db, levels);
  const importGuild = '300000000000000010';
  const importArgs = [fileURLToPath(new URL('../dist/cli/import-birthdays.js', import.meta.url)),
    '--guild', importGuild, '--file', fileURLToPath(new URL('../examples/birthdays.csv', import.meta.url))];
  const importEnv = { ...process.env, DATABASE_PATH: path };
  delete importEnv.DISCORD_TOKEN;
  const runImport = (...args) => execFileSync(process.execPath, [...importArgs, ...args], { env: importEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  assert.match(runImport(), /Sin cambios/);
  assert.equal(new GiftStore(db).birthdays(importGuild).length, 0);
  assert.match(runImport('--apply'), /Importados 2/);
  assert.equal(new GiftStore(db).birthdays(importGuild).length, 2);

  const rosterGuild = '400000000000000010';
  const rosterCsv = join(directory, 'roster.csv');
  writeFileSync(rosterCsv, 'User Id,DS Name,Nombre,Apellido,Dia de cumpleañitos,Telefono,Direccion,Ciudad,Codigo Postal\n100000000000000001,persona_ficticia,Persona,Ficticia,02/01,+0000001,Calle ficticia 1,Ciudad ficticia,0010\n', { mode: 0o600 });
  const runRoster = (...extra) => execFileSync(process.execPath, [fileURLToPath(new URL('../dist/cli/import-roster.js', import.meta.url)),
    '--guild', rosterGuild, '--file', rosterCsv, ...extra], { env: importEnv, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  assert.match(runRoster(), /Sin cambios/);
  assert.equal(new GiftRosterStore(db).members(rosterGuild).length, 0);
  assert.match(runRoster('--apply'), /Importados 1/);
  assert.equal(new GiftRosterStore(db).members(rosterGuild)[0].postalCode, '0010');
  const invalidCsv = join(directory, 'invalid.csv');
  writeFileSync(invalidCsv, 'user_id,nombre,fecha cumple\n100000000000000001,Persona,99/99\n');
  assert.throws(() => runImport('--file', invalidCsv, '--apply'));
  assert.equal(new GiftStore(db).birthdays(importGuild).length, 2);

  levels.award('1', '2', 1000, 25);
  const snapshot = join(directory, 'backup.sqlite');
  await backupDatabase(path, snapshot);
  db.close();
  const restored = openDatabase(snapshot);
  try {
    const savedLevels = new LevelStore(restored);
    assert.equal(savedLevels.profile('1', '2').xp, 25);
    assert.equal(savedLevels.award('1', '2', 2000, 25), false);
    assert.equal(restored.pragma('integrity_check', { simple: true }), 'ok');
    assert.equal(new GiftStore(restored).get(gift.cycleId).state, 'restored');
    assert.equal(new GiftStore(restored).get(gift.manualCycleId).exclusionMode, 'manual');
    assert.equal(new GiftStore(restored).get(gift.manualCycleId).state, 'restored');
    assert.equal(new GiftStore(restored).birthdays(gift.config.guildId).length, 3);
    assert.equal(new GiftStore(restored).adminNotice(gift.config.guildId, gift.adminId, '2026-11-12').state, 'sent');
    assert.equal(new GiftStore(restored).birthdays(importGuild).length, 2);
    assert.equal(new GiftRosterStore(restored).members(rosterGuild)[0].phone, '+0000001');
    assert.equal(new GiftRosterStore(restored).members(rosterGuild)[0].postalCode, '0010');
  } finally {
    restored.close();
  }
  console.log(
    'Smoke OK: Discord simulado, permisos y botones de regalos, importación CSV, cierre ordenado, SQLite y backup restaurado. Sin token ni red.',
  );
} finally {
  if (db.open) db.close();
  rmSync(directory, { recursive: true, force: true });
}
