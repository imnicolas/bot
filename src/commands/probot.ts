import { probotAssetBase, probotMedia } from '../content/probot.js';
import type { Command } from './types.js';

export const probotCommands: readonly Command[] = probotMedia.map(({ name, file }) => ({
  access: 'public',
  feature: 'social',
  category: 'social',
  name,
  aliases: [],
  description: `Reacción de ${name} del catálogo de ProBot.`,
  execute: ({ userId }) => ({
    content: `<@${userId}>`,
    gif: probotAssetBase + file,
    mentionAuthor: true,
  }),
}));
