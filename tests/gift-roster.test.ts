import assert from 'node:assert/strict';
import { test } from 'node:test';
import { GiftRosterStore, parseGiftRoster } from '../src/features/gifts/roster.js';
import { GiftStore } from '../src/features/gifts/store.js';
import { fixture } from './helpers.js';

const guild = '100000000000000010';
const user = '100000000000000001';
const header = 'User Id,DS Name,Nombre,Apellido,Dia de cumpleañitos,Telefono,Direccion,Ciudad,Codigo Postal';
const row = `${user},persona_ficticia,Persona,Ficticia,02/01,+0000001,"Calle ficticia 1, piso 2","Ciudad ficticia, Provincia",0010`;

test('categoría opcional: no-gift persiste por servidor y no se borra al importar un CSV antiguo', (t) => {
  const f = fixture(t);
  const roster = new GiftRosterStore(f.db);
  const gifts = new GiftStore(f.db);
  roster.import(guild, parseGiftRoster(`${header},Categoría\n${row},no-gift`));
  assert.equal(gifts.category(guild, user), 'no-gift');
  assert.equal(gifts.birthdays(guild)[0]?.category, 'no-gift');
  roster.import(guild, parseGiftRoster(`${header}\n${row}`));
  gifts.import(guild, [{ userId: user, name: 'Persona Ficticia', dayMonth: '02/01' }]);
  assert.equal(gifts.category(guild, user), 'no-gift');
  assert.equal(gifts.category('otro servidor', user), undefined);
  assert.equal(new GiftStore(f.connect()).category(guild, user), 'no-gift');
  roster.import(guild, parseGiftRoster(`${header},categoria\n${row},gift`));
  assert.equal(gifts.category(guild, user), 'gift');
  for (const category of ['', 'none', 'NO-GIFT']) assert.throws(() => parseGiftRoster(`${header},categoria\n${row},${category}`), /categoría inválida/);
});

test('importa las nueve columnas; conserva teléfonos/códigos postales como texto y separa datos del calendario', (t) => {
  const f = fixture(t);
  const entries = parseGiftRoster(`${header}\n${row}`);
  const roster = new GiftRosterStore(f.db);
  roster.import(guild, entries);
  assert.deepEqual(roster.members(guild), [{ userId: user, username: 'persona_ficticia', firstName: 'Persona', lastName: 'Ficticia',
    phone: '+0000001', address: 'Calle ficticia 1, piso 2', city: 'Ciudad ficticia, Provincia', postalCode: '0010' }]);
  assert.deepEqual(new GiftStore(f.db).birthdays(guild), [{ userId: user, name: 'Persona Ficticia', dayMonth: '02/01' }]);
  assert.deepEqual(roster.members('100000000000000011'), []);
  f.db.close();
  assert.equal(new GiftRosterStore(f.connect()).members(guild)[0]?.postalCode, '0010');
});

test('actualiza contactos por ID sin duplicar y una importación sólo de cumpleaños conserva los contactos', (t) => {
  const f = fixture(t);
  const roster = new GiftRosterStore(f.db);
  roster.import(guild, parseGiftRoster(`${header}\n${row}`));
  roster.import(guild, parseGiftRoster(`${header}\n${row.replace('Calle ficticia 1', 'Calle ficticia 2')}`));
  new GiftStore(f.db).import(guild, [{ userId: user, name: 'Persona Ficticia', dayMonth: '03/01' }]);
  assert.equal(roster.members(guild).length, 1);
  assert.equal(roster.members(guild)[0]?.address, 'Calle ficticia 2, piso 2');
});

test('CSV inválido, IDs repetidos y campos faltantes fallan sin incluir datos privados en errores', () => {
  for (const csv of [`${header}\n${row}\n${row}`, `${header}\n${row.replace('+0000001', '')}`,
    `${header}\n${row.replace('persona_ficticia', '')}`, `${header}\n${row.replace('02/01', '31/02')}`]) assert.throws(() => parseGiftRoster(csv));
  assert.throws(() => parseGiftRoster(`${header}\n"secret contact without closing quote`), (error: unknown) =>
    error instanceof Error && !error.message.includes('secret contact'));
});

test('un fallo SQL revierte cumpleaños y contactos de todo el lote', (t) => {
  const f = fixture(t);
  const second = '100000000000000002';
  const entries = parseGiftRoster(`${header}\n${row}\n${row.replace(user, second).replace('persona_ficticia', 'persona_ficticia_b')}`);
  f.db.exec(`CREATE TRIGGER reject_second BEFORE INSERT ON gift_member_details WHEN NEW.user_id='${second}' BEGIN SELECT RAISE(ABORT, 'rejected'); END`);
  const roster = new GiftRosterStore(f.db);
  assert.throws(() => roster.import(guild, entries));
  assert.equal(roster.members(guild).length, 0);
  assert.equal(new GiftStore(f.db).birthdays(guild).length, 0);
});
