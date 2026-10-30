import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { MessageReplyOptions } from 'discord.js';
import { executeCommand } from '../src/commands/registry.js';
import { handleMessage } from '../src/discord/messages.js';
import { GiftStore } from '../src/features/gifts/store.js';
import { GiftRosterStore, parseGiftRoster } from '../src/features/gifts/roster.js';
import { fixture } from './helpers.js';

function description(reply: MessageReplyOptions | undefined): string | undefined {
  const embed = reply?.embeds?.[0];
  return embed && ('toJSON' in embed ? embed.toJSON() : embed).description;
}

test('cumples lee SQLite por servidor, persiste tras reiniciar y ordena por mes, día y nombre', (t) => {
  const f = fixture(t);
  const birthdays = new GiftStore(f.db);
  birthdays.import('1', [
    { userId: '100000000000000001', name: 'Persona diciembre', dayMonth: '01/12' },
    { userId: '100000000000000002', name: 'Persona enero tarde', dayMonth: '31/01' },
    { userId: '100000000000000003', name: 'Persona enero', dayMonth: '01/01' },
    { userId: '100000000000000004', name: 'Zeta ficticia', dayMonth: '01/02' },
    { userId: '100000000000000005', name: 'Alfa ficticia', dayMonth: '01/02', category: 'no-gift' },
    { userId: '100000000000000006', name: 'Persona bisiesta', dayMonth: '29/02' },
  ]);
  birthdays.import('2', [{ userId: '100000000000000007', name: 'Otro servidor', dayMonth: '01/01' }]);
  f.db.close();
  const reopened = f.connect();
  const context = { levels: f.levels, birthdays: new GiftStore(reopened), guildId: '1', userId: '3', random: () => 0 };
  const reply = executeCommand('!cumples', context);
  assert.equal(reply?.card?.description, [
    'Persona enero — 01/01', 'Persona enero tarde — 31/01', 'Alfa ficticia — 01/02',
    'Zeta ficticia — 01/02', 'Persona bisiesta — 29/02', 'Persona diciembre — 01/12',
  ].join('\n'));
  assert.equal(executeCommand('!cumples', { ...context, guildId: '2' })?.card?.description, 'Otro servidor — 01/01');
  assert.match(executeCommand('!cumples', { ...context, guildId: '3' })?.content ?? '', /no hay cumpleaños/);
  assert.equal(reopened.prepare<[], { n: number }>('SELECT count(*) AS n FROM gift_cycles').get()?.n, 0);
});

test('cualquier miembro consulta cumples con features apagadas, sin contactos, menciones ni XP', async (t) => {
  const f = fixture(t);
  new GiftRosterStore(f.db).import('1', parseGiftRoster(
    'User Id,DS Name,Nombre,Apellido,Dia de cumpleañitos,Telefono,Direccion,Ciudad,Codigo Postal\n'
    + '100000000000000001,persona_ficticia,Persona,Ficticia,02/01,+0000001,Calle ficticia 1,Ciudad ficticia,0010\n',
  ));
  const sent: MessageReplyOptions[] = [];
  const services = { levels: f.levels, birthdays: new GiftStore(f.db), features: { social: false, meals: false, levels: false } };
  for (const content of ['!cumples', 'cumples', '!CUMPLES?']) {
    await handleMessage({ author: { id: '2', bot: false }, guildId: '1', webhookId: null, system: false,
      content, reply: async reply => { sent.push(reply); } }, services);
  }
  assert.equal(sent.length, 3);
  for (const reply of sent) {
    assert.equal(description(reply), 'Persona Ficticia — 02/01');
    assert.deepEqual(reply.allowedMentions, { parse: [], users: [], repliedUser: false });
    assert.doesNotMatch(JSON.stringify(reply), /0000001|Calle ficticia|Ciudad ficticia|0010|persona_ficticia/);
  }
  assert.equal(f.levels.profile('1', '2').xp, 0);
  await handleMessage({ author: { id: '2', bot: false }, guildId: null, webhookId: null, system: false,
    content: '!cumples', reply: async () => assert.fail('No devuelve el calendario por privado.') }, services);
});

test('calendario extenso: páginas respetan Discord y conservan todas las filas sin duplicados', (t) => {
  const f = fixture(t);
  const birthdays = new GiftStore(f.db);
  birthdays.import('1', Array.from({ length: 60 }, (_, i) => ({
    userId: String(100000000000000000n + BigInt(i)), name: `${'*'.repeat(95)}${String(i).padStart(3, '0')}`, dayMonth: '01/01',
  })));
  const context = { levels: f.levels, birthdays, guildId: '1', userId: '2', random: () => 0 };
  const descriptions: string[] = [];
  for (let i = 1; ; i++) {
    const reply = executeCommand(`!cumples ${i}`, context);
    if (!reply?.card) break;
    assert.ok(reply.card.description && reply.card.description.length <= 4096);
    descriptions.push(...reply.card.description.split('\n'));
  }
  assert.equal(descriptions.length, 60);
  assert.equal(new Set(descriptions).size, 60);
  for (const args of ['0', '-1', '2.5', 'NaN', 'Infinity', '9007199254740992', '1 2']) {
    assert.match(executeCommand(`!cumples ${args}`, context)?.content ?? '', /Usá/);
  }
  assert.match(executeCommand('!cumples 999', context)?.content ?? '', /Hay .* páginas/);
});

test('nombres con Markdown y menciones se muestran como texto, y el comando no suma XP', async (t) => {
  const f = fixture(t);
  const birthdays = new GiftStore(f.db);
  birthdays.import('1', [{ userId: '100000000000000001', name: '<@everyone> *Ficticio*', dayMonth: '01/01' }]);
  const replies: MessageReplyOptions[] = [];
  await handleMessage({ author: { id: '2', bot: false }, guildId: '1', webhookId: null, system: false,
    content: 'cumples', reply: async reply => { replies.push(reply); } }, { ...f, birthdays });
  assert.equal(description(replies[0]), '‹＠everyone› \\*Ficticio\\* — 01/01');
  assert.equal(f.levels.profile('1', '2').xp, 0);
});
