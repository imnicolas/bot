import {
  ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, DiscordAPIError,
  EmbedBuilder, PermissionFlagsBits, RESTJSONErrorCodes, escapeMarkdown,
} from 'discord.js';
import type { Client, TextChannel } from 'discord.js';
import type { GiftConfig } from '../config/gifts.js';
import type { GiftChannel } from '../features/gifts/service.js';
import type { AdminNotice, GiftCycle, ViewState } from '../features/gifts/store.js';
import { PrivateMessageRejected } from '../features/gifts/admin-notices.js';

const marker = (cycle: GiftCycle) => `Pepe · regalo ${cycle.id}`;
const privateMarker = (notice: AdminNotice) => `Pepe · aviso privado ${notice.id}`;

export class DiscordGiftChannel implements GiftChannel {
  constructor(private readonly client: Client, private readonly config: GiftConfig) {}

  async channel(): Promise<TextChannel> {
    const channel = await this.client.channels.fetch(this.config.channelId, { force: true });
    if (!channel || channel.type !== ChannelType.GuildText || channel.guildId !== this.config.guildId) {
      throw new Error('Regalos requiere un canal de texto del servidor configurado.');
    }
    return channel;
  }

  private async protectedChannels(): Promise<TextChannel[]> {
    const ids = [...new Set([this.config.channelId, ...(this.config.protectedChannelIds ?? [])])];
    return Promise.all(ids.map(async (id) => {
      const channel = await this.client.channels.fetch(id, { force: true });
      if (!channel || channel.type !== ChannelType.GuildText || channel.guildId !== this.config.guildId) {
        throw new Error("Los canales protegidos deben ser canales de texto del servidor configurado.");
      }
      return channel;
    }));
  }

  private async context(userId?: string) {
    const guild = await (await this.client.guilds.fetch(this.config.guildId)).fetch();
    await guild.roles.fetch();
    const me = await guild.members.fetchMe({ force: true });
    const role = guild.roles.cache.get(this.config.roleId);
    if (!role || role.id === guild.id || role.managed || !role.editable || !me.permissions.has(PermissionFlagsBits.ManageRoles)) {
      throw new Error("Pepe necesita Gestionar roles y un rol Cumpleañeri editable por debajo de su rol más alto.");
    }
    const member = userId ? await guild.members.fetch({ user: userId, force: true }) : undefined;
    return { guild, role, member };
  }

  async validate(operation: 'announce' | 'restore' = 'announce'): Promise<void> {
    const { guild } = await this.context();
    const me = await guild.members.fetchMe({ force: true });
    for (const channel of await this.protectedChannels()) {
      if (channel.permissionsFor(guild.roles.everyone).has(PermissionFlagsBits.ViewChannel)) {
        throw new Error("Todos los canales de regalos deben ser privados: @everyone no puede Ver canal.");
      }
      const required = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.ReadMessageHistory];
      if (operation === 'announce' && channel.id === this.config.channelId) {
        required.push(PermissionFlagsBits.SendMessages, PermissionFlagsBits.EmbedLinks, PermissionFlagsBits.MentionEveryone);
      }
      if (!channel.permissionsFor(me).has(required)) throw new Error("Revisá los permisos de Pepe para ver, leer y publicar con @here en los canales de regalos.");
    }
  }

  async inspect(userId: string) {
    const { guild, member } = await this.context(userId);
    if (!member) throw new Error("Miembro no encontrado.");
    const isAdmin = member.id === guild.ownerId || member.permissions.has(PermissionFlagsBits.Administrator);
    const channels = await this.protectedChannels();
    return { priorView: (member.roles.cache.has(this.config.roleId) ? 1 : 0) as ViewState,
      visible: channels.some((channel) => channel.permissionsFor(member).has(PermissionFlagsBits.ViewChannel)),
      isAdmin, canHide: !member.user.bot && !isAdmin };
  }

  async hide(userId: string): Promise<void> {
    const { guild, member } = await this.context(userId);
    if (!member || member.user.bot || member.id === guild.ownerId || member.permissions.has(PermissionFlagsBits.Administrator)) {
      throw new Error("Pepe no retira el rol a administradores, dueños o bots.");
    }
    if (member.roles.cache.has(this.config.roleId)) {
      await member.roles.remove(this.config.roleId, "Pepe: organización de regalo, 7 días antes");
    }
  }

  async isHidden(userId: string): Promise<boolean> {
    const state = await this.inspect(userId);
    return !state.isAdmin && !state.visible && state.priorView === 0;
  }

  async restore(userId: string, hadRole: ViewState): Promise<boolean> {
    try {
      const { member } = await this.context(userId);
      if (!member) return false;
      if (hadRole === 1 && !member.roles.cache.has(this.config.roleId)) {
        await member.roles.add(this.config.roleId, "Pepe: reincorporación manual al canal de regalos");
      }
      return (await this.inspect(userId)).visible;
    } catch (error) {
      if (error instanceof DiscordAPIError && error.code === RESTJSONErrorCodes.UnknownMember) return false;
      throw error;
    }
  }

  async publish(cycle: GiftCycle): Promise<string> {
    const channel = await this.channel();
    // User data must never be able to introduce additional @everyone/@here mentions.
    const name = escapeMarkdown(cycle.name.replaceAll('@', '＠').replaceAll('<', '‹').replaceAll('>', '›'));
    const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder().setCustomId(`gift:join:${cycle.id}`).setLabel('Participo').setEmoji('✅').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`gift:leave:${cycle.id}`).setLabel('Retirar participación').setStyle(ButtonStyle.Secondary),
    );
    const message = await channel.send({
      content: '@here 🎁 ¡Organizamos el regalo!',
      embeds: [new EmbedBuilder().setTitle(`Cumple de ${name}`).setDescription(
        `Cumple el ${cycle.birthday.slice(8)}/${cycle.birthday.slice(5, 7)}. El cumpleañero ya no tiene acceso a este canal.\n\nMarcá ✅ si vas a colaborar con el regalo. Podés retirar tu participación. El check no confirma una transferencia.\nLa coordinación y las transferencias las organizan ustedes.`,
      ).setFooter({ text: marker(cycle) })],
      components: [buttons], allowedMentions: { parse: ['everyone'], users: [], roles: [] },
      nonce: `gift-${cycle.id}`, enforceNonce: true,
    });
    return message.id;
  }

  async findAnnouncement(cycle: GiftCycle): Promise<string | undefined> {
    const channel = await this.channel();
    // Recovery is conservative: if absent in this bounded history, automatic retries stop.
    const messages = await channel.messages.fetch({ limit: 100 });
    return messages.find((m) => m.author.id === this.client.user?.id && m.embeds.some((e) => e.footer?.text === marker(cycle)))?.id;
  }

  async canParticipate(userId: string): Promise<boolean> {
    const channel = await this.channel();
    const member = await channel.guild.members.fetch({ user: userId, force: true });
    return !member.user.bot && channel.permissionsFor(member).has(PermissionFlagsBits.ViewChannel);
  }

  private async adminDM(notice: AdminNotice) {
    const admins = this.config.adminIds;
    if (notice.guildId !== this.config.guildId || !admins?.includes(notice.userId) ||
      !admins.includes(notice.recipientId) || notice.userId === notice.recipientId) {
      throw new PrivateMessageRejected('Destinatario privado inválido.');
    }
    const guild = await (await this.client.guilds.fetch(this.config.guildId)).fetch();
    await guild.roles.fetch();
    const birthdayMember = await guild.members.fetch({ user: notice.userId, force: true });
    // The configured birthday member may have been manually demoted to hide the gift channel.
    if (birthdayMember.user.bot) throw new PrivateMessageRejected('El cumpleañero configurado debe ser una persona.');
    const recipient = await guild.members.fetch({ user: notice.recipientId, force: true });
    if (recipient.user.bot || (recipient.id !== guild.ownerId && !recipient.permissions.has(PermissionFlagsBits.Administrator))) {
      throw new PrivateMessageRejected('El destinatario ya no es un administrador humano del servidor.');
    }
    return recipient.createDM();
  }

  async sendAdminNotice(notice: AdminNotice): Promise<string> {
    try {
      const dm = await this.adminDM(notice);
      const name = escapeMarkdown(notice.name.replaceAll('@', '＠'));
      const instructions = notice.userId === this.config.dmOnlyAdminId
        ? 'Organicen su regalo por WhatsApp. Para este cumpleaños sólo envío este recordatorio privado; no habrá convocatoria ni cambios de acceso en Discord.'
        : 'Yo no cambio los roles ni los permisos de esta cuenta. '
          + 'Retiren manualmente su acceso al canal de regalos: mientras conserve Administrador o sea dueño, puede seguir viéndolo. '
          + 'Cuando compruebe que ya no tiene acceso, publicaré la convocatoria en el canal configurado (si todavía está dentro de la ventana del cumpleaños).';
      const message = await dm.send({
        content: `🎁 Recordatorio privado: el ${notice.birthday.slice(8)}/${notice.birthday.slice(5, 7)} cumple ${name} (<@${notice.userId}>).\n\n`
          + 'Es el momento de organizar su regalo (7 días antes; si estuve apagado, puede llegar más tarde). '
          + instructions + '\n\n'
          + privateMarker(notice),
        allowedMentions: { parse: [], users: [], roles: [] },
        nonce: `gift-admin-${notice.id}`, enforceNonce: true,
      });
      return message.id;
    } catch (error) {
      if (error instanceof DiscordAPIError && error.status >= 400 && error.status < 500 && error.status !== 429) {
        throw new PrivateMessageRejected('Discord rechazó el mensaje privado.');
      }
      throw error;
    }
  }

  async findAdminNotice(notice: AdminNotice): Promise<string | undefined> {
    const dm = await this.adminDM(notice);
    const messages = await dm.messages.fetch({ limit: 100 });
    return messages.find((m) => m.author.id === this.client.user?.id && m.content.endsWith(privateMarker(notice)))?.id;
  }
}
