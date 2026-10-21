import { levelProgress } from '../features/levels/store.js';
import type { Command } from './types.js';
import { commandTarget, invalidTarget } from './member.js';

export const levelCommands: readonly Command[] = [
  {
    access: 'public',
    category: 'progress',
    name: 'nivel',
    aliases: ['rank'],
    acceptsArgs: true,
    usage: 'nivel [@usuario]',
    description: 'Nivel y progreso de XP.',
    execute(context, args) {
      const target = commandTarget(context, args);
      if (!target) return invalidTarget;
      const { xp } = context.levels.profile(context.guildId, target.id);
      const progress = levelProgress(xp);
      return {
        content: `<@${target.id}>`,
        card: {
          title: `Nivel de ${target.displayName}`,
          ...(target.avatarUrl ? { thumbnail: target.avatarUrl } : {}),
          fields: [
            { name: 'Nivel', value: String(progress.level), inline: true },
            { name: 'Experiencia', value: `${xp} XP`, inline: true },
            { name: 'Próximo nivel', value: `${progress.current} / ${progress.needed} XP` },
          ],
          footer: 'XP registrado por este bot · cooldown de 60 segundos',
        },
      };
    },
  },
  {
    access: 'public',
    category: 'progress',
    acceptsArgs: true,
    name: 'ranking',
    aliases: ['top', 'niveles'],
    description: 'Los 10 miembros con más XP de participación.',
    execute({ guildId, levels }, args) {
      if (args && !['text', 'texto'].includes(args.toLowerCase()))
        return { content: 'Usá `ranking` para ver el top de participación.' };
      const members = levels.ranking(guildId);
      return {
        content:
          members.length === 0
            ? 'Todavía no hay XP. ¡Sumate a la conversación!'
            : '**Ranking de participación**\n' +
              members
                .map(
                  (p, i) =>
                    `${i + 1}. <@${p.userId}> — Nivel **${levelProgress(p.xp).level}** · **${p.xp} XP**`,
                )
                .join('\n'),
      };
    },
  },
];
