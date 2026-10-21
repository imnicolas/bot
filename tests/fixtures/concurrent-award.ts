import { openDatabase } from '../../src/database/connection.js';
import { LevelStore } from '../../src/features/levels/store.js';

const path = process.argv[2];
if (!path) throw new Error('Falta la base de prueba.');
const db = openDatabase(path);
const levels = new LevelStore(db);
process.once('message', () => {
  const result = {
    xp: levels.award('1', '2', 1000, 25),
  };
  process.send?.(result);
  db.close();
  process.disconnect();
});
process.send?.('ready');
