import type { Features } from '../config/features.js';
import type { LevelRepository } from '../features/levels/store.js';
import type { RandomIndex } from '../shared/random.js';

export interface MemberProfile {
  readonly id: string;
  readonly displayName: string;
  readonly avatarUrl?: string;
}

export interface CommandContext {
  readonly features?: Features;
  readonly userId: string;
  readonly guildId: string;
  readonly random: RandomIndex;
  readonly levels: LevelRepository;
  readonly actor?: MemberProfile;
  readonly members?: readonly MemberProfile[];
}

export interface ReplyCard {
  readonly title: string;
  readonly description?: string;
  readonly thumbnail?: string;
  readonly image?: string;
  readonly fields?: readonly {
    readonly name: string;
    readonly value: string;
    readonly inline?: boolean;
  }[];
  readonly footer?: string;
}

export interface CommandReply {
  readonly content: string;
  readonly gif?: string;
  readonly mentionAuthor?: boolean;
  readonly card?: ReplyCard;
}

export interface Command {
  readonly feature?: keyof Features;
  readonly access: 'public';
  readonly category: 'social' | 'progress' | 'info';
  readonly name: string;
  readonly aliases: readonly string[];
  readonly description: string;
  readonly usage?: string;
  readonly acceptsArgs?: boolean;
  execute(context: CommandContext, args: string): CommandReply;
}
