import { createServer } from 'node:http';
import type { IncomingMessage } from 'node:http';
import { readFile } from 'node:fs/promises';
import { z } from 'zod';
import { loadFeatures } from '../config/features.js';
import { probotMedia } from '../content/probot.js';
import { reactionAssetFiles } from '../content/reactions.js';
import { DemoSession } from './session.js';

const session = new DemoSession(undefined, loadFeatures(process.env));
const port = z.coerce
  .number()
  .int()
  .min(1024)
  .max(65535)
  .parse(process.env['PREVIEW_PORT'] ?? 4371);
const origin = `http://127.0.0.1:${port}`;

async function body(request: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(String(chunk));
    size += bytes.length;
    if (size > 8192) throw new Error('Mensaje demasiado largo.');
    chunks.push(bytes);
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const server = createServer(async (request, response) => {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' https://media.giphy.com https://cdn.discordapp.com; connect-src 'self'; frame-ancestors 'none'",
  );
  const json = (value: unknown, status = 200) => {
    response.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify(value));
  };
  try {
    // La demo sólo escucha loopback; las mutaciones también verifican el origen.
    if (request.method === 'POST' && request.headers.origin !== origin)
      return json({ error: 'Origen no permitido.' }, 403);
    if (request.method === 'GET' && request.url === '/api/state') return json(session.state());
    if (request.method === 'POST' && request.url === '/api/message') {
      const input = z
        .object({
          userId: z.enum(['101', '102', '103']),
          content: z.string().trim().min(1).max(1800),
        })
        .parse(await body(request));
      return json(await session.send(input.userId, input.content));
    }
    if (request.method === 'POST' && request.url === '/api/advance') {
      const { minutes } = z.object({ minutes: z.literal(1) }).parse(await body(request));
      session.advance(minutes);
      return json(session.state());
    }
    const files: Record<string, { file: string; type: string }> = {
      '/': { file: 'index.html', type: 'text/html' },
      '/client.js': { file: 'client.js', type: 'text/javascript' },
      '/styles.css': { file: 'styles.css', type: 'text/css' },
      '/pepe.png': { file: '../assets/pepe.png', type: 'image/png' },
    };
    for (const file of [...probotMedia.map((media) => media.file), ...reactionAssetFiles]) {
      if (file) files[`/assets/probot/${file}`] = {
        file: `../assets/probot/${file}`, type: file.endsWith('.gif') ? 'image/gif' : 'image/jpeg',
      };
    }
    const asset = files[request.url ?? ''];
    if (request.method !== 'GET' || !asset) return json({ error: 'No encontrado.' }, 404);
    const bytes = await readFile(new URL(`../../preview/${asset.file}`, import.meta.url));
    response.writeHead(200, { 'Content-Type': `${asset.type}; charset=utf-8` });
    response.end(bytes);
  } catch (error) {
    json({ error: error instanceof Error ? error.message : 'No se pudo procesar la demo.' }, 400);
  }
});

server.on('error', (error) => {
  session.close();
  console.error(error);
  process.exitCode = 1;
});
for (const signal of ['SIGINT', 'SIGTERM'] as const) {
  process.once(signal, () => {
    server.close(() => session.close());
    server.closeIdleConnections();
  });
}
server.listen(port, '127.0.0.1', () =>
  console.log(`Demo local: ${origin} · sin conexión a Discord ni datos reales.`),
);
