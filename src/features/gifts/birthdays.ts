import { parse } from 'csv-parse/sync';
import { isSnowflake } from '../../config/gifts.js';

export type GiftCategory = 'gift' | 'no-gift';
export interface Birthday { readonly userId: string; readonly name: string; readonly dayMonth: string; readonly category?: GiftCategory }
export interface BirthdayInput {
  readonly userId?: string;
  readonly username?: string;
  readonly name: string;
  readonly dayMonth: string;
  readonly category?: GiftCategory;
}

export function parseBirthdayInput(csv: string): BirthdayInput[] {
  if (Buffer.byteLength(csv, 'utf8') > 1024 * 1024) throw new Error('CSV demasiado grande (máximo 1 MiB).');
  const aliases: Readonly<Record<string, string>> = {
    'user id': 'userId', nombre: 'name', apellido: 'surname',
    username: 'username', usuario: 'username', 'usuario discord': 'username', 'ds name': 'username',
    'fecha cumple': 'dayMonth', 'dia de cumpleanitos': 'dayMonth',
    categoria: 'category', category: 'category',
  };
  const rows: unknown = parse(csv, {
    bom: true, skip_empty_lines: true, trim: true, max_record_size: 4096,
    columns(headers: string[]) {
      const normalized = headers.map((h) => {
        const key = h.normalize('NFD').replace(/\p{M}/gu, '')
          .trim().toLowerCase().replaceAll('_', ' ').replace(/\s+/g, ' ');
        return Object.hasOwn(aliases, key) ? aliases[key] : undefined;
      });
      if (normalized.some((h) => !h) || new Set(normalized).size !== normalized.length ||
        !normalized.includes('name') || !normalized.includes('dayMonth') ||
        (!normalized.includes('userId') && !normalized.includes('username'))) {
        throw new Error('Cabecera esperada: user_id o Usuario Discord, Nombre, Apellido (opcional), fecha cumple o Dia de cumpleañitos.');
      }
      return normalized as string[];
    },
  });
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > 1000) throw new Error('El CSV debe tener entre 1 y 1000 cumpleaños.');
  const seen = new Set<string>();
  const usernames = new Set<string>();
  return rows.map((raw: unknown, i: number) => {
    const row = raw as Record<string, string>;
    const userId = row['userId'] ?? '';
    const username = (row['username'] ?? '').replace(/^@/, '').toLowerCase();
    const firstName = row['name'] ?? '';
    const name = [firstName, row['surname']].filter(Boolean).join(' ');
    const dayMonth = row['dayMonth'] ?? '';
    const category = row['category'];
    if (category !== undefined && category !== 'gift' && category !== 'no-gift') throw new Error(`Fila ${i + 2}: categoría inválida. Usá gift o no-gift.`);
    const day = Number(dayMonth.slice(0, 2));
    const month = Number(dayMonth.slice(3));
    const date = new Date(Date.UTC(2000, month - 1, day));
    if ((!userId && !username) || (userId && (!isSnowflake(userId) || seen.has(userId))) ||
      (username && (!/^[a-z0-9_.]{2,32}$/.test(username) || username.includes('..') || usernames.has(username))) ||
      !firstName || name.length > 100 ||
      /[\p{Cc}\p{Cf}]/u.test(name) || !/^\d{2}\/\d{2}$/.test(dayMonth) ||
      date.getUTCDate() !== day || date.getUTCMonth() !== month - 1) {
      throw new Error(`Cumpleaños inválido o identidad repetida en fila ${i + 2}. Usá ID o username exacto, nombre y DD/MM.`);
    }
    if (userId) seen.add(userId);
    if (username) usernames.add(username);
    return { ...(userId ? { userId } : {}), ...(username ? { username } : {}), name, dayMonth, ...(category ? { category } : {}) };
  });
}

export function parseBirthdays(csv: string): Birthday[] {
  return parseBirthdayInput(csv).map((row) => {
    if (!row.userId || row.username) throw new Error('El CSV contiene usernames. Ejecutá gifts:resolve y revisá el CSV con IDs antes de importarlo.');
    return { userId: row.userId, name: row.name, dayMonth: row.dayMonth, ...(row.category ? { category: row.category } : {}) };
  });
}

export function birthdaysCSV(birthdays: readonly Birthday[]): string {
  const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
  const categories = birthdays.some((b) => b.category !== undefined);
  return `user_id,nombre,fecha cumple${categories ? ',categoria' : ''}\n` + birthdays.map((b) =>
    [b.userId, b.name, b.dayMonth, ...(categories ? [b.category ?? 'gift'] : [])].map(quote).join(',')).join('\n') + '\n';
}

export function localDay(now: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat('en', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
  const part = (type: string) => parts.find((p) => p.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

// Calendar arithmetic in UTC avoids local DST changes. Feb 29 becomes Feb 28 in non-leap years.
export function dueBirthday(dayMonth: string, today: string): string | undefined {
  const year = Number(today.slice(0, 4));
  const day = Number(dayMonth.slice(0, 2));
  const month = Number(dayMonth.slice(3));
  for (const candidate of [year, year + 1]) {
    const last = new Date(Date.UTC(candidate, month, 0)).getUTCDate();
    const birthday = new Date(Date.UTC(candidate, month - 1, Math.min(day, last)));
    const date = birthday.toISOString().slice(0, 10);
    const start = new Date(birthday.getTime() - 7 * 86400000).toISOString().slice(0, 10);
    if (today >= start && today <= date) return date;
  }
  return undefined;
}
