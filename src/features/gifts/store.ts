import type Database from 'better-sqlite3';
import type { Birthday, GiftCategory } from './birthdays.js';
import type { GiftConfig } from '../../config/gifts.js';

export type ViewState = -1 | 0 | 1;
export type CycleState = 'prepared' | 'hidden' | 'publishing' | 'announced' | 'restoring' | 'restored';
export interface GiftCycle {
  readonly id: number;
  readonly guildId: string;
  readonly channelId: string;
  readonly userId: string;
  readonly name: string;
  readonly birthday: string;
  readonly priorView: ViewState;
  readonly state: CycleState;
  readonly messageId: string | null;
  readonly exclusionMode: 'bot' | 'manual';
  readonly accessRoleId: string | null;
}
export interface AdminNotice {
  readonly id: number;
  readonly guildId: string;
  readonly userId: string;
  readonly recipientId: string;
  readonly name: string;
  readonly birthday: string;
  readonly state: 'pending' | 'sending' | 'sent' | 'uncertain';
  readonly messageId: string | null;
  readonly retryAt: number;
}
const columns = 'id, guild_id AS guildId, channel_id AS channelId, user_id AS userId, name, birthday, prior_view AS priorView, state, message_id AS messageId, exclusion_mode AS exclusionMode, access_role_id AS accessRoleId';

export class GiftStore {
  constructor(private readonly db: Database.Database) {}

  import(guildId: string, birthdays: readonly Birthday[]): void {
    // Upsert only: omission from a later CSV never silently deletes an existing birthday or exclusion.
    const insert = this.db.prepare(`INSERT INTO gift_birthdays (guild_id,user_id,name,day_month,category) VALUES (?, ?, ?, ?, COALESCE(?, 'gift'))
      ON CONFLICT (guild_id, user_id) DO UPDATE SET name = excluded.name, day_month = excluded.day_month,
        category = COALESCE(?, gift_birthdays.category)`);
    const active = this.db.prepare('SELECT 1 FROM gift_cycles WHERE guild_id=? AND user_id=? AND state != \'restored\' LIMIT 1');
    this.db.transaction(() => {
      for (const b of birthdays) {
        if (b.category === 'no-gift' && active.get(guildId, b.userId)) throw new Error('Reincorporá y cerrá la organización activa antes de marcar no-gift.');
        insert.run(guildId, b.userId, b.name, b.dayMonth, b.category ?? null, b.category ?? null);
      }
    }).immediate();
  }

  birthdays(guildId: string): Birthday[] {
    return this.db.prepare<[string], Birthday & { category: GiftCategory }>('SELECT user_id AS userId, name, day_month AS dayMonth, category FROM gift_birthdays WHERE guild_id = ? ORDER BY user_id').all(guildId)
      .map(({ category, ...b }) => category === 'no-gift' ? { ...b, category } : b);
  }

  category(guildId: string, userId: string): GiftCategory | undefined {
    return this.db.prepare<[string, string], { category: GiftCategory }>('SELECT category FROM gift_birthdays WHERE guild_id=? AND user_id=?').get(guildId, userId)?.category;
  }

  cycles(config: GiftConfig): GiftCycle[] {
    return this.db.prepare<[string, string], GiftCycle>(`SELECT ${columns} FROM gift_cycles WHERE guild_id = ? AND channel_id = ? ORDER BY id`).all(config.guildId, config.channelId);
  }

  get(id: number): GiftCycle | undefined {
    return this.db.prepare<[number], GiftCycle>(`SELECT ${columns} FROM gift_cycles WHERE id = ?`).get(id);
  }

  prepare(config: GiftConfig, birthday: Birthday, date: string, prior: ViewState, mode: GiftCycle['exclusionMode'] = 'bot'): GiftCycle {
    if (this.category(config.guildId, birthday.userId) === 'no-gift') throw new Error('Categoría no-gift: no se organiza regalo.');
    const result = this.db.prepare(`INSERT INTO gift_cycles (guild_id, channel_id, user_id, name, birthday, prior_view, state, exclusion_mode, access_role_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(config.guildId, config.channelId, birthday.userId, birthday.name, date, prior,
        mode === 'manual' ? 'hidden' : 'prepared', mode, config.roleId);
    return this.get(Number(result.lastInsertRowid))!;
  }

  state(id: number, state: CycleState, messageId?: string): void {
    this.db.prepare('UPDATE gift_cycles SET state = ?, message_id = COALESCE(?, message_id) WHERE id = ?').run(state, messageId ?? null, id);
  }

  participate(id: number, userId: string, joined: boolean): number {
    if (joined) this.db.prepare('INSERT OR IGNORE INTO gift_participants VALUES (?, ?)').run(id, userId);
    else this.db.prepare('DELETE FROM gift_participants WHERE cycle_id = ? AND user_id = ?').run(id, userId);
    return this.participants(id).length;
  }

  participants(id: number): string[] {
    return this.db.prepare<[number], { user_id: string }>('SELECT user_id FROM gift_participants WHERE cycle_id = ? ORDER BY user_id').all(id).map((r) => r.user_id);
  }

  adminNotice(guildId: string, userId: string, birthday: string): AdminNotice | undefined {
    return this.db.prepare<[string, string, string], AdminNotice>(`SELECT id, guild_id AS guildId,
      user_id AS userId, recipient_id AS recipientId, name, birthday, state,
      message_id AS messageId, retry_at AS retryAt FROM gift_admin_notices
      WHERE guild_id = ? AND user_id = ? AND birthday = ?`).get(guildId, userId, birthday);
  }

  prepareAdminNotice(guildId: string, birthday: Birthday, date: string, recipientId: string): AdminNotice {
    this.db.prepare(`INSERT OR IGNORE INTO gift_admin_notices
      (guild_id, user_id, recipient_id, name, birthday, state) VALUES (?, ?, ?, ?, ?, 'pending')`)
      .run(guildId, birthday.userId, recipientId, birthday.name, date);
    const notice = this.adminNotice(guildId, birthday.userId, date)!;
    if (notice.recipientId !== recipientId) throw new Error('Cambió el destinatario del aviso privado; revisá el registro antes de enviarlo.');
    return notice;
  }

  adminNoticeState(id: number, state: AdminNotice['state'], retryAt = 0, messageId?: string): void {
    this.db.prepare(`UPDATE gift_admin_notices SET state = ?, retry_at = ?,
      message_id = COALESCE(?, message_id) WHERE id = ?`).run(state, retryAt, messageId ?? null, id);
  }
}
