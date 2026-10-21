import type Database from 'better-sqlite3';
import { z } from 'zod';

export const XP_COOLDOWN_MS = 60_000;
const memberSchema = z.object({
  userId: z.string().regex(/^\d+$/),
  xp: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
});
export type LevelMember = z.infer<typeof memberSchema>;

export interface LevelRepository {
  award(guildId: string, userId: string, now: number, earned: number): boolean;
  profile(guildId: string, userId: string): LevelMember;
  ranking(guildId: string): readonly LevelMember[];
}

export function levelProgress(xp: number) {
  const level = Math.floor(Math.sqrt(xp / 100));
  const floor = 100 * level * level;
  const ceiling = 100 * (level + 1) * (level + 1);
  return { level, current: xp - floor, needed: ceiling - floor };
}

export class LevelStore implements LevelRepository {
  private readonly grant;
  private readonly member;
  private readonly leaders;

  constructor(db: Database.Database) {
    this.grant = db.prepare<[string, string, number, number]>(`
      INSERT INTO member_levels (guild_id, user_id, xp, last_awarded_at) VALUES (?, ?, ?, ?)
      ON CONFLICT (guild_id, user_id) DO UPDATE SET
        xp = member_levels.xp + excluded.xp, last_awarded_at = excluded.last_awarded_at
      WHERE member_levels.last_awarded_at <= excluded.last_awarded_at - ${XP_COOLDOWN_MS}
    `);
    this.member = db.prepare<[string, string]>(
      'SELECT user_id AS userId, xp FROM member_levels WHERE guild_id = ? AND user_id = ?',
    );
    this.leaders = db.prepare<[string]>(
      'SELECT user_id AS userId, xp FROM member_levels WHERE guild_id = ? ORDER BY xp DESC, user_id ASC LIMIT 10',
    );
  }

  award(guildId: string, userId: string, now: number, earned: number): boolean {
    z.object({
      guildId: z.string().regex(/^\d+$/),
      userId: z.string().regex(/^\d+$/),
      now: z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER),
      earned: z.number().int().min(15).max(25),
    }).parse({ guildId, userId, now, earned });
    return this.grant.run(guildId, userId, earned, now).changes === 1;
  }

  profile(guildId: string, userId: string): LevelMember {
    return memberSchema.parse(this.member.get(guildId, userId) ?? { userId, xp: 0 });
  }

  ranking(guildId: string): readonly LevelMember[] {
    return this.leaders.all(guildId).map((row) => memberSchema.parse(row));
  }
}
