import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DemoSession } from '../src/preview/session.js';

test('demo usa el handler real: cambio de usuario, aviso de nivel, cooldown y ranking de XP', async (t) => {
  const demo = new DemoSession(() => 0);
  t.after(() => demo.close());
  const chat = await demo.send('101', 'Hola, grupo, cómo andan?');
  assert.match(String(chat.replies[0]?.content ?? ''), /Treeemendoo.*nivel 1/);
  const xp = chat.state.members.find((member) => member.id === '101')?.xp;
  const repeated = await demo.send('101', 'Este mensaje todavía tiene cooldown');
  assert.equal(repeated.replies.length, 0);
  assert.equal(repeated.state.members.find((member) => member.id === '101')?.xp, xp);
  demo.advance(1);
  const later = await demo.send('101', 'Pasó un minuto y sigo conversando');
  assert.equal(later.state.members.find((member) => member.id === '101')?.xp, (xp ?? 0) + 15);
  const ranking = await demo.send('102', 'ranking');
  assert.match(String(ranking.replies[0]?.content), /Ranking de participación/);
  assert.match(String(ranking.replies[0]?.content), /1\. <@102>/);
  const level = await demo.send('102', 'nivel <@101>');
  assert.equal(level.replies[0]?.embeds?.length, 1);
  assert.equal(level.state.commands.length, 7);
});
