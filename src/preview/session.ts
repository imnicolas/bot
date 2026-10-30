import { defaultFeatures } from '../config/features.js';
import type { Features } from '../config/features.js';
import type { MessageReplyOptions } from 'discord.js';
import { commandCatalog } from '../commands/registry.js';
import type { MemberProfile } from '../commands/types.js';
import { openDatabase } from '../database/connection.js';
import { handleMessage } from '../discord/messages.js';
import { LevelStore, levelProgress } from '../features/levels/store.js';
import { GiftStore } from '../features/gifts/store.js';
import type { RandomIndex } from '../shared/random.js';

export const demoMembers: readonly MemberProfile[] = [
  { id: '101', displayName: 'Lucía', avatarUrl: 'https://cdn.discordapp.com/embed/avatars/0.png' },
  { id: '102', displayName: 'Nico', avatarUrl: 'https://cdn.discordapp.com/embed/avatars/1.png' },
  { id: '103', displayName: 'Mara', avatarUrl: 'https://cdn.discordapp.com/embed/avatars/2.png' },
];

// Sin token, red de Discord ni ruta de producción: cada sesión tiene su propia
// SQLite en memoria. Las respuestas pasan por el mismo handler del bot.
export class DemoSession {
  private readonly db = openDatabase(':memory:');
  private readonly levels = new LevelStore(this.db);
  private clock = new Date('2026-10-20T12:00:00-03:00').getTime();

  constructor(private readonly random?: RandomIndex, private readonly features: Features = defaultFeatures) {
    if (!features.levels) return;
    for (const [index, member] of demoMembers.entries()) {
      const count = [4, 22, 10][index] ?? 0;
      for (let step = 0; step < count; step++) {
        this.levels.award(
          '1',
          member.id,
          this.clock - 7_200_000 + step * 60_000,
          index === 0 && step < 3 ? 25 : 20,
        );
      }
    }
  }

  state() {
    return {
      now: new Date(this.clock).toISOString(),
      members: demoMembers.map((member) => {
        const { xp } = this.levels.profile('1', member.id);
        return { ...member, xp, ...levelProgress(xp) };
      }),
      features: this.features,
      commands: commandCatalog(this.features),
    };
  }

  advance(minutes: number): void {
    if (minutes !== 1) throw new Error('La demo sólo permite avanzar un minuto.');
    this.clock += minutes * 60_000;
  }

  async send(userId: string, content: string) {
    const actor = demoMembers.find((member) => member.id === userId);
    if (!actor) throw new Error('Elegí un miembro de la demo.');
    const replies: MessageReplyOptions[] = [];
    await handleMessage(
      {
        author: { id: actor.id, bot: false },
        guildId: '1',
        system: false,
        webhookId: null,
        content,
        actor,
        members: demoMembers,
        reply: async (reply) => {
          replies.push(reply);
        },
      },
      {
        levels: this.levels,
        birthdays: new GiftStore(this.db),
        features: this.features,
        now: () => new Date(this.clock),
        ...(this.random ? { random: this.random } : {}),
      },
    );
    return { actor, content, replies, state: this.state() };
  }

  close(): void {
    this.db.close();
  }
}
