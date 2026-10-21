import type { CommandContext, MemberProfile } from './types.js';

export function commandTarget(context: CommandContext, args: string): MemberProfile | undefined {
  const self = context.actor ?? { id: context.userId, displayName: 'Miembro' };
  if (!args.trim()) return self;
  const id = /^<@!?(\d+)>$/.exec(args.trim())?.[1];
  if (id === context.userId) return self;
  return context.members?.find((member) => member.id === id);
}

export const invalidTarget = {
  content: 'Mencioná a un miembro de este servidor, por ejemplo `nivel @usuario`.',
};
