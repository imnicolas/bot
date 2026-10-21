import { reactions } from '../content/reactions.js';
import type { Reaction } from '../content/reactions.js';
import { pick } from '../shared/random.js';
import type { Command } from './types.js';

function reactionCommand(
  name: string,
  aliases: readonly string[],
  description: string,
  variants: readonly [Reaction, ...Reaction[]],
): Command {
  return {
    access: 'public',
    category: 'social',
    name,
    aliases,
    description,
    execute({ userId, random }) {
      const reaction = pick(variants, random);
      return {
        content: reaction.text.replaceAll('{user}', `<@${userId}>`),
        gif: reaction.gif,
        mentionAuthor: true,
      };
    },
  };
}

export const socialCommands: readonly Command[] = [
  reactionCommand('grupo comando', [], 'Convocá al grupo comando.', reactions.grupo),
  reactionCommand('desayuno', [], 'Café, medialunas o una gastada al azar.', reactions.desayuno),
  reactionCommand('almuerzo', ['aluerzo'], 'A ver qué se come hoy.', reactions.almuerzo),
  reactionCommand('cena', [], 'Organizá la cena con una respuesta al azar.', reactions.cena),
];
