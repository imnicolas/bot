import type { Birthday, BirthdayInput } from './birthdays.js';

export interface BirthdayMember {
  readonly userId: string;
  readonly username: string;
  readonly discriminator: string;
  readonly bot: boolean;
}
export interface BirthdayDirectory {
  member(userId: string): Promise<BirthdayMember>;
  search(username: string): Promise<readonly BirthdayMember[]>;
}

export async function resolveBirthdayMembers(
  rows: readonly BirthdayInput[], directory: BirthdayDirectory,
): Promise<Birthday[]> {
  const birthdays: Birthday[] = [];
  const ids = new Set<string>();
  for (const [index, row] of rows.entries()) {
    let member: BirthdayMember;
    if (row.userId) {
      member = await directory.member(row.userId);
      if (member.userId !== row.userId) throw new Error(`Fila ${index + 2}: el ID devuelto no coincide.`);
      if (row.username && (member.username.toLowerCase() !== row.username || member.discriminator !== '0')) {
        throw new Error(`Fila ${index + 2}: el ID y el username no corresponden a la misma cuenta. Revisalos antes de importar.`);
      }
    } else {
      if (!row.username) throw new Error(`Fila ${index + 2}: falta ID o username.`);
      const matches = (await directory.search(row.username)).filter((m) =>
        m.username.toLowerCase() === row.username && m.discriminator === '0');
      if (matches.length !== 1) throw new Error(`Fila ${index + 2}: no hay una coincidencia única y exacta de username en este servidor. Revisá la escritura o usá el ID.`);
      member = matches[0]!;
    }
    if (member.bot || ids.has(member.userId)) throw new Error(`Fila ${index + 2}: cuenta bot o miembro repetido después de resolver las identidades.`);
    ids.add(member.userId);
    birthdays.push({ userId: member.userId, name: row.name, dayMonth: row.dayMonth, ...(row.category ? { category: row.category } : {}) });
  }
  return birthdays;
}
