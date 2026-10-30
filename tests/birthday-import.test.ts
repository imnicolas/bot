import assert from 'node:assert/strict';
import { test } from 'node:test';
import { REST, Routes } from 'discord.js';
import { birthdaysCSV, parseBirthdays, parseBirthdayInput } from '../src/features/gifts/birthdays.js';
import { resolveBirthdayMembers } from '../src/features/gifts/resolve-members.js';
import type { BirthdayDirectory, BirthdayMember } from '../src/features/gifts/resolve-members.js';
import { DiscordBirthdayDirectory } from '../src/discord/birthday-directory.js';

const userId = '100000000000000001';
const otherId = '100000000000000002';
const member: BirthdayMember = { userId, username: 'persona_ficticia', discriminator: '0', bot: false };
const row = { username: member.username, name: 'Persona Ficticia', dayMonth: '02/01' };
const directory: BirthdayDirectory = {
  async member(id) { if (id !== userId) throw new Error('Miembro ausente'); return member; },
  async search() { return [member]; },
};

test('acepta la tabla con User Id, Nombre, Apellido y Día de cumpleañitos conservando compatibilidad', () => {
  assert.deepEqual(parseBirthdays(`User Id,Nombre,Apellido,Día de cumpleañitos\n${userId},Persona,Ficticia,02/01`), [
    { userId, name: 'Persona Ficticia', dayMonth: '02/01' },
  ]);
  assert.deepEqual(parseBirthdays(`user_id,nombre,fecha cumple\n${userId},Persona Ficticia,02/01`), [
    { userId, name: 'Persona Ficticia', dayMonth: '02/01' },
  ]);
  assert.throws(() => parseBirthdayInput('User Id,Nombre,Apellido,fecha cumple,Dia de cumpleañitos\n1,A,B,02/01,02/01'), /Cabecera/);
  assert.throws(() => parseBirthdayInput('Usuario Discord,Nombre,Fecha inventada\na,b,02/01'), /Cabecera/);
});

test('permite ID faltante y usernames normalizados; nombres visibles no son identificadores', () => {
  assert.deepEqual(parseBirthdayInput('Usuario Discord,Nombre,Apellido,Dia de cumpleañitos\n@Persona_Ficticia,Persona,Ficticia,02/01'), [row]);
  assert.deepEqual(parseBirthdayInput('User Id,DS Name,Nombre,Apellido,Dia de cumpleañitos\n,persona_ficticia,Persona,Ficticia,02/01'), [row]);
  for (const username of ['Nombre Con Estrellas ⭐', 'persona#1234', 'persona..ficticia', '@@persona']) {
    assert.throws(() => parseBirthdayInput(`Usuario Discord,Nombre,fecha cumple\n${username},Persona,02/01`), /inválido/);
  }
  assert.throws(() => parseBirthdays('Usuario Discord,Nombre,fecha cumple\npersona,Persona,02/01'), /gifts:resolve/);
  assert.throws(() => parseBirthdayInput('User Id,Usuario Discord,Nombre,fecha cumple\n,,Persona,02/01'), /inválido/);
});

test('resuelve exactamente dentro del servidor e ignora nombres similares o apodos', async () => {
  const resolved = await resolveBirthdayMembers([row], {
    ...directory,
    async search() { return [{ ...member, userId: otherId, username: 'persona_ficticia_extra' }, member]; },
  });
  assert.deepEqual(resolved, [{ userId, name: row.name, dayMonth: row.dayMonth }]);
  for (const matches of [[], [{ ...member, username: 'otro_nombre' }], [{ ...member, discriminator: '1234' }], [member, { ...member, userId: otherId }]]) {
    await assert.rejects(resolveBirthdayMembers([row], { ...directory, async search() { return matches; } }), /coincidencia única y exacta/);
  }
});

test('si hay ID y username deben coincidir; rechaza bots y duplicados después de resolver', async () => {
  assert.equal((await resolveBirthdayMembers([{ ...row, userId }], directory))[0]?.userId, userId);
  await assert.rejects(resolveBirthdayMembers([{ ...row, username: 'otro', userId }], directory), /misma cuenta/);
  await assert.rejects(resolveBirthdayMembers([row], { ...directory, async search() { return [{ ...member, bot: true }]; } }), /bot/);
  await assert.rejects(resolveBirthdayMembers([row, { userId, name: 'Otro nombre', dayMonth: '03/01' }], directory), /repetido/);
  await assert.rejects(resolveBirthdayMembers([{ ...row, userId: otherId }], directory), /ausente/);
  await assert.rejects(resolveBirthdayMembers([{ userId: otherId, name: row.name, dayMonth: row.dayMonth }], { ...directory, async member() { return member; } }), /ID devuelto/);
});

test('exportación con comillas y comas vuelve a importar exactamente con IDs estables', () => {
  const birthdays = [{ userId, name: 'Persona, "Ficticia"', dayMonth: '02/01' }];
  assert.deepEqual(parseBirthdays(birthdaysCSV(birthdays)), birthdays);
});

test('directorio Discord utiliza sólo GET al servidor indicado y conserva coincidencia exacta', async (t) => {
  const rest = new REST({ version: '10' }).setToken('offline-resolution-test');
  const guild = '100000000000000010';
  const requests: string[] = [];
  const raw = { user: { id: userId, username: member.username, discriminator: '0' }, nick: 'Apodo diferente' };
  t.mock.method(rest, 'get', async (...args: Parameters<REST['get']>) => {
    const [route, options] = args;
    requests.push(route);
    if (route === Routes.guildMember(guild, userId)) return raw;
    assert.equal(route, Routes.guildMembersSearch(guild));
    const query = options?.query;
    assert.ok(query instanceof URLSearchParams);
    assert.equal(query.get('query'), member.username);
    assert.equal(query.get('limit'), '1000');
    return [raw, { ...raw, user: { ...raw.user, id: otherId, username: 'parecido' }, nick: member.username }];
  });
  const adapter = new DiscordBirthdayDirectory(rest, guild);
  assert.deepEqual(await resolveBirthdayMembers([row], adapter), [{ userId, name: row.name, dayMonth: row.dayMonth }]);
  assert.equal((await adapter.member(userId)).userId, userId);
  assert.deepEqual(requests, [Routes.guildMembersSearch(guild), Routes.guildMember(guild, userId)]);
});
