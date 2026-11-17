import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { FieldValue, getFirestore, Timestamp } from 'firebase-admin/firestore';
import { onRequest } from 'firebase-functions/v2/https';
import { fail, json, playerName, readBody, roomsApi } from './shared/api.mjs';
import { avatarInfo } from './shared/public/avatars.mjs';
import { tournamentScores } from './leaderboard.mjs';

initializeApp();
const db = getFirestore();
const auth = getAuth();
const rooms = db.collection('auctionRooms');
const profiles = db.collection('auctionProfiles');

const store = {
  async insert(code, state, expires) {
    try {
      await rooms.doc(code).create({ state: JSON.stringify(state), version: 0, expiresAt: Timestamp.fromMillis(expires) });
      return true;
    } catch (error) {
      if (error.code === 6) return false;
      throw error;
    }
  },
  async read(code, now) {
    const row = (await rooms.doc(code).get()).data();
    return row?.expiresAt.toMillis() > now ? { ...row, state: JSON.parse(row.state) } : null;
  },
  update(code, version, state, expires) {
    const room = rooms.doc(code);
    return db.runTransaction(async transaction => {
      const current = (await transaction.get(room)).data();
      if (current?.version !== version) return false;
      transaction.update(room, { state: JSON.stringify(state), version: version + 1, expiresAt: Timestamp.fromMillis(expires) });
      if (state.game.phase === 'finished' && JSON.parse(current.state).game.phase !== 'finished') {
        for (const [uid, record] of tournamentScores(state.game, state.accounts)) {
          transaction.update(profiles.doc(uid), {
            score: FieldValue.increment(record.score), wins: FieldValue.increment(record.wins),
            titles: FieldValue.increment(record.titles), played: FieldValue.increment(1),
          });
        }
      }
      return true;
    });
  },
  async clean(now) {
    const expired = await rooms.where('expiresAt', '<=', Timestamp.fromMillis(now)).limit(25).get();
    if (expired.empty) return;
    const batch = db.batch();
    expired.docs.forEach(doc => batch.delete(doc.ref, { lastUpdateTime: doc.updateTime }));
    await batch.commit();
  },
};

async function identity(token) {
  if (!token || token.length > 8192) return null;
  try {
    const user = await auth.verifyIdToken(token);
    return user.email_verified && user.firebase.sign_in_provider === 'google.com' ? user : null;
  } catch (error) {
    if (error.code?.startsWith('auth/')) return null;
    throw error;
  }
}

function publicProfile(profile) {
  return profile ? {
    name: profile.name, avatar: profile.avatar, score: profile.score ?? 0,
    titles: profile.titles ?? 0, wins: profile.wins ?? 0, played: profile.played ?? 0,
  } : null;
}

async function getAccount(token) {
  const user = await identity(token);
  if (!user) return null;
  return { uid: user.uid, profile: publicProfile((await profiles.doc(user.uid).get()).data()) };
}

async function router(request) {
  const path = new URL(request.url).pathname;
  if (path.startsWith('/api/rooms')) return roomsApi(request, store, getAccount);
  if (path === '/api/ranking' && request.method === 'GET') {
    const list = await profiles.where('score', '>', 0).orderBy('score', 'desc').limit(50).get();
    return json({ ranking: list.docs.map(doc => publicProfile(doc.data())) });
  }
  if (path !== '/api/profile') return fail('Página não encontrada.', 404);
  const user = await identity(request.headers.get('Authorization')?.match(/^Bearer (.+)$/)?.[1]);
  if (!user) return fail('Entre com sua conta Google.', 401);
  const ref = profiles.doc(user.uid);
  if (request.method === 'GET') return json({ profile: publicProfile((await ref.get()).data()) });
  if (request.method !== 'POST') return fail('Método indisponível.', 405);
  const body = await readBody(request);
  const name = playerName(body?.name);
  if (!name || !avatarInfo(body?.avatar))
    return fail('Informe seu nome e selecione um avatar de treinador ou Pokémon.');
  await ref.set({ name, avatar: body.avatar }, { merge: true });
  return json({ profile: publicProfile((await ref.get()).data()) });
}

export const auctionApi = onRequest({
  region: 'us-central1', maxInstances: 6, memory: '256MiB',
}, async (incoming, outgoing) => {
  try {
    const body = ['GET', 'HEAD'].includes(incoming.method) ? undefined : incoming.rawBody;
    const request = new Request(`https://firebase.internal${incoming.originalUrl}`, {
      method: incoming.method, headers: incoming.headers, body,
    });
    const response = await router(request);
    outgoing.status(response.status);
    response.headers.forEach((value, key) => outgoing.set(key, value));
    outgoing.send(Buffer.from(await response.arrayBuffer()));
  } catch (error) {
    console.error('Auction API error', error.code ?? error.name, error.message);
    outgoing.set('Cache-Control', 'no-store').status(503).json({ error: 'Serviço indisponível. Tente novamente.' });
  }
});
