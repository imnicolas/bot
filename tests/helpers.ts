import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import type Database from 'better-sqlite3';
import { openDatabase } from '../src/database/connection.js';
import { LevelStore } from '../src/features/levels/store.js';

export function fixture(t: TestContext) {
  const directory = mkdtempSync(join(tmpdir(), 'discord-bot-'));
  const path = join(directory, 'data', 'bot.sqlite');
  const connections: Database.Database[] = [];
  const connect = (file = path) => {
    const db = openDatabase(file);
    connections.push(db);
    return db;
  };
  t.after(() => {
    for (const db of connections) if (db.open) db.close();
    rmSync(directory, { recursive: true, force: true });
  });
  const db = connect();
  return { directory, path, db, connect, levels: new LevelStore(db) };
}
