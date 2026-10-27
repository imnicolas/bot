import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { z } from 'zod';
import { executeCommand } from '../src/commands/registry.js';
import { probotAssetBase } from '../src/content/probot.js';
import { fixture } from './helpers.js';

test('cada resultado responde con el original indicado por el servidor y menciona al autor', (t) => {
  const { levels } = fixture(t);
  const cases = [
    ['desayuno', 0, 'animesher.com_sakura-card-captor-kero-1228813.gif'],
    ['desayuno', 1, 'tumblr_934345c79e0a95d977e8ad2574a5527a_51bcac4f_400.gif', 'No puede ser, <@123>. Te volvieron a robar'],
    ['almuerzo', 0, 'sanji-sanji-vin-smoke.gif', '<@123> es tu día de suerte! Sanji te guardó <3'],
    ['almuerzo', 2, 'tumblr_88ea4ba0d6546130a18d7077b2a0c2c6_02943bb8_540.gif', 'Fuiste <@123>, te la robó Luffy 🙁'],
    ['cena', 0, 'contrafile-grill-com.jpg'],
    ['cena', 1, 'sasha-cena.gif'],
    ['grupo comando', 0, 'ahj0Fx.gif'],
  ] as const;
  for (const [command, ticket, file, text] of cases) {
    const reply = executeCommand(command, { levels, userId: '123', guildId: '456', random: (n) => n === 3 ? ticket : 0 });
    assert.equal(reply?.gif, probotAssetBase + file);
    assert.match(reply?.content ?? '', /<@123>/);
    if (text) assert.equal(reply?.content, text);
  }
});

test('los archivos conservan el formato y hash registrados al recuperar los originales', () => {
  const sources = z.array(z.object({ file: z.string(), sha256: z.string().regex(/^[a-f0-9]{64}$/) }))
    .parse(JSON.parse(readFileSync(new URL('../docs/probot-reaction-sources.json', import.meta.url), 'utf8')));
  assert.equal(sources.length, 7);
  for (const { file, sha256 } of sources) {
    const data = readFileSync(new URL(`../assets/probot/${file}`, import.meta.url));
    assert.equal(createHash('sha256').update(data).digest('hex'), sha256, file);
    assert.ok(file.endsWith('.gif') ? data.subarray(0, 3).toString() === 'GIF' : data[0] === 0xff && data[1] === 0xd8);
  }
});
