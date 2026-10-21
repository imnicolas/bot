import { reactions } from '../content/reactions.js';
import type { MealReactions, Reaction } from '../content/reactions.js';
import { pick } from '../shared/random.js';
import type { Command } from './types.js';

function reactionCommand(
  name: string,
  aliases: readonly string[],
  description: string,
  variants: readonly [Reaction, ...Reaction[]] | MealReactions,
): Command {
  return {
    access: 'public',
    category: 'social',
    name,
    aliases,
    description,
    execute({ userId, random }) {
      const options =
        'win' in variants ? variants[pick(['win', 'lose', 'lose'] as const, random)] : variants;
      const reaction = pick(options, random);
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
  reactionCommand('desayuno', [], 'Probá suerte: 1 en 3 de ganar el desayuno.', reactions.desayuno),
  reactionCommand(
    'almuerzo',
    ['aluerzo', 'lamuerzo'],
    'Probá suerte: 1 en 3 de ganar el almuerzo.',
    reactions.almuerzo,
  ),
  reactionCommand('cena', [], 'Probá suerte: 1 en 3 de ganar la cena.', reactions.cena),
];
