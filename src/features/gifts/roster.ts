import { parse } from 'csv-parse/sync';
import type Database from 'better-sqlite3';
import { parseBirthdayInput } from './birthdays.js';
import type { Birthday } from './birthdays.js';
import { GiftStore } from './store.js';

export interface GiftMemberDetails {
  readonly userId: string;
  readonly username: string;
  readonly firstName: string;
  readonly lastName: string;
  readonly phone: string;
  readonly address: string;
  readonly city: string;
  readonly postalCode: string;
}
export interface GiftRosterEntry {
  readonly birthday: Birthday;
  readonly details: GiftMemberDetails;
}

const keys = ['userId', 'username', 'firstName', 'lastName', 'dayMonth', 'phone', 'address', 'city', 'postalCode'] as const;
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;

export function parseGiftRoster(csv: string): GiftRosterEntry[] {
  if (Buffer.byteLength(csv, 'utf8') > 1024 * 1024) throw new Error('CSV demasiado grande (máximo 1 MiB).');
  const aliases: Readonly<Record<string, string>> = {
    'user id': 'userId', 'ds name': 'username', 'usuario discord': 'username', username: 'username',
    nombre: 'firstName', apellido: 'lastName', 'dia de cumpleanitos': 'dayMonth', 'fecha cumple': 'dayMonth',
    telefono: 'phone', direccion: 'address', ciudad: 'city', 'codigo postal': 'postalCode',
    categoria: 'category', category: 'category',
  };
  let rows: Record<string, string>[];
  try {
    rows = parse(csv, { bom: true, trim: true, skip_empty_lines: true, max_record_size: 4096,
      columns(headers: string[]) {
        const fields = headers.map((h) => {
          const key = h.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim().replaceAll('_', ' ').replace(/\s+/g, ' ');
          return Object.hasOwn(aliases, key) ? aliases[key] : undefined;
        });
        if ((fields.length !== keys.length && fields.length !== keys.length + 1) || fields.some((f) => !f) ||
          new Set(fields).size !== fields.length || !keys.every((k) => fields.includes(k))) {
          throw new Error('Cabecera de padrón inválida.');
        }
        return fields as string[];
      },
    }) as Record<string, string>[];
  } catch {
    // CSV parser diagnostics can contain field contents, including private contact data.
    throw new Error('CSV de padrón inválido. Usá las nueve columnas de la planilla, categoría opcional y comillas para valores con comas.');
  }
  const projected = 'User Id,DS Name,Nombre,Apellido,fecha cumple\n' + rows.map((row) =>
    ['userId', 'username', 'firstName', 'lastName', 'dayMonth'].map((k) => quote(row[k] ?? '')).join(',')).join('\n');
  const identities = parseBirthdayInput(projected);
  return identities.map((identity, i) => {
    const row = rows[i]!;
    const category = row['category'];
    if (category !== undefined && category !== 'gift' && category !== 'no-gift') throw new Error(`Fila ${i + 2}: categoría inválida. Usá gift o no-gift.`);
    if (!identity.userId || !identity.username) throw new Error(`Fila ${i + 2}: el padrón requiere ID y username verificados.`);
    for (const field of ['phone', 'address', 'city', 'postalCode'] as const) {
      const value = row[field] ?? '';
      const limit = field === 'address' ? 500 : field === 'city' ? 200 : 32;
      if (!value || value.length > limit || /[\p{Cc}\p{Cf}]/u.test(value)) throw new Error(`Fila ${i + 2}: revisar ${field}.`);
    }
    if (!/^\+?[0-9][0-9 ()-]*$/.test(row['phone']!)) throw new Error(`Fila ${i + 2}: teléfono inválido.`);
    return {
      birthday: { userId: identity.userId, name: identity.name, dayMonth: identity.dayMonth, ...(category ? { category } : {}) },
      details: { userId: identity.userId, username: identity.username, firstName: row['firstName']!, lastName: row['lastName']!,
        phone: row['phone']!, address: row['address']!, city: row['city']!, postalCode: row['postalCode']! },
    };
  });
}

export class GiftRosterStore {
  constructor(private readonly db: Database.Database) {}

  import(guildId: string, entries: readonly GiftRosterEntry[]): void {
    const birthdays = new GiftStore(this.db);
    const save = this.db.prepare(`INSERT INTO gift_member_details
      (guild_id,user_id,username,first_name,last_name,phone,address,city,postal_code) VALUES (?,?,?,?,?,?,?,?,?)
      ON CONFLICT(guild_id,user_id) DO UPDATE SET username=excluded.username,first_name=excluded.first_name,
        last_name=excluded.last_name,phone=excluded.phone,address=excluded.address,city=excluded.city,postal_code=excluded.postal_code`);
    this.db.transaction(() => {
      birthdays.import(guildId, entries.map((e) => e.birthday));
      for (const { details: d } of entries) save.run(guildId, d.userId, d.username, d.firstName, d.lastName, d.phone, d.address, d.city, d.postalCode);
    }).immediate();
  }

  members(guildId: string): GiftMemberDetails[] {
    return this.db.prepare<[string], GiftMemberDetails>(`SELECT user_id AS userId,username,first_name AS firstName,
      last_name AS lastName,phone,address,city,postal_code AS postalCode FROM gift_member_details WHERE guild_id=? ORDER BY user_id`).all(guildId);
  }
}
