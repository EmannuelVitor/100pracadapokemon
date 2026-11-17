import { dex, types, effectiveness } from './pokemon.mjs';
import { act, addBot, advance, AUCTION_TIME, createGame, createPlayer, maxBid, MAX_PLAYERS, snapshot, startGame, TEAM_SIZE, TURN_TIME } from './game.mjs';
import { authMessage, getUser, googleSignIn, hasAuthenticator, signOut, startAuthenticator, watchAccount } from './account.mjs';
import { avatarInfo, defaultAvatar, trainers } from './avatars.mjs';

const paths = {
  arrow: '<path d="M5 12h14m-6-6 6 6-6 6"/>', up: '<path d="M7 17 17 7M7 7h10v10"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2m20 0v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/><circle cx="9" cy="7" r="4"/>',
  bot: '<rect x="4" y="7" width="16" height="13" rx="3"/><path d="M12 7V3m-2 0h4M1 12v3m22-3v3M9 12v1m6-1v1m-5 4h4"/>',
  coin: '<circle cx="12" cy="12" r="9"/><path d="M10 16V8h3a2 2 0 1 1 0 4h-3m-2 2h6"/>',
  hammer: '<path d="m13 6 5 5m-8-2 5 5m-4-6 4-4 5 5-4 4m-7-3 4 4-7 7-4-4zm4 10h8"/>',
  trophy: '<path d="M8 21h8m-4-4v4M8 4h8v7a4 4 0 0 1-8 0zm0 2H4v3a3 3 0 0 0 3 3h1m8-6h4v3a3 3 0 0 1-3 3h-1"/>',
  book: '<path d="M4 5h6a2 2 0 0 1 2 2v14a4 4 0 0 0-4-4H3V6a1 1 0 0 1 1-1Zm16 0h-6a2 2 0 0 0-2 2v14a4 4 0 0 1 4-4h5V6a1 1 0 0 0-1-1Z"/>',
  flame: '<path d="M12 22c-4 0-7-3-7-7 0-3 2-6 4-8 0 3 2 4 2 4 0-4 2-7 4-9 0 5 5 7 5 13 0 4-3 7-8 7Z"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>', plus: '<path d="M12 5v14M5 12h14"/>',
  link: '<path d="M10 13a4 4 0 0 0 6 .5l3-3a4 4 0 0 0-6-6l-1 1m2 5a4 4 0 0 0-6-.5l-3 3a4 4 0 0 0 6 6l1-1"/>',
  back: '<path d="M19 12H5m6-6-6 6 6 6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  ball: '<circle cx="12" cy="12" r="9"/><path d="M3 12h5m8 0h5"/><circle cx="12" cy="12" r="4"/>',
  bolt: '<path d="m13 2-9 12h7l-1 8 10-12h-7z"/>',
  shield: '<path d="M12 22s7-3 7-9V5l-7-3-7 3v8c0 6 7 9 7 9Z"/>',
  swap: '<path d="M3 7h17m-4-4 4 4-4 4M21 17H4m4-4-4 4 4 4"/>',
};
const icon = name => `<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]}</svg>`;
const escapeHtml = value => String(value ?? '').replace(/[&<>"']/g, character => ({
  '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;',
}[character]));
const number = id => `#${String(id).padStart(3, '0')}`;
const money = amount => `₽${amount}`;
const image = (card, lazy = false, decorative = false) => `<img src="/pokemon/${card.id}.webp" alt="${decorative ? '' : card.name}" width="320" height="320" ${lazy ? 'loading="lazy"' : ''} decoding="async">`;
const typeTag = type => `<span class="type" style="--type:${types[type][1]}">${type === 'fire' ? icon('flame') : '<i></i>'}${types[type][0]}</span>`;
const colorOf = card => types[card.types[0]][1];
const header = document.querySelector('#header');
const main = document.querySelector('#main');
const dialog = document.querySelector('#dialog');
const notice = document.querySelector('#notice');
const storeKey = '100-pokemon-partida-v1';
const featured = [25, 9, 94, 3, 130, 149];
const soloPreview = document.body.hasAttribute('data-solo-preview');
let session;
let game;
let clockOffset = 0;
let busy = false;
let syncing = false;
let fullDex = false;
let bidDraft = null;
let toastTimer;
let profile;
let profileRequest;
let verifyCode;

function savedGame() {
  try { return JSON.parse(sessionStorage.getItem(storeKey)); } catch { return null; }
}

function saveGame(value) {
  try {
    if (value) sessionStorage.setItem(storeKey, JSON.stringify(value));
    else sessionStorage.removeItem(storeKey);
  } catch { /* The current game still works when browser storage is disabled. */ }
}

function toast(message) {
  clearTimeout(toastTimer);
  notice.hidden = false;
  notice.textContent = message;
  toastTimer = setTimeout(() => { notice.hidden = true; }, 4000);
}

function screenHeader(inGame = false) {
  header.innerHTML = `<div class="wrap nav">
    <a class="brand" href="/" data-action="${inGame ? 'home' : 'top'}" aria-label="100 Pra Cada Pokémon, início">
      <img src="/ball.svg" alt="" width="40" height="40">
      <span>100 PRA CADA<strong>POKÉMON</strong></span>
    </a>
    ${inGame ? `<button class="button outline compact" type="button" data-action="home">${icon('back')} Início</button>` : soloPreview ? `
      <nav aria-label="Navegação principal"><a href="#como-funciona">Como funciona</a><a href="#pokedex">Pokédex</a></nav>` : `
      <nav aria-label="Navegação principal">
        <a href="#como-funciona">Como funciona</a><a href="#pokedex">Pokédex</a>
      </nav>
      <div class="nav-controls">
        <button type="button" class="button compact nav-plain" data-action="ranking" aria-label="Ranking">${icon('trophy')} <span>Ranking</span></button>
        <button type="button" class="button compact nav-plain" data-action="profile" aria-label="Perfil de treinador">${profile ? avatar(profile.avatar) : icon('ball')} <span>${getUser() ? 'Meu perfil' : 'Perfil'}</span></button>
        <button class="button outline compact join" type="button" data-action="join">${icon('users')} <span>Entrar em sala</span> ${icon('up')}</button>
      </div>`}
  </div>`;
}

function dexCards() {
  const ids = fullDex ? Object.keys(dex).map(Number) : featured;
  return ids.map(id => {
    const card = dex[id];
    return `<button class="dex-card" data-action="pokemon" data-id="${id}" type="button" style="--card-accent:${colorOf(card)}">
      <span class="dex-number">${number(id)}</span>${image(card, true, true)}
      <strong>${card.name}</strong><span class="type-list">${typeTag(card.types[0])}</span>
    </button>`;
  }).join('');
}

function home() {
  screenHeader();
  const charizard = dex[6];
  main.innerHTML = `<div class="home-shell"><div class="wrap">
    <section class="hero" aria-labelledby="hero-title">
      <div class="hero-copy">
        <span class="eyebrow"><i></i> LEILÃO POKÉMON</span>
        <h1 id="hero-title">DÊ SEU LANCE.<br><em>MONTE SEU TIME.</em></h1>
        <p>Você tem <strong>₽100</strong> para montar um trio. Dispute seus Pokémon favoritos no leilão e leve seu time ao torneio.</p>
        <div class="hero-actions">${soloPreview ? `<button class="button primary" type="button" data-action="solo">${icon('bot')} Jogar contra bots ${icon('arrow')}</button>` : `
          <button class="button primary" type="button" data-action="create">${icon('plus')} Criar sala ${icon('arrow')}</button>
          <button class="button outline" type="button" data-action="solo">${icon('bot')} Jogar contra bots</button>
        `}
        </div>
        ${savedGame() ? `<button class="text-button resume" type="button" data-action="resume">Retomar partida ${icon('arrow')}</button>` : soloPreview ? '<p class="hero-note">Prévia jogável <span></span> Modo solo</p>' : '<p class="hero-note">2 a 8 treinadores por sala <span></span> Convidados podem jogar sem cadastro</p>'}
      </div>
      <div class="spotlight" aria-label="Pokémon em destaque">
        <div class="spot-top"><span class="lot-label"><i></i> EM DESTAQUE</span><span>${number(6)} / KANTO</span></div>
        <div class="spot-orbit" aria-hidden="true"></div><span class="spot-watermark" aria-hidden="true">006</span>
        <span class="spark spark-one" aria-hidden="true">+</span><span class="spark spark-two" aria-hidden="true">+</span>
        <div class="spot-art">${image(charizard)}</div>
        <div class="spot-bottom"><div><h2>Charizard</h2><div class="type-list">${charizard.types.map(typeTag).join('')}</div></div>
        <div class="spot-price"><span>LANCE INICIAL</span><strong>${money(charizard.opening)}</strong></div></div>
      </div>
    </section>
    <section id="como-funciona" class="rules" aria-labelledby="rules-title">
      <div class="section-top"><h2 id="rules-title">Como funciona</h2></div>
      <div class="rules-grid">
        ${rule('coin', 'Comece com ₽100', 'Todos os treinadores recebem o mesmo orçamento.')}
        ${rule('hammer', 'Dispute os lances', 'Cada lote tem 10 segundos. Um lance reinicia o relógio.')}
        ${rule('trophy', 'Batalhe com seu trio', 'Use as vantagens de tipo no torneio mata-mata.')}
      </div>
    </section>
    <section id="pokedex" class="dex" aria-labelledby="dex-title">
      <div class="section-top dex-heading"><div><div class="section-kicker">${icon('book')} REGIÃO DE KANTO</div><h2 id="dex-title">Pokédex do leilão</h2></div>
        <button class="button outline compact" data-action="expand-dex" aria-expanded="${fullDex}" aria-controls="dex-grid">${fullDex ? 'Ver destaques' : 'Ver os 42 Pokémon'} ${icon('arrow')}</button></div>
      <div id="dex-grid" class="dex-grid">${dexCards()}</div>
    </section>
    <footer><span>100 Pra Cada Pokémon</span><span>Projeto de fãs · Imagens via <a href="https://github.com/PokeAPI/sprites" target="_blank" rel="noopener">PokéAPI</a> e <a href="https://play.pokemonshowdown.com/sprites/trainers/" target="_blank" rel="noopener">Pokémon Showdown</a></span></footer>
  </div></div>`;
}

function rule(symbol, title, copy) {
  return `<article class="rule"><span class="rule-icon">${icon(symbol)}</span><div><h3>${title}</h3><p>${copy}</p></div></article>`;
}

function openDialog(title, content) {
  viewDialog = title;
  dialog.innerHTML = `<div class="dialog-top"><h2 id="dialog-title">${title}</h2><button class="icon-button" type="button" data-action="close" aria-label="Fechar">${icon('close')}</button></div>${content}`;
  if (!dialog.open) dialog.showModal();
  dialog.querySelector('input')?.focus();
}

function setup(mode, invite = '') {
  const labels = { create:'Criar sala', join:'Entrar em sala', solo:'Jogar contra bots' };
  const details = {
    create:'Crie um código de convite e monte a sala com seus amigos.',
    join:'Digite o código de 6 caracteres compartilhado pelo anfitrião.',
    solo:'Escolha quantos bots vão disputar o leilão com você.',
  };
  openDialog(labels[mode], `<p class="muted">${details[mode]}</p><form class="setup-form" id="setup-form" data-mode="${mode}">
    <label for="trainer-name">Nome de treinador</label><input id="trainer-name" name="name" value="${escapeHtml(profile?.name ?? '')}" placeholder="Seu nome" maxlength="22" autocomplete="nickname" ${profile && mode !== 'solo' ? 'readonly' : ''} required>
    ${mode === 'join' ? `<label for="room-code">Código da sala</label><input class="code-input" id="room-code" name="code" value="${escapeHtml(invite)}" placeholder="ABC234" minlength="6" maxlength="6" pattern="[2-9a-hj-np-zA-HJ-NP-Z]{6}" autocomplete="off" required>` : ''}
    ${mode === 'solo' ? `<label for="bot-count">Adversários</label><select id="bot-count" name="bots">${Array.from({length: 7}, (_, i) => `<option value="${i + 1}" ${i === 2 ? 'selected' : ''}>${i + 1} ${i === 0 ? 'bot' : 'bots'}</option>`).join('')}</select>` : ''}
    ${profile && mode !== 'solo' ? '<p class="muted setup-note">Seu perfil entra na sala. Duelos entre perfis autenticados valem pontos.</p>' : ''}
    <p class="form-error" role="alert" hidden></p>
    <button class="button primary" type="submit">${mode === 'solo' ? 'Começar leilão' : labels[mode]} ${icon('arrow')}</button>
  </form>`);
}

async function roomRequest(path, body, token, accountToken) {
  const headers = body ? { 'Content-Type': 'application/json' } : {};
  if (token) headers.Authorization = `Bearer ${token}`;
  if (accountToken) headers['X-Firebase-ID-Token'] = accountToken;
  const response = await fetch(path, { headers,
    ...(body ? { method: 'POST', body: JSON.stringify(body) } : {}),
  });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(result.error || 'O serviço online está indisponível.');
    error.result = result;
    error.status = response.status;
    throw error;
  }
  return result;
}

function avatar(value) {
  const info = avatarInfo(value);
  return info ? `<img class="avatar ${info.group}" src="${info.url}" alt="" width="36" height="36">` : icon('ball');
}

async function showProfile() {
  if (!getUser()) {
    openDialog('Perfil de treinador', `<p class="muted">Entre com sua conta Google para escolher um avatar e participar do ranking.</p><div class="account-actions">
      <button class="button primary" type="button" data-action="google-login">Entrar com Google ${icon('arrow')}</button>
    </div><p class="form-error" role="alert" hidden></p>`);
    return;
  }
  if (profileRequest) {
    openDialog('Perfil de treinador', '<p role="status" class="muted">Carregando perfil…</p>');
    try { await profileRequest; }
    catch (error) { if (dialog.open) openDialog('Perfil de treinador', `<p class="form-error">${escapeHtml(error.message)}</p>`); return; }
    if (!dialog.open || viewDialog !== 'Perfil de treinador') return;
  }
  renderProfile();
}

function renderProfile() {
  const selected = profile?.avatar ?? defaultAvatar;
  const group = avatarInfo(selected).group;
  openDialog('Perfil de treinador', `<form id="profile-form" class="setup-form">
    <label for="profile-name">Nome público</label><input id="profile-name" name="name" maxlength="22" value="${escapeHtml(profile?.name ?? '')}" placeholder="Seu nome no jogo" autocomplete="nickname" required>
    <fieldset class="avatar-field"><legend>Avatar</legend><div class="avatar-tabs" aria-label="Categoria de avatar">
      <button type="button" class="button outline compact" data-action="avatar-group" data-group="trainer" aria-pressed="${group === 'trainer'}">Treinadores</button>
      <button type="button" class="button outline compact" data-action="avatar-group" data-group="pokemon" aria-pressed="${group === 'pokemon'}">Pokémon</button>
    </div><input type="hidden" name="avatar" value="${selected}"><div id="avatar-grid" class="avatar-grid">${avatarChoices(group, selected)}</div></fieldset>
    <p class="form-error" role="alert" hidden></p>
    <button type="submit" class="button primary">Salvar perfil ${icon('arrow')}</button>
  </form>
  <div class="account-security"><div>${icon('shield')} <strong>Google Authenticator</strong></div>
    ${hasAuthenticator(getUser()) ? '<small>Verificação em duas etapas ativa.</small>' : '<button type="button" class="text-button" data-action="enable-totp">Ativar verificação em duas etapas</button>'}
    <button type="button" class="text-button sign-out" data-action="sign-out">Sair da conta</button>
    <p class="form-error" role="alert" hidden></p>
  </div>`);
}

function avatarChoices(group, selected) {
  const list = group === 'trainer' ? trainers : Object.keys(dex);
  return list.map(id => {
    const value = `${group}:${id}`;
    const info = avatarInfo(value);
    return `<button type="button" class="avatar-choice" data-action="set-avatar" data-value="${value}" aria-pressed="${value === selected}" title="${info.name}">${avatar(value)}<span>${info.name}</span></button>`;
  }).join('');
}

let viewDialog;
async function showRanking() {
  openDialog('Ranking de Kanto', '<p class="muted" role="status">Carregando classificação…</p>');
  try {
    const result = await roomRequest('/api/ranking');
    if (!dialog.open || viewDialog !== 'Ranking de Kanto') return;
    const entries = result.ranking.map((line, index, all) => `<li>
      <span class="rank-place">${all.findIndex(item => item.score === line.score) + 1}</span><span class="player-icon">${avatar(line.avatar)}</span>
      <span class="player-name"><strong>${escapeHtml(line.name)}</strong><small>${line.wins} ${line.wins === 1 ? 'vitória' : 'vitórias'} · ${line.titles} ${line.titles === 1 ? 'título' : 'títulos'}</small></span>
      <b class="rank-score">${line.score} pts</b></li>`).join('');
    openDialog('Ranking de Kanto', `<p class="muted">Ganhe 1 ponto por duelo vencido contra um jogador autenticado e 3 pelo título se disputar um duelo válido.</p>
      ${result.local ? '<p class="rank-empty">O ranking global está disponível no Firebase.</p>' : entries ?
        `<ol class="players rank-list">${entries}</ol>` : '<p class="rank-empty">O primeiro duelo pontuado ainda vai acontecer.</p>'}`);
  } catch (error) {
    if (dialog.open && viewDialog === 'Ranking de Kanto') openDialog('Ranking de Kanto', `<p class="form-error">${escapeHtml(error.message)}</p>`);
  }
}

function totpDialog(confirm, key) {
  const enabling = Boolean(key);
  openDialog(enabling ? 'Ativar Google Authenticator' : 'Verificação em duas etapas', `
    ${enabling ? `<p class="muted">No Google Authenticator, escolha adicionar uma chave de configuração e selecione o tipo baseado no tempo.</p>
      <label for="totp-key" class="mfa-key-label">Chave de configuração</label><input id="totp-key" class="mfa-key" value="${escapeHtml(key)}" readonly>`
      : '<p class="muted">Digite o código atual do Google Authenticator.</p>'}
    <form id="totp-form" data-enroll="${enabling}" class="setup-form">
      <label for="totp-code">Código de 6 dígitos</label><input id="totp-code" name="code" pattern="[0-9]{6}" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required>
      <p class="form-error" role="alert" hidden></p><button type="submit" class="button primary">Confirmar código ${icon('arrow')}</button>
    </form>`);
  verifyCode = confirm;
  dialog.querySelector('#totp-code').focus();
}

async function withFeedback(button, task) {
  const errorLabel = button?.closest('form, .account-security')?.querySelector('.form-error') ?? dialog.querySelector('.form-error');
  if (errorLabel) errorLabel.hidden = true;
  if (button) button.disabled = true;
  try { await task(); }
  catch (error) {
    const message = authMessage(error);
    if (errorLabel && errorLabel.isConnected) { errorLabel.textContent = message; errorLabel.hidden = false; }
    else toast(message);
  } finally { if (button) button.disabled = false; }
}

function updateGame(next, now) {
  clockOffset = now - Date.now();
  const changed = JSON.stringify(next) !== JSON.stringify(game);
  if (changed) {
    if (next.auction?.id !== game?.auction?.id || next.auction?.amount !== game?.auction?.amount) bidDraft = null;
    const previous = game?.phase;
    game = next;
    renderGame();
    if (previous !== game.phase) window.scrollTo(0, 0);
  }
  updateClock();
}

function enter(current, next, now = Date.now()) {
  session = current;
  if (dialog.open) dialog.close();
  saveGame(session);
  screenHeader(true);
  updateGame(next, now);
  main.focus({ preventScroll: true });
}

async function submitSetup(form) {
  const data = new FormData(form);
  const name = data.get('name').trim();
  const mode = form.dataset.mode;
  const problem = form.querySelector('.form-error');
  const button = form.querySelector('button');
  problem.hidden = true;
  button.disabled = true;
  try {
    if (!name) throw new Error('Digite seu nome de treinador.');
    if (mode === 'solo') {
      const id = 'local';
      const local = createGame(createPlayer(id, name));
      for (let count = 0; count < Number(data.get('bots')); count++) addBot(local);
      startGame(local, Date.now());
      enter({ mode: 'solo', id, local }, snapshot(local, id));
      return;
    }
    const code = String(data.get('code') ?? '').toUpperCase();
    const user = getUser();
    if (profileRequest) await profileRequest;
    if (user && !profile) throw new Error('Salve seu perfil antes de entrar usando a conta Google.');
    const result = await roomRequest(mode === 'join' ? `/api/rooms/${code}/join` : '/api/rooms',
      { name }, null, user ? await user.getIdToken() : null);
    enter({ mode: 'online', id: result.id, code: result.code, token: result.token }, result.game, result.now);
    history.replaceState(null, '', `/?sala=${result.code}`);
  } catch (error) {
    problem.textContent = error.message || 'Tente novamente.';
    problem.hidden = false;
  } finally { button.disabled = false; }
}

async function resume() {
  const previous = savedGame();
  if (!previous || busy) return;
  busy = true;
  try {
    if (previous.mode === 'solo') {
      advance(previous.local, Date.now());
      enter(previous, snapshot(previous.local, previous.id));
    } else {
      const data = await roomRequest(`/api/rooms/${previous.code}`, null, previous.token);
      enter(previous, data.game, data.now);
      history.replaceState(null, '', `/?sala=${previous.code}`);
    }
  } catch (error) {
    if ([401, 404].includes(error.status)) { saveGame(null); home(); }
    toast(error.message);
  } finally { busy = false; }
}

function goHome() {
  session = null;
  game = null;
  bidDraft = null;
  history.replaceState(null, '', '/');
  home();
  window.scrollTo(0, 0);
  main.focus({ preventScroll: true });
}

async function gameAction(action, args = {}) {
  if (busy || !session) return;
  busy = true;
  const current = session;
  try {
    if (current.mode === 'solo') {
      const now = Date.now();
      advance(current.local, now);
      const problem = act(current.local, current.id, action, args, now);
      saveGame(current);
      updateGame(snapshot(current.local, current.id), now);
      if (problem) toast(problem);
    } else {
      const result = await roomRequest(`/api/rooms/${current.code}/action`, { action, ...args }, current.token);
      if (session === current) updateGame(result.game, result.now);
    }
  } catch (error) {
    if (session === current) {
      if (error.result?.game) updateGame(error.result.game, error.result.now);
      toast(error.message);
    }
  } finally { busy = false; }
}

function updateClock() {
  const timer = document.querySelector('[data-deadline]');
  if (!timer) return;
  const left = Math.max(0, Number(timer.dataset.deadline) - Date.now() - clockOffset);
  const time = `${Math.ceil(left / 1000)}s`;
  const label = timer.querySelector('strong');
  if (label.textContent !== time) label.textContent = time;
  timer.style.setProperty('--progress', Math.min(1, left / Number(timer.dataset.window)));
  timer.classList.toggle('urgent', left <= 3000);
}

async function synchronize() {
  if (!session || busy || syncing || ['finished', 'closed'].includes(game?.phase)) return;
  if (session.mode === 'solo') {
    if (advance(session.local, Date.now())) {
      saveGame(session);
      updateGame(snapshot(session.local, session.id), Date.now());
    }
    return;
  }
  const current = session;
  const observed = game;
  syncing = true;
  try {
    const result = await roomRequest(`/api/rooms/${current.code}`, null, current.token);
    if (session === current && game === observed && !busy) updateGame(result.game, result.now);
  } catch (error) {
    if (session === current && [401, 404].includes(error.status)) {
      saveGame(null);
      goHome();
      toast(error.message);
    } else if (session === current && notice.hidden) toast('Conexão com a sala instável. Reconectando…');
  } finally { syncing = false; }
}

const getPlayer = id => game.players.find(player => player.id === id);
const own = () => getPlayer(session.id);
const playerName = id => escapeHtml(getPlayer(id)?.name ?? '—');
const timer = (deadline, window) => `<div class="timer" data-deadline="${deadline}" data-window="${window}">${icon('clock')}<strong></strong><i></i></div>`;

function phaseHead(phase, title, description, extra = '') {
  return `<div class="game-heading"><div><div class="eyebrow"><i></i> ${phase}</div><h1>${title}</h1><p>${description}</p></div>${extra}</div>`;
}

function renderGame() {
  const focused = main.contains(document.activeElement) ? document.activeElement.dataset.focus : '';
  const ui = { lobby: lobbyView, auction: auctionView, battle: battleView, finished: finishedView }[game.phase];
  main.innerHTML = `<div class="wrap game-page">${ui()}</div>`;
  if (focused) main.querySelector(`[data-focus="${CSS.escape(focused)}"]`)?.focus({ preventScroll: true });
}

function lobbyView() {
  const host = game.host === session.id;
  return `${phaseHead('SALA DE ESPERA', 'Prepare o leilão', 'Copie o link ou compartilhe o código com seus amigos.')}
    <div class="game-grid"><section class="panel lobby-panel">
      <span class="section-kicker">CÓDIGO DA SALA</span><strong class="room-code">${session.code}</strong>
      <button class="button primary" data-action="copy" data-focus="copy">${icon('link')} Copiar link de convite</button>
      <div class="lobby-actions">${host ? `
        <button class="button outline" data-action="bot" data-focus="bot" ${game.players.length >= MAX_PLAYERS ? 'disabled' : ''}>${icon('bot')} Adicionar bot</button>
        <button class="button outline" data-action="start" data-focus="start" ${game.players.length < 2 ? 'disabled' : ''}>Começar leilão ${icon('arrow')}</button>` : `<p class="muted">Aguardando ${playerName(game.host)} iniciar o leilão.</p>`}
      </div>
    </section>${playersPanel()}</div>`;
}

function playersPanel() {
  return `<section class="panel side-panel"><div class="panel-heading"><h2>Treinadores</h2><span class="section-kicker">${game.players.length}${game.phase === 'lobby' ? ` / ${MAX_PLAYERS}` : ''}</span></div>
    <ul class="players">${game.players.map(player => `<li><div class="player-icon">${player.bot ? icon('bot') : avatar(player.avatar)}</div><div class="player-name"><strong>${escapeHtml(player.name)}</strong><small>${player.id === session.id ? 'Você' : player.bot ? 'Bot' : player.id === game.host ? 'Anfitrião' : 'Treinador'}</small></div><div class="player-funds"><b>${money(player.coins)}</b><small>${player.team.length}/${TEAM_SIZE} Pokémon</small></div></li>`).join('')}</ul>
  </section>`;
}

function teamPanel(player) {
  return `<section class="panel side-panel"><div class="panel-heading"><h2>Meu trio</h2><span class="section-kicker">${player.team.length} / ${TEAM_SIZE}</span></div>
    <div class="mini-team">${Array.from({length: TEAM_SIZE}, (_, i) => {
      const item = player.team[i];
      if (!item) return `<div class="empty-slot">${icon('ball')}<span>Vaga livre</span></div>`;
      const card = dex[item.id];
      return `<div class="mini-card" style="--card-accent:${colorOf(card)}">${image(card, false, true)}<strong>${card.name}</strong><small>${money(item.price)}</small></div>`;
    }).join('')}</div></section>`;
}

function auctionView() {
  const player = own();
  const lot = game.auction;
  const card = dex[lot.id];
  const high = lot.bidder === session.id;
  const minimum = lot.amount + 1;
  const maximum = maxBid(player);
  const enabled = !lot.closing && !high && maximum >= minimum;
  const status = lot.closing ? lot.bidder ? `Vendido a ${playerName(lot.bidder)}` : 'Lote sem lances' : high ? 'Seu lance está na frente' : player.team.length === TEAM_SIZE ? 'Seu trio está completo' : maximum < minimum ? 'Saldo disponível insuficiente' : 'Cada novo lance reinicia o relógio.';
  return `${phaseHead('FASE 1 · LEILÃO', 'Arena de leilão', 'Monte seu trio com os Pokémon que vencer no leilão.', `<div class="balance">${icon('coin')} <span>SEU SALDO<strong>${money(player.coins)}</strong></span></div>`)}
    <div class="game-grid"><div class="game-stack">
      <section class="panel lot-panel"><div class="lot-top"><span class="lot-label"><i></i> LOTE ${String(lot.index + 1).padStart(2, '0')}</span>${timer(lot.deadline, lot.closing ? 2200 : AUCTION_TIME)}</div>
        <div class="live-card" style="--card-accent:${colorOf(card)}"><div class="live-orbit" aria-hidden="true"></div><span class="dex-number">${number(card.id)}</span>${image(card)}
          <div class="live-card-info"><h2>${card.name}</h2><div class="type-list">${card.types.map(typeTag).join('')}</div><span class="stat">Força <b>${card.power}</b></span></div>
        </div>
        <div class="bid-area"><div class="bid-summary"><span class="section-kicker">${lot.bidder ? 'MAIOR LANCE' : 'LANCE INICIAL'}</span><strong>${money(lot.bidder ? lot.amount : lot.opening)}</strong>${lot.bidder ? `<small>${playerName(lot.bidder)}</small>` : '<small>Aguardando lances</small>'}</div>
        <form id="bid-form" class="bid-form"><label class="visually-hidden" for="bid-amount">Valor do lance</label><input id="bid-amount" name="amount" type="number" inputmode="numeric" min="${minimum}" max="${maximum}" step="1" value="${bidDraft ?? minimum}" data-focus="bid-input" ${enabled ? '' : 'disabled'} required>
        <button class="button primary" data-focus="bid" ${enabled ? '' : 'disabled'}>${icon('hammer')} Dar lance</button><span class="bid-status">${status}</span></form></div>
      </section>${logPanel('Histórico de lances')}
    </div><div class="game-stack">${teamPanel(player)}${playersPanel()}</div></div>`;
}

function logPanel(title) {
  return `<section class="panel side-panel"><div class="panel-heading"><h2>${title}</h2></div><ul class="game-log">${game.log.length ? game.log.map(line => `<li>${escapeHtml(line)}</li>`).join('') : '<li>Os lances vão aparecer aqui.</li>'}</ul></section>`;
}

function bracketPanel() {
  return `<section class="panel side-panel"><div class="panel-heading"><h2>Chave do torneio</h2></div>
    ${game.tournament.rounds.map(round => `<div class="round"><h3>${round.name}</h3>${round.matches.map(match => `<p class="bracket-match"><span class="${match.winner === match.players[0] ? 'winner' : ''}">${playerName(match.players[0])}</span><i>${match.players[1] ? '×' : '·'}</i><span class="${match.winner && match.winner === match.players[1] ? 'winner' : ''}">${match.players[1] ? playerName(match.players[1]) : 'Avança direto'}</span></p>`).join('')}</div>`).join('')}
  </section>`;
}

function fighter(side) {
  const battle = game.battle;
  const player = getPlayer(battle.players[side]);
  const active = battle.active[side];
  const card = active >= 0 ? dex[player.team[active].id] : null;
  const hp = battle.hp[side][active] ?? 0;
  const maxHp = card ? Math.round(58 + card.power * .59) : 1;
  return `<div class="fighter" style="--card-accent:${card ? colorOf(card) : '#627186'}"><p class="section-kicker">${escapeHtml(player.name)}${session.id === player.id ? ' · VOCÊ' : ''}</p>
    <div class="fighter-art">${card ? image(card) : icon('ball')}</div><h3>${card?.name ?? 'Time derrotado'}</h3>
    ${card ? `<div class="type-list">${card.types.map(typeTag).join('')}</div>` : ''}
    <div class="hp"><span>PV</span><progress max="${maxHp}" value="${hp}" aria-label="Pontos de vida"></progress><b>${hp}/${card ? maxHp : 0}</b></div>
    <div class="fighter-slots">${battle.hp[side].map(remaining => `<span class="${remaining ? '' : 'fainted'}" aria-label="${remaining ? 'Pokémon disponível' : 'Pokémon desmaiado'}">${icon('ball')}</span>`).join('')}</div></div>`;
}

function battleControls(side) {
  const battle = game.battle;
  if (battle.winner) return `<p class="duel-status">${icon('trophy')} ${playerName(battle.winner)} venceu o duelo.</p>`;
  if (side < 0) return `<p class="duel-status">Você está assistindo a este duelo.</p>`;
  if (battle.choices[side]) return `<p class="duel-status">Movimento enviado. Aguardando o adversário…</p>`;
  const card = dex[own().team[battle.active[side]].id];
  const target = dex[getPlayer(battle.players[1 - side]).team[battle.active[1 - side]].id];
  const note = type => {
    const factor = effectiveness(type, target);
    return factor === 0 ? 'Imune' : factor > 1 ? 'Super eficaz' : factor < 1 ? 'Pouco eficaz' : 'Dano normal';
  };
  const move = (id, iconName, label, description) => `<button class="move-button" data-action="move" data-move="${id}" data-focus="${id}" type="button">${icon(iconName)}<span><strong>${label}</strong><small>${description}</small></span></button>`;
  return `<div class="battle-actions"><h3>Escolha seu movimento</h3><div class="moves">
    ${move('attack', 'bolt', 'Ataque normal', note('normal'))}
    ${card.types.map((type, index) => move(`type${index}`, type === 'fire' ? 'flame' : 'bolt', `Ataque de ${types[type][0]}`, note(type))).join('')}
    ${move('guard', 'shield', 'Defender', 'Reduz o dano recebido')}
    ${own().team.map((item, index) => index !== battle.active[side] && battle.hp[side][index] ? move(`switch${index}`, 'swap', `Trocar para ${dex[item.id].name}`, `${battle.hp[side][index]} PV`) : '').join('')}
  </div></div>`;
}

function battleView() {
  const battle = game.battle;
  const side = battle.players.indexOf(session.id);
  return `${phaseHead('FASE 2 · TORNEIO', game.tournament.rounds.at(-1).name, 'Escolha ataques, defenda ou troque seu Pokémon a cada turno.')}
    <div class="game-grid"><div class="game-stack"><section class="panel lot-panel">
      <div class="lot-top"><span class="lot-label"><i></i> TURNO ${battle.turn}</span>${timer(battle.deadline, battle.winner ? 4300 : TURN_TIME)}</div>
      <div class="fighters">${fighter(side === 1 ? 1 : 0)}<span class="versus">VS</span>${fighter(side === 1 ? 0 : 1)}</div>
      ${battleControls(side)}
    </section>${logPanel('Últimos movimentos')}</div><div class="game-stack">${bracketPanel()}${teamPanel(own())}</div></div>`;
}

function finishedView() {
  const champion = getPlayer(game.champion);
  return `${phaseHead('TORNEIO ENCERRADO', champion.id === session.id ? 'Você é campeão!' : `${escapeHtml(champion.name)} venceu!`, 'O trio campeão do leilão de Kanto.')}
    <div class="game-grid"><section class="panel champion"><span class="champion-icon">${icon('trophy')}</span><h2>${escapeHtml(champion.name)}</h2>
      <div class="champion-team">${champion.team.map(item => { const card = dex[item.id]; return `<div style="--card-accent:${colorOf(card)}">${image(card, false, true)}<strong>${card.name}</strong></div>`; }).join('')}</div>
      <button class="button primary" type="button" data-action="new-game">Jogar novamente ${icon('arrow')}</button>
    </section>${bracketPanel()}</div>`;
}

async function copyLink() {
  const invite = new URL(`/?sala=${session.code}`, location.href).href;
  try { await navigator.clipboard.writeText(invite); toast('Link de convite copiado.'); }
  catch {
    openDialog('Link de convite', `<p class="muted">Copie o endereço para enviar aos jogadores.</p><label class="visually-hidden" for="invite-link">Link de convite</label><input id="invite-link" value="${escapeHtml(invite)}" readonly>`);
    dialog.querySelector('input').select();
  }
}

document.addEventListener('click', event => {
  const item = event.target.closest('[data-action]');
  if (!item) return;
  const { action } = item.dataset;
  if (['home', 'top'].includes(action)) event.preventDefault();
  if (['create', 'join', 'solo'].includes(action)) setup(action);
  if (action === 'home') goHome();
  if (action === 'top') window.scrollTo({ top: 0, behavior: 'smooth' });
  if (action === 'resume') resume();
  if (action === 'profile') showProfile();
  if (action === 'ranking') showRanking();
  if (action === 'google-login') withFeedback(item, async () => {
    const verify = await googleSignIn();
    if (verify) totpDialog(verify);
  });
  if (action === 'enable-totp') withFeedback(item, async () => {
    const enrollment = await startAuthenticator();
    if (dialog.open && viewDialog === 'Perfil de treinador') totpDialog(enrollment.confirm, enrollment.key);
  });
  if (action === 'sign-out') withFeedback(item, async () => { await signOut(); dialog.close(); toast('Você saiu da conta.'); });
  if (action === 'avatar-group') {
    dialog.querySelectorAll('[data-action="avatar-group"]').forEach(button => button.setAttribute('aria-pressed', String(button === item)));
    dialog.querySelector('#avatar-grid').innerHTML = avatarChoices(item.dataset.group, dialog.querySelector('[name="avatar"]').value);
  }
  if (action === 'set-avatar') {
    dialog.querySelectorAll('.avatar-choice').forEach(button => button.setAttribute('aria-pressed', String(button === item)));
    dialog.querySelector('[name="avatar"]').value = item.dataset.value;
  }
  if (action === 'close') dialog.close();
  if (action === 'copy') copyLink();
  if (action === 'new-game') { saveGame(null); goHome(); }
  if (['bot', 'start'].includes(action)) gameAction(action);
  if (action === 'move') gameAction('move', { move: item.dataset.move, turn: game.battle.turn,
    round: game.tournament.rounds.length, match: game.battle.index });
  if (action === 'expand-dex') {
    fullDex = !fullDex;
    document.querySelector('#dex-grid').innerHTML = dexCards();
    item.setAttribute('aria-expanded', String(fullDex));
    item.innerHTML = `${fullDex ? 'Ver destaques' : 'Ver os 42 Pokémon'} ${icon('arrow')}`;
  }
  if (action === 'pokemon') {
    const card = dex[item.dataset.id];
    openDialog(card.name, `<div class="dex-detail" style="--card-accent:${colorOf(card)}">${image(card)}</div>
      <div class="type-list">${card.types.map(typeTag).join('')}</div>
      <dl class="detail-stats"><div><dt>Pokédex</dt><dd>${number(card.id)}</dd></div><div><dt>Força</dt><dd>${card.power}</dd></div><div><dt>Lance inicial</dt><dd>${money(card.opening)}</dd></div></dl>`);
  }
});

document.addEventListener('submit', event => {
  if (event.target.id === 'setup-form') { event.preventDefault(); submitSetup(event.target); }
  if (event.target.id === 'bid-form') {
    event.preventDefault();
    gameAction('bid', { lot: game.auction.id, amount: Number(new FormData(event.target).get('amount')) });
  }
  if (event.target.id === 'profile-form') {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(event.target));
    withFeedback(event.submitter, async () => {
      const user = getUser();
      if (!user) throw new Error('Entre novamente com Google.');
      const result = await roomRequest('/api/profile', data, await user.getIdToken());
      profile = result.profile;
      screenHeader(Boolean(session));
      dialog.close();
      toast('Seu perfil foi salvo.');
    });
  }
  if (event.target.id === 'totp-form') {
    event.preventDefault();
    const code = new FormData(event.target).get('code');
    const enrolling = event.target.dataset.enroll === 'true';
    const confirm = verifyCode;
    if (!confirm) return;
    withFeedback(event.submitter, async () => {
      await confirm(code);
      if (enrolling) { renderProfile(); toast('Verificação em duas etapas ativada.'); }
      else showProfile();
    });
  }
});
document.addEventListener('input', event => {
  if (event.target.id === 'bid-amount') bidDraft = event.target.value === '' ? null : Number(event.target.value);
  if (event.target.id === 'room-code') event.target.value = event.target.value.toUpperCase();
});
dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
dialog.addEventListener('close', () => { if (!dialog.open) { verifyCode = null; dialog.replaceChildren(); } });

home();
watchAccount(user => {
  profile = null;
  screenHeader(Boolean(session));
  if (!user) { profileRequest = null; return; }
  const request = user.getIdToken().then(token => roomRequest('/api/profile', null, token)).then(result => {
    if (user === getUser()) { profile = result.profile; screenHeader(Boolean(session)); }
  });
  profileRequest = request;
  if (dialog.open && viewDialog === 'Perfil de treinador') showProfile();
  request.catch(() => {}).finally(() => { if (profileRequest === request) profileRequest = null; });
});
const invitation = new URLSearchParams(location.search).get('sala')?.toUpperCase();
if (!soloPreview && /^[2-9A-HJ-NP-Z]{6}$/.test(invitation ?? '')) {
  if (savedGame()?.code === invitation) resume();
  else setup('join', invitation);
}
setInterval(updateClock, 120);
setInterval(synchronize, 800);
