import { PermissionFlagsBits, escapeMarkdown } from 'discord.js';
import type { Message } from 'discord.js';
import type { GiftConfig } from '../config/gifts.js';
import type { GiftStore } from '../features/gifts/store.js';
import { GiftDemoSession } from '../preview/gifts.js';

export const isGiftTestCommand = (content: string): boolean => /^!cumple(?:\s|$)/i.test(content.trim());

export async function giftTestMessage(message: Message, test?: { config: GiftConfig; store: GiftStore }): Promise<void> {
  const reply = async (content: string) => { await message.reply({ content, allowedMentions: { parse: [], repliedUser: false } }); };
  if (!test) { await reply('El comando temporal de prueba está desactivado.'); return; }
  const { config, store } = test;
  if (message.guildId !== config.guildId || message.channelId !== config.channelId || !message.guild) {
    await reply('Usá !cumple en el canal de pruebas configurado.'); return;
  }
  const guild = await message.guild.fetch();
  await guild.roles.fetch();
  const channel = await guild.channels.fetch(message.channelId, { force: true });
  const member = await guild.members.fetch({ user: message.author.id, force: true });
  if (!channel || !('permissionsFor' in channel) || !channel.permissionsFor(member)?.has(PermissionFlagsBits.ManageChannels)) {
    await reply('Necesitás Administrador o Gestionar canales para probar cumpleaños.'); return;
  }
  const match = /^!cumple\s+(?:<@!?(\d+)>|(\d+))$/i.exec(message.content.trim());
  const id = match?.[1] ?? match?.[2];
  if (!id) { await reply('Usá !cumple @persona o !cumple ID. Es una simulación: no inicia un regalo real.'); return; }
  const birthdays = store.birthdays(config.guildId);
  if (!birthdays.some((b) => b.userId === id)) { await reply('Esa persona no tiene un cumpleaños importado.'); return; }
  if (store.category(config.guildId, id) === 'no-gift') { await reply('Esa persona pertenece a no-gift: Pepe ignora su cumpleaños y no inicia el flujo.'); return; }
  const target = await guild.members.fetch({ user: id, force: true });
  if (target.user.bot) { await reply('Elegí una persona, no un bot.'); return; }
  if ((target.id === guild.ownerId || target.permissions.has(PermissionFlagsBits.Administrator)) && !config.adminIds?.includes(id)) {
    await reply('Ese administrador debe estar en GIFTS_ADMIN_IDS para simular correctamente su flujo.'); return;
  }
  const demo = new GiftDemoSession(birthdays.map((b) => ({ ...b, username: b.userId })), config);
  try {
    const state = await demo.start(id);
    const lines = state.events.map((event) => {
      const prefix = event.kind === 'dm' ? `✉ DM simulado a <@${event.recipientId}>: ` : event.kind === 'channel' ? '🔒 Convocatoria simulada: ' : '';
      return prefix + escapeMarkdown(event.text.replaceAll('@', '＠').replaceAll('<', '‹').replaceAll('>', '›'));
    });
    // Keep a single bounded reply; never publish buttons, send DMs or change live permissions.
    const content = '🧪 **PRUEBA · sin cambios reales**\n' + lines.join('\n\n') + '\n\nRecorrido con checks y reincorporación: abrí el laboratorio web local.';
    await reply(content.slice(0, 1950));
  } finally { demo.close(); }
}
