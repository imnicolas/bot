import assert from 'node:assert/strict';
import { fork } from 'node:child_process';
import { once } from 'node:events';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import { z } from 'zod';
import { fixture } from './helpers.js';

test('dos procesos compiten por XP sin duplicar premios', { timeout: 15_000 }, async (t) => {
  const f = fixture(t);
  const workers = Array.from({ length: 2 }, () => {
    const child = fork(
      fileURLToPath(new URL('./fixtures/concurrent-award.ts', import.meta.url)),
      [f.path],
      {
        execArgv: ['--import', 'tsx'],
        stdio: ['ignore', 'ignore', 'inherit', 'ipc'],
      },
    );
    t.after(() => {
      if (child.exitCode === null) child.kill();
    });
    return { child, ready: once(child, 'message'), exited: once(child, 'exit') };
  });
  for (const [value] of await Promise.all(workers.map((w) => w.ready)))
    assert.equal(value, 'ready');
  const results = workers.map(({ child }) => {
    const result = once(child, 'message');
    child.send('go');
    return result;
  });
  const schema = z.object({ xp: z.boolean() });
  const awards = (await Promise.all(results)).map(([value]) => schema.parse(value));
  for (const [code] of await Promise.all(workers.map((w) => w.exited))) assert.equal(code, 0);
  assert.equal(awards.filter((r) => r.xp).length, 1);
  assert.equal(f.levels.profile('1', '2').xp, 25);
});
