import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import Database from 'better-sqlite3';
import { backupDatabase } from '../src/database/backup.js';
import { openDatabase } from '../src/database/connection.js';
import { migrations } from '../src/database/migrations.js';
import { LevelStore } from '../src/features/levels/store.js';
import { fixture } from './helpers.js';

test('migra una base v1 al esquema actual conservando la lotería', (t) => {
  const f = fixture(t);
  const path = join(f.directory, 'v1.sqlite');
  const old = new Database(path);
  const first = migrations[0];
  assert.ok(first);
  old.exec(first);
  old.pragma('user_version = 1');
  old.prepare('INSERT INTO lottery_players VALUES (?, ?, ?, ?)').run('1', '2', 100, '2026-10-20');
  old.close();
  const updated = f.connect(path);
  assert.equal(updated.pragma('user_version', { simple: true }), migrations.length);
  assert.equal(updated.prepare('SELECT points FROM lottery_players').pluck().get(), 100);
  assert.equal(new LevelStore(updated).profile('1', '2').xp, 0);
  assert.equal(updated.pragma('journal_mode', { simple: true }), 'wal');
  assert.equal(updated.pragma('synchronous', { simple: true }), 2);
});

test('migra v7 con categoría gift por defecto sin perder cumpleaños ni contactos', (t) => {
  const f = fixture(t);
  const path = join(f.directory, 'v7.sqlite');
  const old = new Database(path);
  for (const migration of migrations.slice(0, 7)) old.exec(migration);
  old.prepare('INSERT INTO gift_birthdays VALUES (?, ?, ?, ?)').run('1', '2', 'Persona ficticia', '02/01');
  old.prepare('INSERT INTO gift_member_details VALUES (?,?,?,?,?,?,?,?,?)').run('1', '2', 'persona', 'Persona', 'Ficticia', '00123', 'Calle ficticia', 'Ciudad', '0010');
  old.pragma('user_version = 7'); old.close();
  const upgraded = f.connect(path);
  assert.equal(upgraded.prepare('SELECT category FROM gift_birthdays').pluck().get(), 'gift');
  assert.deepEqual(upgraded.prepare('SELECT phone,postal_code FROM gift_member_details').get(), { phone: '00123', postal_code: '0010' });
  assert.throws(() => upgraded.prepare('UPDATE gift_birthdays SET category=?').run('invalid'), /CHECK/);
});

test('rechaza bases futuras y archivos corruptos sin reemplazarlos', (t) => {
  const f = fixture(t);
  const futurePath = join(f.directory, 'future.sqlite');
  const future = new Database(futurePath);
  future.pragma('user_version = 999');
  future.close();
  const before = readFileSync(futurePath);
  assert.throws(() => openDatabase(futurePath), /versión más nueva/);
  assert.deepEqual(readFileSync(futurePath), before);
  const corrupt = join(f.directory, 'corrupt.sqlite');
  writeFileSync(corrupt, 'esto no es sqlite');
  assert.throws(() => openDatabase(corrupt));
  assert.equal(readFileSync(corrupt, 'utf8'), 'esto no es sqlite');
});

test('migra v5 preservando la exclusión original y marca la gestión previa como automática', (t) => {
  const f = fixture(t);
  const path = join(f.directory, 'v5.sqlite');
  const old = new Database(path);
  for (const migration of migrations.slice(0, 5)) old.exec(migration);
  old.pragma('user_version = 5');
  old.prepare(`INSERT INTO gift_cycles (guild_id, channel_id, user_id, name, birthday, prior_view, state)
    VALUES ('1', '2', '3', 'Persona ficticia', '2026-11-12', 1, 'hidden')`).run();
  old.close();
  const updated = f.connect(path);
  assert.deepEqual(updated.prepare('SELECT prior_view, state, exclusion_mode FROM gift_cycles').get(),
    { prior_view: 1, state: 'hidden', exclusion_mode: 'bot' });
  assert.equal(updated.pragma('user_version', { simple: true }), migrations.length);
});

test('backup online restaura XP, cooldown y tablas anteriores sin sobrescribir backups existentes', async (t) => {
  const f = fixture(t);
  f.db.prepare('INSERT INTO lottery_players VALUES (?, ?, ?, ?)').run('1', '2', 100, '2026-10-20');
  f.levels.award('1', '2', 1000, 25);
  f.db.prepare('INSERT INTO member_reputation VALUES (?, ?, ?)').run('1', '2', 1);
  const backup = join(f.directory, 'backups', 'bot.sqlite');
  await backupDatabase(f.path, backup);
  // Nuevas escrituras no alteran la copia consistente ya publicada.
  f.levels.award('1', '2', 61_000, 25);
  const restored = f.connect(backup);
  assert.equal(restored.prepare('SELECT points FROM lottery_players').pluck().get(), 100);
  const levels = new LevelStore(restored);
  assert.equal(levels.profile('1', '2').xp, 25);
  assert.equal(levels.award('1', '2', 2000, 25), false);
  assert.equal(restored.prepare('SELECT points FROM member_reputation').pluck().get(), 1);
  assert.equal(restored.pragma('integrity_check', { simple: true }), 'ok');
  await assert.rejects(backupDatabase(f.path, backup));
  await assert.rejects(backupDatabase(f.path, f.path), /diferente/);
  assert.equal(restored.prepare('SELECT points FROM lottery_players').pluck().get(), 100);
});

test('rutas con espacios externos no sobrescriben backups ni dejan reservas vacías', async (t) => {
  const f = fixture(t);
  f.levels.award('1', '2', 1000, 15);
  const backup = join(f.directory, 'existing.sqlite');
  await backupDatabase(f.path, backup);
  const before = readFileSync(backup);
  f.levels.award('1', '2', 61_000, 25);
  for (const suffix of [' ', '\t', '\n']) {
    await assert.rejects(backupDatabase(f.path, backup + suffix), /espacios externos/);
    assert.deepEqual(readFileSync(backup), before);
    assert.equal(existsSync(backup + suffix), false);
  }
  const destination = join(f.directory, 'new.sqlite');
  await assert.rejects(backupDatabase(f.path + ' ', destination), /espacios externos/);
  assert.equal(existsSync(destination), false);
});
