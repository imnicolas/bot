import { mkdirSync, openSync, closeSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import Database from 'better-sqlite3';

export async function backupDatabase(source: string, destination: string): Promise<void> {
  // better-sqlite3 recorta las rutas: la reserva debe referirse al mismo archivo.
  for (const path of [source, destination]) {
    if (!path || path !== path.trim()) {
      throw new Error('Las rutas del backup no pueden estar vacías ni tener espacios externos.');
    }
  }
  if (resolve(source) === resolve(destination))
    throw new Error('El backup debe usar un archivo diferente.');
  const db = new Database(source, { readonly: true, fileMustExist: true, timeout: 5000 });
  let reserved = false;
  try {
    mkdirSync(dirname(destination), { recursive: true, mode: 0o700 });
    closeSync(openSync(destination, 'wx', 0o600));
    reserved = true;
    await db.backup(destination);
  } catch (error) {
    if (reserved) rmSync(destination, { force: true });
    throw error;
  } finally {
    db.close();
  }
}
