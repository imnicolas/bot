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
    content: file ? `<@${userId}>` : `<@${userId}>, la imagen original de ${name} no está disponible por ahora.`,
    ...(file ? { gif: probotAssetBase + file } : {}),
    mentionAuthor: true,
  }),
}));
