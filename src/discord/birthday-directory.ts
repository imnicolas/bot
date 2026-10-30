import { REST, Routes } from 'discord.js';
import { z } from 'zod';
import { isSnowflake } from '../config/gifts.js';
import type { BirthdayDirectory, BirthdayMember } from '../features/gifts/resolve-members.js';

const memberSchema = z.object({ user: z.object({
  id: z.string().refine(isSnowflake), username: z.string(), discriminator: z.string(),
  bot: z.boolean().default(false),
}) });

export class DiscordBirthdayDirectory implements BirthdayDirectory {
  constructor(private readonly rest: REST, private readonly guildId: string) {}

  static withToken(token: string, guildId: string): DiscordBirthdayDirectory {
    return new DiscordBirthdayDirectory(new REST({ version: '10' }).setToken(token), guildId);
  }

  private memberData(raw: unknown): BirthdayMember {
    const { user } = memberSchema.parse(raw);
    return { userId: user.id, username: user.username, discriminator: user.discriminator, bot: user.bot };
  }

  async member(userId: string): Promise<BirthdayMember> {
    return this.memberData(await this.rest.get(Routes.guildMember(this.guildId, userId)));
  }

  async search(username: string): Promise<readonly BirthdayMember[]> {
    const raw = await this.rest.get(Routes.guildMembersSearch(this.guildId), {
      query: new URLSearchParams({ query: username, limit: '1000' }),
    });
    if (!Array.isArray(raw)) throw new Error('Discord devolvió una búsqueda de miembros inválida.');
    return raw.map((member: unknown) => this.memberData(member));
  }
}
