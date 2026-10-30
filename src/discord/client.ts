import { Client, Events, GatewayIntentBits, PermissionFlagsBits } from 'discord.js';
import { handleMessage } from './messages.js';
import type { MessageServices } from './messages.js';
import { fromDiscordMessage } from './profiles.js';
import type { BirthdayConfig } from '../config/birthdays.js';
import { localDateString } from '../features/birthdays/calendar.js';
import type { BirthdayRecord } from '../features/birthdays/workbook.js';
import { reconcileBirthdayRoles } from '../features/birthdays/roles.js';
import type { BirthdayRoleStateStore, BirthdaySyncResult } from '../features/birthdays/roles.js';

export interface BirthdayAutomation {
  readonly config: BirthdayConfig;
  readonly records: readonly BirthdayRecord[];
  readonly store: BirthdayRoleStateStore;
}

export function createBot(services: MessageServices, birthdays?: BirthdayAutomation) {
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      ...(birthdays ? [GatewayIntentBits.GuildMembers] : []),
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
    allowedMentions: { parse: [], repliedUser: false },
  });
  client.once(Events.ClientReady, (ready) => console.log(`Bot conectado como: ${ready.user.tag}`));
  const pending = new Set<Promise<unknown>>();
  let stopping = false;
  let shutdown: Promise<void> | undefined;
  let birthdayTimer: NodeJS.Timeout | undefined;
  let birthdaySyncTask: Promise<BirthdaySyncResult> | undefined;
  const syncBirthdays = (): Promise<BirthdaySyncResult> => {
    if (!birthdays) return Promise.reject(new Error('La función de cumpleaños no está configurada.'));
    if (stopping) return Promise.reject(new Error('El bot se está cerrando.'));
    if (birthdaySyncTask) return birthdaySyncTask;
    const task = (async () => {
      const guild = await client.guilds.fetch(birthdays.config.guildId);
      const roles = await guild.roles.fetch();
      const matches = roles.filter((role) => role.name === birthdays.config.roleName);
      if (matches.size !== 1) {
        throw new Error(
          `Debe existir exactamente un rol llamado "${birthdays.config.roleName}" en el servidor.`,
        );
      }
      const role = matches.first();
      if (!role) throw new Error('No se pudo resolver el rol de cumpleaños.');
      return reconcileBirthdayRoles({
        guild,
        store: birthdays.store,
        records: birthdays.records,
        roleId: role.id,
        today: localDateString(new Date(), birthdays.config.timezone),
      });
    })();
    birthdaySyncTask = task;
    pending.add(task);
    void task
      .catch((error: unknown) => console.error('Error sincronizando roles de cumpleaños:', error))
      .finally(() => {
        pending.delete(task);
        birthdaySyncTask = undefined;
      });
    return task;
  };
  client.once(Events.ClientReady, () => {
    if (!birthdays) return;
    void syncBirthdays().catch(() => undefined);
    birthdayTimer = setInterval(() => void syncBirthdays().catch(() => undefined), 6 * 60 * 60 * 1000);
    birthdayTimer.unref();
  });
  client.on(Events.MessageCreate, (message) => {
    if (stopping) return;
    if (message.author.bot || message.webhookId || !message.guildId || message.system) return;
    if (/^!?cumple$/i.test(message.content.trim())) {
      const task = (async () => {
        if (!birthdays) {
          await message.reply('La función de cumpleaños no está configurada.');
          return;
        }
        if (message.guildId !== birthdays.config.guildId) {
          await message.reply('Este comando solo está habilitado en el servidor configurado.');
          return;
        }
        if (!message.member?.permissions.has(PermissionFlagsBits.ManageRoles)) {
          await message.reply('Necesitás el permiso Manage Roles para ejecutar esta sincronización.');
          return;
        }
        try {
          const result = await syncBirthdays();
          await message.reply(
            `Sincronización de cumpleaños finalizada: ${result.assigned} roles asignados, ` +
            `${result.removed} retirados, ${result.unchanged} sin cambios y ${result.failed} errores.`,
          );
        } catch (error) {
          console.error('Falló la sincronización manual de cumpleaños:', error);
          const detail = error instanceof Error ? ` ${error.message}` : '';
          await message.reply(`No pude sincronizar los roles de cumpleaños.${detail}`);
        }
      })();
      pending.add(task);
      void task
        .finally(() => pending.delete(task))
        .catch((error: unknown) => console.error('Error respondiendo al comando cumple:', error));
      return;
    }
    const task = handleMessage(fromDiscordMessage(message), services);
    pending.add(task);
    void task
      .finally(() => pending.delete(task))
      .catch((error: unknown) => console.error('Error procesando mensaje:', error));
  });
  client.on(Events.Error, (error) => console.error('Error de Discord:', error));
  return {
    client,
    stop(): Promise<void> {
      stopping = true;
      if (birthdayTimer) clearInterval(birthdayTimer);
      shutdown ??= (async () => {
        try {
          // Las respuestas pendientes, incluido su aviso de error, todavía usan REST.
          await Promise.allSettled(pending);
        } finally {
          await client.destroy();
        }
      })();
      return shutdown;
    },
  };
}
