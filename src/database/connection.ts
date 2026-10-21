import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import Database from 'better-sqlite3';
import { migrations } from './migrations.js';

export function openDatabase(file: string): Database.Database {
  mkdirSync(dirname(file), { recursive: true, mode: 0o700 });
  const db = new Database(file, { timeout: 5000 });
  try {
    db.pragma('foreign_keys = ON');
    db.transaction(() => {
      const version = db.pragma('user_version', { simple: true });
      if (
        typeof version !== 'number' ||
        !Number.isInteger(version) ||
        version < 0 ||
        version > migrations.length
      ) {
        throw new Error('La base tiene una versión más nueva que este bot. Actualizá el código.');
      }
      for (const sql of migrations.slice(version)) {
        db.exec(sql);
      }
      db.pragma(`user_version = ${migrations.length}`);
    }).immediate();
    db.pragma('journal_mode = WAL');
    db.pragma('synchronous = FULL');
    return db;
  } catch (error) {
    db.close();
    throw error;
  }
}
