import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { setTimeout } from 'node:timers/promises';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { get } from 'node:http';

// Check the real HTTP boundary with fictional private contacts; never use a Discord token.
const directory = await mkdtemp(join(tmpdir(), 'pepe-gift-preview-'));
const source = join(directory, 'roster.csv');
const reserve = createServer();
reserve.listen(0, '127.0.0.1'); await once(reserve, 'listening');
const port = reserve.address().port;
await new Promise((resolve) => reserve.close(resolve));
const origin = `http://127.0.0.1:${port}`;
const user = '100000000000000001';
const admin = '100000000000000002';
const owner = '100000000000000003';
const excluded = '100000000000000004';
const privateAddress = 'CONTACTO_PRIVADO_NO_HTTP';
await writeFile(source, 'User Id,DS Name,Nombre,Apellido,Dia de cumpleañitos,Telefono,Direccion,Ciudad,Codigo Postal,categoria\n'
  + `${user},lucia,Lucia,Prueba,12/11,0012345678,${privateAddress},Ciudad privada,0001,gift\n`
  + `${admin},admin_a,Admin,Prueba,07/06,0012345678,${privateAddress},Ciudad privada,0001,gift\n`
  + `${owner},admin_b,Owner,Prueba,24/09,0012345678,${privateAddress},Ciudad privada,0001,gift\n`
  + `${excluded},mara,Mara,Prueba,03/01,0012345678,${privateAddress},Ciudad privada,0001,no-gift\n`, { mode: 0o600 });
const child = spawn(process.execPath, ['dist/preview/server.js'], {
  cwd: fileURLToPath(new URL('../', import.meta.url)), stdio: ['ignore', 'pipe', 'pipe'],
  env: { ...process.env, DISCORD_TOKEN: '', DATABASE_PATH: join(directory, 'never-open.sqlite'),
    PREVIEW_PORT: String(port), PREVIEW_GIFTS_ROSTER: source, GIFTS_ADMIN_IDS: `${admin},${owner}`, GIFTS_DM_ONLY_ADMIN_ID: owner },
});
let output = '';
child.stdout.on('data', (chunk) => { output += chunk; });
child.stderr.on('data', (chunk) => { output += chunk; });
const call = async (path, data, headers = {}) => {
  const response = await fetch(origin + path, { signal: AbortSignal.timeout(2000),
    ...(data ? { method: 'POST', body: JSON.stringify(data), headers: { Origin: origin, 'Content-Type': 'application/json', ...headers } } : { headers }) });
  return { status: response.status, body: await response.json() };
};
try {
  let ready = false;
  for (let n = 0; n < 50; n++) {
    if (child.exitCode !== null) throw new Error(`Preview failed: ${output}`);
    try { if ((await call('/api/gifts')).status === 200) { ready = true; break; } } catch { /* Wait for bind. */ }
    await setTimeout(100);
  }
  assert.ok(ready, 'La demo debe arrancar.');
  let result = await call('/api/gifts');
  assert.equal(result.body.members.length, 4);
  assert.equal(result.body.privateRoster, true);
  const serialized = JSON.stringify(result.body);
  assert.ok(!serialized.includes(privateAddress) && !serialized.includes('0012345678'));
  assert.deepEqual(Object.keys(result.body.members[0]).sort(), ['category', 'dayMonth', 'demoted', 'hidden', 'name', 'role', 'userId', 'username']);
  assert.equal((await call('/api/gifts/start', { userId: user }, { Origin: 'https://foreign.invalid' })).status, 403);
  const badHostStatus = await new Promise((resolve, reject) => {
    get(origin + '/api/gifts', { headers: { Host: 'foreign.invalid' } }, (response) => {
      response.resume(); resolve(response.statusCode);
    }).on('error', reject);
  });
  assert.equal(badHostStatus, 403);
  assert.equal((await call('/api/gifts/action', { action: 'delete' })).status, 400);
  assert.equal((await call('/api/gifts/start', { userId: 'unknown' })).status, 400);
  result = await call('/api/gifts/start', { userId: user });
  assert.equal(result.body.cycle.state, 'announced');
  await call('/api/gifts/action', { action: 'join', userId: admin });
  result = await call('/api/gifts/action', { action: 'restart' });
  assert.deepEqual(result.body.cycle.participants, [admin]);
  assert.equal(result.body.events.filter((e) => e.kind === 'channel').length, 1);
  result = await call('/api/gifts/action', { action: 'restore' });
  assert.equal(result.body.cycle.state, 'restored');
  await call('/api/gifts/start', { userId: admin });
  result = await call('/api/gifts/action', { action: 'tick' });
  assert.equal(result.body.cycle, null);
  assert.equal(result.body.events.find((e) => e.kind === 'dm').recipientId, owner);
  result = await call('/api/gifts/action', { action: 'manual-hide' });
  assert.equal(result.body.cycle.exclusionMode, 'manual');
  await call('/api/gifts/action', { action: 'manual-restore' });
  result = await call('/api/gifts/action', { action: 'restore' });
  assert.equal(result.body.cycle.state, 'restored');
  result = await call('/api/gifts/start', { userId: owner });
  assert.equal(result.body.cycle, null);
  assert.equal(result.body.events.find((e) => e.kind === 'dm').recipientId, admin);
  assert.equal(result.body.events.filter((e) => e.kind === 'channel').length, 0);
  await call('/api/gifts/start', { userId: excluded });
  result = await call('/api/gifts/action', { action: 'restart' });
  assert.equal(result.body.cycle, null);
  assert.ok(result.body.events.every((e) => e.kind === 'system'));
  assert.equal(result.body.members.find((m) => m.userId === excluded).hidden, false);
  for (const path of ['/cumples', '/gifts.js', '/gifts.css']) {
    const response = await fetch(origin + path);
    assert.equal(response.status, 200);
    assert.match(response.headers.get('Content-Security-Policy'), /frame-ancestors 'none'/);
    assert.ok((await response.text()).length > 100);
  }
  assert.equal((await call('/data/roster.csv')).status, 404);
  console.log('Preview HTTP OK: 3 flujos y no-gift, participantes, cierre, reinicio, Host/Origin y contactos privados.');
} finally {
  if (child.exitCode === null) { child.kill('SIGTERM'); await once(child, 'exit'); }
  await rm(directory, { recursive: true, force: true });
}
