import assert from 'node:assert/strict';
import { test } from 'node:test';
import { executeCommand } from '../src/commands/registry.js';
import { LevelStore, levelProgress } from '../src/features/levels/store.js';
import { fixture } from './helpers.js';

test('cooldown de XP persiste al reiniciar y se cumple también entre conexiones', (t) => {
  const f = fixture(t);
  assert.equal(f.levels.award('1', '2', 1000, 20), true);
  f.db.close();
  const restarted = new LevelStore(f.connect());
  const other = new LevelStore(f.connect());
  assert.equal(restarted.award('1', '2', 60_999, 25), false);
  assert.equal(other.award('1', '2', 61_000, 25), true);
  assert.equal(restarted.award('1', '2', 61_000, 25), false);
  assert.equal(restarted.award('1', '2', 1000, 25), false);
  assert.equal(restarted.profile('1', '2').xp, 45);
});

test('el XP se mantiene separado por servidor', (t) => {
  const { levels } = fixture(t);
  levels.award('1', '2', 1000, 15);
  levels.award('3', '2', 1000, 25);
  assert.equal(levels.profile('1', '2').xp, 15);
  assert.equal(levels.profile('3', '2').xp, 25);
  assert.equal(levels.profile('4', '2').xp, 0);
});

test('curva de niveles y progreso en los límites', () => {
  assert.deepEqual(levelProgress(0), { level: 0, current: 0, needed: 100 });
  assert.equal(levelProgress(99).level, 0);
  assert.deepEqual(levelProgress(100), { level: 1, current: 0, needed: 300 });
  assert.equal(levelProgress(399).level, 1);
  assert.deepEqual(levelProgress(400), { level: 2, current: 0, needed: 500 });
});

test('ranking de XP ordena, limita y resuelve empates por ID', (t) => {
  const { levels } = fixture(t);
  for (let user = 1; user <= 12; user++) {
    levels.award('1', String(user), 1000, 20);
    if (user === 12) levels.award('1', String(user), 61_000, 20);
  }
  assert.equal(levels.ranking('1').length, 10);
  assert.deepEqual(
    levels
      .ranking('1')
      .slice(0, 3)
      .map((p) => p.userId),
    ['12', '1', '10'],
  );
  assert.deepEqual(levels.ranking('2'), []);
});

test('ranking y sus alias consultan sólo XP, conservando datos de lotería anteriores', (t) => {
  const services = fixture(t);
  const context = { ...services, userId: '2', guildId: '1', random: () => 0 };
  for (const command of ['nivel', 'rank']) {
    const reply = executeCommand(command, context);
    assert.equal(reply?.card?.fields?.find((field) => field.name === 'Nivel')?.value, '0');
    assert.equal(reply?.card?.fields?.find((field) => field.name === 'Experiencia')?.value, '0 XP');
  }
  assert.match(executeCommand('top', context)?.content ?? '', /Todavía no hay XP/);
  services.levels.award('1', '2', 1000, 25);
  assert.match(executeCommand('!top', context)?.content ?? '', /25 XP/);
  services.db
    .prepare('INSERT INTO lottery_players VALUES (?, ?, ?, ?)')
    .run('1', '999', 10000, '2026-10-20');
  for (const alias of ['ranking', '!top', 'niveles', 'ranking text']) {
    const reply = executeCommand(alias, context);
    assert.ok(reply);
    assert.match(reply.content, /Ranking de participación[\s\S]*25 XP/);
    assert.doesNotMatch(reply.content, /999|10000|lotería/);
  }
  assert.equal(services.db.prepare('SELECT points FROM lottery_players').pluck().get(), 10000);
});
