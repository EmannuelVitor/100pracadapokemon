import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, resolve, sep } from 'node:path';
import { Readable } from 'node:stream';
import { fail, json, roomsApi } from './api.mjs';

const rows = new Map();
const storage = {
  async insert(code, state, expires) {
    if (rows.has(code)) return false;
    rows.set(code, { state: structuredClone(state), expires, version: 0 });
    return true;
  },
  async read(code, now) {
    const row = rows.get(code);
    return row?.expires > now ? structuredClone(row) : null;
  },
  async update(code, version, state, expires) {
    if (rows.get(code)?.version !== version) return false;
    rows.set(code, { state: structuredClone(state), expires, version: version + 1 });
    return true;
  },
  async clean(now) {
    for (const [code, row] of rows) if (row.expires <= now) rows.delete(code);
  },
};
const assets = resolve('public');
const types = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml', '.webp': 'image/webp', '.woff2': 'font/woff2', '.png': 'image/png', '.json': 'application/json',
};

async function serve(request) {
  const pathname = new URL(request.url).pathname;
  if (pathname.startsWith('/api/rooms')) return roomsApi(request, storage);
  if (pathname === '/api/ranking') return json({ ranking: [], local: true });
  if (pathname.startsWith('/api/')) return fail('Serviço disponível no Firebase.', 503);
  if (!['GET', 'HEAD'].includes(request.method)) return new Response(null, { status: 405 });
  const file = resolve(assets, pathname === '/' ? 'index.html' : `.${pathname}`);
  const mime = types[extname(file)];
  if (file.startsWith(`${assets}${sep}`) && mime) {
    try {
      const body = await readFile(file);
      return new Response(request.method === 'HEAD' ? null : body, {
        headers: { 'Content-Type': mime, 'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'no-cache' },
      });
    } catch (error) {
      if (!['ENOTDIR', 'ENOENT'].includes(error.code)) throw error;
    }
  }
  return new Response('Página não encontrada.', { status: 404 });
}

const host = process.env.POKEMON_HOST || '127.0.0.1';
const port = Number(process.env.POKEMON_PORT || 4173);
createServer(async (incoming, outgoing) => {
  try {
    const streaming = !['GET', 'HEAD'].includes(incoming.method);
    const request = new Request(`http://localhost:${port}${incoming.url}`, {
      method: incoming.method, headers: incoming.headers,
      ...(streaming ? { body: Readable.toWeb(incoming), duplex: 'half' } : {}),
    });
    const response = await serve(request);
    outgoing.writeHead(response.status, Object.fromEntries(response.headers));
    if (response.body) Readable.fromWeb(response.body).pipe(outgoing);
    else outgoing.end();
  } catch (error) {
    console.error(error.message);
    if (!outgoing.headersSent) outgoing.writeHead(500);
    outgoing.end();
  }
}).listen(port, host, () => console.log(`100 Pra Cada Pokémon em http://${host}:${port}/`));
