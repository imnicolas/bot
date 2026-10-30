import { escapeMarkdown } from 'discord.js';
import type { Birthday } from '../features/gifts/birthdays.js';
import type { Command } from './types.js';

// The calendar needs no contacts, permission edits or gift scheduler.
export interface BirthdayReader {
  birthdays(guildId: string): readonly Pick<Birthday, 'name' | 'dayMonth'>[];
}

const calendarOrder = (date: string): number => Number(date.slice(3)) * 100 + Number(date.slice(0, 2));

export const birthdayCommand: Command = {
  access: 'public', category: 'info', name: 'cumples', aliases: [],
  acceptsArgs: true, usage: '!cumples [página]',
  description: 'Persona y cumpleaños, ordenados por mes y día.',
  execute({ guildId, birthdays }, args) {
    const pageNumber = args ? Number(args) : 1;
    if ((args && !/^[1-9]\d*$/.test(args)) || !Number.isSafeInteger(pageNumber)) {
      return { content: 'Usá `!cumples` o `!cumples 2` para elegir una página.' };
    }
    const entries = [...(birthdays?.birthdays(guildId) ?? [])].sort((a, b) =>
      calendarOrder(a.dayMonth) - calendarOrder(b.dayMonth) || a.name.localeCompare(b.name, 'es'));
    if (!entries.length) return { content: 'Todavía no hay cumpleaños cargados en este servidor.' };
    const pages: string[][] = [];
    let page: string[] = [];
    for (const entry of entries) {
      const name = escapeMarkdown(entry.name.replaceAll('@', '＠').replaceAll('<', '‹').replaceAll('>', '›'));
      const line = `${name} — ${entry.dayMonth}`;
      if (page.length >= 25 || [...page, line].join('\n').length > 3500) {
        pages.push(page);
        page = [];
      }
      page.push(line);
    }
    pages.push(page);
    const selected = pages[pageNumber - 1];
    if (!selected) return { content: `Hay ${pages.length} páginas. Usá \`!cumples\` o \`!cumples N\`.` };
    return {
      content: '',
      card: {
        title: '🎂 Cumpleaños del servidor', description: selected.join('\n'),
        footer: `${entries.length} personas · Página ${pageNumber}/${pages.length}${pages.length > 1 ? ' · !cumples N para cambiar de página' : ''}`,
      },
    };
  },
};
