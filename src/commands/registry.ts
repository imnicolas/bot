import { levelCommands } from './levels.js';
import { socialCommands } from './social.js';
import type { Command, CommandContext, CommandReply } from './types.js';

const commands: readonly Command[] = [...socialCommands, ...levelCommands];
const categories = { social: 'GIFs del grupo', progress: 'Participación', info: 'Ayuda' } as const;
const help: Command = {
  access: 'public',
  category: 'info',
  name: 'ayuda',
  aliases: ['comandos', 'help'],
  description: 'Lista de comandos públicos.',
  execute: () => ({
    content:
      '**Comandos de Argentina Developer 🧉**\n' +
      Object.entries(categories)
        .map(
          ([key, title]) =>
            `\n**${title}**\n` +
            [...commands, help]
              .filter((c) => c.category === key)
              .map((c) => `\`${c.usage ?? c.name}\` · ${c.description}`)
              .join('\n'),
        )
        .join('\n') +
      '\n\nPara cualquier miembro. Acepto `desayuno?`, `!desayuno` y `aluerzo?`.',
  }),
};

export function normalizeCommand(content: string): string {
  return content
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/^!/, '')
    .replace(/\?$/, '')
    .trim()
    .replace(/\s+/g, ' ');
}

const registry = new Map<string, Command>();
for (const command of [...commands, help]) {
  for (const alias of [command.name, ...command.aliases]) {
    const key = normalizeCommand(alias);
    if (registry.has(key)) throw new Error(`Alias duplicado: ${alias}`);
    registry.set(key, command);
  }
}

export function commandCatalog() {
  return [...commands, help].map(({ name, aliases, description, usage, category, access }) => ({
    name,
    aliases,
    description,
    usage: usage ?? name,
    category,
    access,
  }));
}

export function parseCommand(content: string): { command: Command; args: string } | undefined {
  const input = content.trim();
  const prefixed = input.startsWith('!');
  const body = prefixed ? input.slice(1) : input;
  const exact = registry.get(normalizeCommand(content));
  if (exact) return { command: exact, args: '' };
  const separator = body.search(/\s/);
  if (separator < 0) return undefined;
  const command = registry.get(normalizeCommand(body.slice(0, separator)));
  if (!command?.acceptsArgs) return undefined;
  return { command, args: body.slice(separator).trim() };
}

export function executeCommand(content: string, context: CommandContext): CommandReply | undefined {
  const parsed = parseCommand(content);
  return parsed?.command.execute(context, parsed.args);
}
