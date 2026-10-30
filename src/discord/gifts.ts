import { MessageFlags, PermissionFlagsBits } from 'discord.js';
import type { ButtonInteraction, Client, Message } from 'discord.js';
import type { GiftConfig } from '../config/gifts.js';
import { isSnowflake } from '../config/gifts.js';
import { GiftService } from '../features/gifts/service.js';
import type { GiftStore } from '../features/gifts/store.js';
import { DiscordGiftChannel } from './gift-channel.js';

export const isGiftCommand = (content: string): boolean => /^!regalo(?:\s|$)/i.test(content.trim());

export class GiftRuntime {
  private readonly channel: DiscordGiftChannel;
  private readonly service: GiftService;
  private tail: Promise<void> = Promise.resolve();
  private timer: ReturnType<typeof setInterval> | undefined;
  private paused = false;
  private ticking = false;

  constructor(client: Client, config: GiftConfig, store: GiftStore) {
    this.channel = new DiscordGiftChannel(client, config);
    this.service = new GiftService(config, store, this.channel);
  }

  // Scheduler, manual restorations and button writes cannot race in this single bot instance.
  private enqueue<T>(work: () => Promise<T>): Promise<T> {
    const result = this.tail.then(work);
    this.tail = result.then(() => undefined, () => undefined);
    return result;
  }

  start(): void {
    if (this.paused || this.timer) return;
    const tick = () => {
      if (this.paused || this.ticking) return;
      this.ticking = true;
      void this.enqueue(() => this.service.tick(new Date()))
        .catch((error: unknown) => console.error('Regalos requiere atención:', error))
        .finally(() => { this.ticking = false; });
    };
    this.timer = setInterval(tick, 60_000);
    this.timer.unref();
    tick();
  }

  pause(): void { this.paused = true; clearInterval(this.timer); }
  async drain(): Promise<void> { await this.tail; }

  async message(message: Message): Promise<void> {
    const reply = async (content: string) => { await message.reply({ content, allowedMentions: { parse: [], repliedUser: false } }); };
    if (message.guildId !== this.service.config.guildId || message.channelId !== this.service.config.channelId) {
      await reply('Regalos no está habilitado en este canal.');
      return;
    }
    try {
      await this.enqueue(async () => {
        const channel = await this.channel.channel();
        await channel.guild.roles.fetch();
        const member = await channel.guild.members.fetch({ user: message.author.id, force: true });
        if (!channel.permissionsFor(member).has(PermissionFlagsBits.ManageChannels)) {
          await reply('Necesitás Administrador o Gestionar canales para usar este comando.');
          return;
        }
        const [, action, target, ...extra] = message.content.trim().split(/\s+/);
        if (action?.toLowerCase() === 'estado' && !target) {
          const cycles = this.service.store.cycles(this.service.config).filter((c) => c.state !== 'restored');
          await reply(cycles.length ? cycles.slice(0, 20).map((c) => `Regalo ${c.id}: <@${c.userId}> · ${c.birthday} · ${c.state} · ${this.service.store.participants(c.id).length} participantes`).join('\n') : 'No hay regalos pendientes.');
          return;
        }
        const userId = /^<@!?(\d+)>$/.exec(target ?? '')?.[1] ?? target ?? '';
        if (extra.length || !isSnowflake(userId)) {
          await reply('Usá !regalo estado, !regalo reincorporar @usuario, !regalo participantes @usuario o !regalo anunciar @usuario.');
          return;
        }
        switch (action?.toLowerCase()) {
          case 'reincorporar': {
            const manual = this.service.active(userId)?.exclusionMode === 'manual';
            const visible = await this.service.restore(userId);
            if (manual) {
              await reply(visible ? 'Reincorporación manual confirmada y organización cerrada. Pepe no modificó roles ni permisos.'
                : 'Este miembro fue excluido manualmente. Devuélvanle el acceso y los roles manualmente y repetí el comando para cerrar la organización.');
              break;
            }
            await reply(visible ? 'Rol Cumpleañeri restaurado. El miembro vuelve a tener acceso al canal y a su historial.'
              : 'Rol original restaurado, pero todavía no tiene acceso. Revisá los permisos de los canales.');
            break;
          }
          case 'anunciar':
            await this.service.retryAnnouncement(userId);
            await reply('Convocatoria registrada.');
            break;
          case 'participantes': {
            const cycle = this.service.active(userId);
            if (!cycle) { await reply('No hay un regalo activo para ese miembro.'); break; }
            const ids = this.service.store.participants(cycle.id);
            const lines = ids.map((id) => `<@${id}>`);
            // Discord content limit, with no extra pings. Retain a complete list across chunks.
            await reply(`Regalo ${cycle.id}: ${ids.length} participantes. El check expresa intención de colaborar; no confirma pago.`);
            for (let i = 0; i < lines.length; i += 50) await reply(lines.slice(i, i + 50).join('\n'));
            break;
          }
          default:
            await reply('Acción desconocida. Usá !regalo estado, reincorporar, participantes o anunciar.');
        }
      });
    } catch (error) {
      console.error('Error de comando de regalos:', error);
      await reply('No pude completar la operación. Revisá !regalo estado y los logs de Pepe antes de reintentar.');
    }
  }

  async button(interaction: ButtonInteraction): Promise<void> {
    await interaction.deferReply({ flags: MessageFlags.Ephemeral });
    try {
      if (interaction.guildId !== this.service.config.guildId || interaction.channelId !== this.service.config.channelId) throw new Error('Canal incorrecto.');
      const match = /^gift:(join|leave):([1-9]\d*)$/.exec(interaction.customId);
      const id = Number(match?.[2]);
      if (!match || !Number.isSafeInteger(id)) throw new Error('Botón inválido.');
      const joined = match[1] === 'join';
      const count = await this.enqueue(() => this.service.participate(id, interaction.user.id, interaction.message.id, joined));
      await interaction.editReply({ content: `${joined ? '✅ Contamos con vos' : 'Retiraste tu participación'}. Participantes: ${count}. El check no confirma una transferencia.`, allowedMentions: { parse: [] } });
    } catch {
      await interaction.editReply('No pude registrar tu respuesta. La convocatoria puede estar cerrada o no tenés acceso. Volvé a intentar si sigue activa.');
    }
  }
}
