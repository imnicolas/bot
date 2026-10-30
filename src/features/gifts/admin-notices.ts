import type { Birthday } from './birthdays.js';
import type { GiftConfig } from '../../config/gifts.js';
import type { AdminNotice, GiftStore } from './store.js';

export interface AdminMessenger {
  sendAdminNotice(notice: AdminNotice): Promise<string>;
  findAdminNotice(notice: AdminNotice): Promise<string | undefined>;
}

// A definitive rejection (e.g. closed DMs) is safe to retry; a timeout is ambiguous.
export class PrivateMessageRejected extends Error {}
const RETRY_MS = 6 * 60 * 60 * 1000;

export async function notifyOtherAdmin(
  config: GiftConfig, store: GiftStore, messenger: AdminMessenger,
  birthday: Birthday, date: string, now: Date,
): Promise<void> {
  const admins = config.adminIds;
  if (!admins || !admins.includes(birthday.userId)) {
    throw new Error('Cumpleaños administrativo: configurá los dos IDs en GIFTS_ADMIN_IDS. Sin convocatoria en el canal.');
  }
  const recipient = admins[0] === birthday.userId ? admins[1] : admins[0];
  const notice = store.prepareAdminNotice(config.guildId, birthday, date, recipient);
  if (notice.state === 'sent' || notice.retryAt > now.getTime()) return;
  if (notice.state === 'sending' || notice.state === 'uncertain') {
    try {
      const existing = await messenger.findAdminNotice(notice);
      if (existing) { store.adminNoticeState(notice.id, 'sent', 0, existing); return; }
    } catch { /* Keep private delivery uncertain; never fall back to the shared channel. */ }
    store.adminNoticeState(notice.id, 'uncertain', now.getTime() + RETRY_MS);
    console.error(`Aviso privado ${notice.id}: envío incierto. Revisar el DM antes de reintentar; no se publica en el canal.`);
    return;
  }
  store.adminNoticeState(notice.id, 'sending');
  try {
    const messageId = await messenger.sendAdminNotice(notice);
    store.adminNoticeState(notice.id, 'sent', 0, messageId);
  } catch (error) {
    const rejected = error instanceof PrivateMessageRejected;
    store.adminNoticeState(notice.id, rejected ? 'pending' : 'uncertain', rejected ? now.getTime() + RETRY_MS : 0);
    console.error(`Aviso privado ${notice.id}: ${rejected ? 'DM rechazado; reintento en 6 horas' : 'envío incierto; se intentará recuperar sin reenviar'}. Sin aviso en el canal.`);
  }
}
