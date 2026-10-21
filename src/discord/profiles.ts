import type { GuildMember, Message, User } from 'discord.js';
import type { MemberProfile } from '../commands/types.js';
import type { IncomingMessage } from './messages.js';

function profile(user: User, member?: GuildMember | null): MemberProfile {
  return {
    id: user.id,
    displayName: member?.displayName ?? user.globalName ?? user.username,
    avatarUrl: member?.displayAvatarURL({ size: 512 }) ?? user.displayAvatarURL({ size: 512 }),
  };
}

export function fromDiscordMessage(message: Message): IncomingMessage {
  return {
    content: message.content,
    author: message.author,
    guildId: message.guildId,
    system: message.system,
    webhookId: message.webhookId,
    actor: profile(message.author, message.member),
    members: message.mentions.members?.map((member) => profile(member.user, member)) ?? [],
    reply: (options) => message.reply(options),
  };
}
