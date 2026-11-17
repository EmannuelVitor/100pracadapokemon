import { act, advance, createGame, createPlayer, MAX_PLAYERS, snapshot } from './public/game.mjs';
import { avatarInfo } from './public/avatars.mjs';

const alphabet = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
const roomLifetime = 4 * 60 * 60 * 1000;
export const json = (body, status = 200) => Response.json(body, {
  status, headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
});
export const fail = (error, status = 400) => json({ error }, status);

function roomCode() {
  return Array.from(crypto.getRandomValues(new Uint8Array(6)), value => alphabet[value & 31]).join('');
}

export function playerName(value) {
  if (typeof value !== 'string') return '';
  return value.replace(/[\p{Cc}\p{Cf}]/gu, '').replace(/\s+/g, ' ').trim().slice(0, 22);
}

export async function readBody(request) {
  if (!request.body) return {};
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let size = 0;
  let content = '';
  for (let chunk = await reader.read(); !chunk.done; chunk = await reader.read()) {
    size += chunk.value.length;
    if (size > 2048) { await reader.cancel(); return null; }
    content += decoder.decode(chunk.value, { stream: true });
  }
  try {
    const body = JSON.parse(content + decoder.decode());
    return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
  } catch { return null; }
}

export async function roomsApi(request, store, getAccount = async () => null) {
  const path = new URL(request.url).pathname;
  const now = Date.now();
  const method = request.method;
  if (method !== 'GET' && method !== 'POST') return fail('Método indisponível.', 405);
  const body = method === 'POST' ? await readBody(request) : {};
  if (!body) return fail('Dados inválidos.');
  const entering = method === 'POST' && (path === '/api/rooms' || path.endsWith('/join'));
  const accountToken = entering && request.headers.get('X-Firebase-ID-Token');
  const account = accountToken ? await getAccount(accountToken) : null;
  if (accountToken && !account) return fail('Sua sessão do Google expirou. Entre de novo.', 401);
  if (account && !account.profile) return fail('Salve seu perfil antes de entrar usando sua conta.', 409);
  const name = account?.profile.name ?? playerName(body.name);
  const avatar = account?.profile.avatar ?? (avatarInfo(body.avatar) ? body.avatar : null);

  if (method === 'POST' && path === '/api/rooms') {
    if (!name) return fail('Digite seu nome de treinador.');
    const token = crypto.randomUUID();
    const id = crypto.randomUUID();
    const state = {
      game: createGame({ ...createPlayer(id, name), avatar }), tokens: { [token]: id },
      accounts: account ? { [id]: account.uid } : {},
    };
    for (let attempt = 0; attempt < 5; attempt++) {
      const code = roomCode();
      if (await store.insert(code, state, now + roomLifetime)) {
        if (store.clean && Math.random() < .06) await store.clean(now).catch(() => {});
        return json({ code, token, id, now, game: snapshot(state.game, id) }, 201);
      }
    }
    return fail('A criação da sala falhou. Tente de novo.', 503);
  }

  const route = path.match(/^\/api\/rooms\/([2-9A-HJ-NP-Z]{6})(?:\/(join|action))?$/);
  if (!route || (method === 'GET') === Boolean(route[2])) return fail('Sala indisponível.', 404);
  const [, code, operation] = route;
  const joining = operation === 'join';
  const token = joining ? crypto.randomUUID() : (request.headers.get('Authorization') ?? '').slice(7);
  const guestId = joining ? crypto.randomUUID() : null;
  if (joining && !name) return fail('Digite seu nome de treinador.');
  if (!joining && !/^[\da-f-]{36}$/.test(token)) return fail('Entre na sala com seu nome.', 401);

  for (let attempt = 0; attempt < 7; attempt++) {
    const row = await store.read(code, now);
    if (!row) return fail('Sala não encontrada. Confira o código.', 404);
    const { game, tokens } = row.state;
    const id = guestId ?? tokens[token];
    if (!id) return fail('Sua sessão expirou. Entre na sala novamente.', 401);
    let changed = advance(game, now);
    let error;

    if (joining) {
      const existing = account && Object.entries(row.state.accounts).find(([, uid]) => uid === account.uid)?.[0];
      if (existing) {
        if (changed && !await store.update(code, row.version, row.state, now + roomLifetime)) continue;
        const existingToken = Object.entries(tokens).find(([, player]) => player === existing)?.[0];
        return json({ code, id: existing, token: existingToken, now, game: snapshot(game, existing) });
      }
      if (game.phase !== 'lobby') return fail('O leilão desta sala já começou.', 409);
      if (game.players.length >= MAX_PLAYERS) return fail('A sala está cheia.', 409);
      game.players.push({ ...createPlayer(id, name), avatar });
      tokens[token] = id;
      if (account) row.state.accounts[id] = account.uid;
      changed = true;
    } else if (operation === 'action') {
      error = act(game, id, body.action, body, now);
      changed ||= !error;
    }

    if (!changed || await store.update(code, row.version, row.state, now + roomLifetime)) {
      const payload = { code, id, now, game: snapshot(game, id) };
      if (joining) payload.token = token;
      if (error) return json({ ...payload, error }, 409);
      return json(payload);
    }
  }
  return fail('Dois comandos chegaram juntos. Tente de novo.', 409);
}
