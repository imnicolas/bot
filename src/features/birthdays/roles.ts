import type Database from 'better-sqlite3';
import type { BirthdayRecord } from './workbook.js';
import { birthdayWindow } from './calendar.js';

export interface BirthdayRoleState {
  readonly guildId: string;
  readonly userId: string;
  readonly roleId: string;
  readonly removeAfter: string;
  readonly rolePreexisted: boolean;
}

export interface BirthdayRoleStateStore {
  get(guildId: string, userId: string, roleId: string): BirthdayRoleState | undefined;
  list(guildId: string): readonly BirthdayRoleState[];
  put(state: BirthdayRoleState): void;
  delete(guildId: string, userId: string, roleId: string): void;
}

export class SqliteBirthdayRoleStateStore implements BirthdayRoleStateStore {
  constructor(private readonly db: Database.Database) {}

  get(guildId: string, userId: string, roleId: string): BirthdayRoleState | undefined {
    const row = this.db.prepare(`
      SELECT guild_id, user_id, role_id, remove_after, role_preexisted
      FROM birthday_role_states WHERE guild_id = ? AND user_id = ? AND role_id = ?
    `).get(guildId, userId, roleId) as {
      guild_id: string;
      user_id: string;
      role_id: string;
      remove_after: string;
      role_preexisted: number;
    } | undefined;
    return row && {
      guildId: row.guild_id,
      userId: row.user_id,
      roleId: row.role_id,
      removeAfter: row.remove_after,
      rolePreexisted: row.role_preexisted === 1,
    };
  }

  list(guildId: string): readonly BirthdayRoleState[] {
    return (this.db.prepare(`
      SELECT guild_id, user_id, role_id, remove_after, role_preexisted
      FROM birthday_role_states WHERE guild_id = ?
    `).all(guildId) as {
      guild_id: string;
      user_id: string;
      role_id: string;
      remove_after: string;
      role_preexisted: number;
    }[]).map((row) => ({
      guildId: row.guild_id,
      userId: row.user_id,
      roleId: row.role_id,
      removeAfter: row.remove_after,
      rolePreexisted: row.role_preexisted === 1,
    }));
  }

  put(state: BirthdayRoleState): void {
    this.db.prepare(`
      INSERT INTO birthday_role_states
        (guild_id, user_id, role_id, remove_after, role_preexisted)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT (guild_id, user_id, role_id) DO NOTHING
    `).run(
      state.guildId,
      state.userId,
      state.roleId,
      state.removeAfter,
      state.rolePreexisted ? 1 : 0,
    );
  }

  delete(guildId: string, userId: string, roleId: string): void {
    this.db.prepare(`
      DELETE FROM birthday_role_states WHERE guild_id = ? AND user_id = ? AND role_id = ?
    `).run(guildId, userId, roleId);
  }
}

export interface BirthdayMember {
  readonly roles: {
    readonly cache: { has(roleId: string): boolean };
    add(roleId: string): Promise<unknown>;
    remove(roleId: string): Promise<unknown>;
  };
}

export interface BirthdayGuild {
  readonly id: string;
  readonly members: { fetch(userId: string): Promise<BirthdayMember> };
}

export interface BirthdaySyncResult {
  readonly assigned: number;
  readonly removed: number;
  readonly unchanged: number;
  readonly failed: number;
}

export async function reconcileBirthdayRoles(options: {
  readonly guild: BirthdayGuild;
  readonly store: BirthdayRoleStateStore;
  readonly records: readonly BirthdayRecord[];
  readonly roleId: string;
  readonly today: string;
}): Promise<BirthdaySyncResult> {
  const { guild, store, records, roleId, today } = options;
  const configuredUsers = new Set(records.map((record) => record.userId));
  const visited = new Set<string>();
  const result = { assigned: 0, removed: 0, unchanged: 0, failed: 0 };

  for (const record of records) {
    visited.add(`${record.userId}:${roleId}`);
    const window = birthdayWindow(today, record.month, record.day);
    const state = store.get(guild.id, record.userId, roleId);
    if (!window.active && !state) continue;

    try {
      const member = await guild.members.fetch(record.userId);
      const hasRole = member.roles.cache.has(roleId);
      if (window.active) {
        if (!state && hasRole) {
          store.put({
            guildId: guild.id,
            userId: record.userId,
            roleId,
            removeAfter: window.removeAfter,
            rolePreexisted: true,
          });
          result.unchanged++;
        } else if (!state) {
          store.put({
            guildId: guild.id,
            userId: record.userId,
            roleId,
            removeAfter: window.removeAfter,
            rolePreexisted: false,
          });
          await member.roles.add(roleId);
          result.assigned++;
        } else if (!state.rolePreexisted && !hasRole) {
          await member.roles.add(roleId);
          result.assigned++;
        } else {
          result.unchanged++;
        }
      } else if (state) {
        if (!state.rolePreexisted && hasRole) {
          await member.roles.remove(roleId);
          result.removed++;
        } else {
          result.unchanged++;
        }
        store.delete(guild.id, record.userId, roleId);
      }
    } catch (error) {
      result.failed++;
      console.error(`No se pudo sincronizar el rol de cumpleaños para ${record.userId}:`, error);
    }
  }

  for (const state of store.list(guild.id)) {
    const key = `${state.userId}:${state.roleId}`;
    if (visited.has(key) || (state.roleId === roleId && configuredUsers.has(state.userId))) continue;
    try {
      const member = await guild.members.fetch(state.userId);
      if (!state.rolePreexisted && member.roles.cache.has(state.roleId)) {
        await member.roles.remove(state.roleId);
        result.removed++;
      } else {
        result.unchanged++;
      }
      store.delete(guild.id, state.userId, state.roleId);
    } catch (error) {
      result.failed++;
      console.error(`No se pudo limpiar un rol de cumpleaños para ${state.userId}:`, error);
    }
  }

  return result;
}