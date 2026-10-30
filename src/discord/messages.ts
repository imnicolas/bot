import type { Message, MessageReplyOptions } from 'discord.js';
import { defaultFeatures } from '../config/features.js';
import type { Features } from '../config/features.js';
import { executeCommand, parseCommand } from '../commands/registry.js';
import type { CommandReply, MemberProfile } from '../commands/types.js';
import type { LevelRepository } from '../features/levels/store.js';
import { levelProgress } from '../features/levels/store.js';
import { randomIndex } from '../shared/random.js';
import type { RandomIndex } from '../shared/random.js';
import type { BirthdayReader } from '../commands/birthdays.js';

export interface IncomingMessage {
  readonly author: Pick<Message['author'], 'id' | 'bot'>;
  readonly webhookId: string | null;
  readonly guildId: string | null;
  readonly system: boolean;
  readonly content: string;
  readonly actor?: MemberProfile;
  readonly members?: readonly MemberProfile[];
  reply(options: MessageReplyOptions): Promise<unknown>;
}

export function toDiscordReply(reply: CommandReply, userId: string): MessageReplyOptions {
  const card = reply.card;
  const picture = card?.image ?? reply.gif;
  return {
    content: reply.content,
    ...(card || picture
      ? {
          embeds: [
            {
              color: 0x5865f2,
              ...(card ? { title: card.title } : {}),
              ...(card?.description ? { description: card.description } : {}),
              ...(card?.fields ? { fields: card.fields.map((field) => ({ ...field })) } : {}),
              ...(card?.thumbnail ? { thumbnail: { url: card.thumbnail } } : {}),
              ...(card?.footer ? { footer: { text: card.footer } } : {}),
              ...(picture ? { image: { url: picture } } : {}),
            },
          ],
        }
      : {}),
    allowedMentions: { parse: [], users: reply.mentionAuthor ? [userId] : [], repliedUser: false },
  };
}

export interface MessageServices {
  readonly features?: Features;
  readonly levels: LevelRepository;
  readonly birthdays?: BirthdayReader;
  readonly now?: () => Date;
  readonly random?: RandomIndex;
}

export async function handleMessage(
  message: IncomingMessage,
  services: MessageServices,
): Promise<void> {
  if (message.author.bot || message.webhookId || !message.guildId || message.system) return;
  try {
    const now = services.now?.() ?? new Date();
    const random = services.random ?? randomIndex;
    const reply = executeCommand(message.content, {
      features: services.features ?? defaultFeatures,
      userId: message.author.id,
      guildId: message.guildId,
      random,
      levels: services.levels,
      ...(services.birthdays ? { birthdays: services.birthdays } : {}),
      ...(message.actor ? { actor: message.actor } : {}),
      ...(message.members ? { members: message.members } : {}),
    });
    if (reply) await message.reply(toDiscordReply(reply, message.author.id));
    else if (
      (services.features ?? defaultFeatures).levels && !parseCommand(message.content) &&
      message.content.trim().length >= 5 && !/^[!/]/.test(message.content.trim())
    ) {
      try {
        const before = levelProgress(
          services.levels.profile(message.guildId, message.author.id).xp,
        ).level;
        const awarded = services.levels.award(
          message.guildId,
          message.author.id,
          now.getTime(),
          15 + random(11),
        );
        if (awarded) {
          const after = levelProgress(
            services.levels.profile(message.guildId, message.author.id).xp,
          ).level;
          if (after > before)
            await message.reply(
              toDiscordReply(
                {
                  content: `Treeemendoo, <@${message.author.id}>! ¡Alcanzaste el **nivel ${after}**! 😎 🎉`,
                  mentionAuthor: true,
                },
                message.author.id,
              ),
            );
        }
      } catch (error) {
        console.error('No se pudo guardar el XP:', error);
      }
    }
  } catch (error) {
    console.error('No se pudo procesar el comando:', error);
    await message
      .reply({
        content: 'Se me cruzaron los cables, paps. Probá de nuevo en un rato.',
        allowedMentions: { parse: [], repliedUser: false },
      })
      .catch((replyError: unknown) =>
        console.error('No se pudo enviar el aviso de error:', replyError),
      );
  }
}
