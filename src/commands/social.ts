import { probotCommands } from './probot.js';
import { reactions } from '../content/reactions.js';
import type { MealReactions, Reaction } from '../content/reactions.js';
import { pick } from '../shared/random.js';
import type { Command } from './types.js';

function reactionCommand(
  name: string,
  aliases: readonly string[],
  description: string,
  variants: readonly [Reaction, ...Reaction[]] | MealReactions,
  feature: 'social' | 'meals' = 'social',
): Command {
  return {
    access: 'public',
    feature,
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
  ...probotCommands,
  reactionCommand('grupo comando', [], 'Convocá al grupo comando.', reactions.grupo),
  reactionCommand('desayuno', [], 'Probá suerte: 1 en 3 de ganar el desayuno.', reactions.desayuno, 'meals'),
  reactionCommand(
    'almuerzo',
    ['aluerzo', 'lamuerzo'],
    'Probá suerte: 1 en 3 de ganar el almuerzo.',
    reactions.almuerzo,
    'meals',
  ),
  reactionCommand('cena', [], 'Probá suerte: 1 en 3 de ganar la cena.', reactions.cena, 'meals'),
];
