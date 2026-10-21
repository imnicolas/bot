import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { openDatabase } from '../dist/database/connection.js';
import { backupDatabase } from '../dist/database/backup.js';
import { LevelStore } from '../dist/features/levels/store.js';
import { verifyDiscordLifecycle } from './discord-smoke.mjs';

const directory = mkdtempSync(join(tmpdir(), 'discord-bot-smoke-'));
const path = join(directory, 'bot.sqlite');
const db = openDatabase(path);
const levels = new LevelStore(db);
try {
  await verifyDiscordLifecycle(levels);

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
  } finally {
    restored.close();
  }
  console.log(
    'Smoke OK: Discord simulado, cierre ordenado, SQLite y backup restaurado. Sin token ni red.',
  );
} finally {
  if (db.open) db.close();
  rmSync(directory, { recursive: true, force: true });
}
