import { dex, effectiveness, types } from './pokemon.mjs';

export const TEAM_SIZE = 3;
export const AUCTION_TIME = 10_000;
export const TURN_TIME = 18_000;
export const MAX_PLAYERS = 8;
const BOT_NAMES = ['Misty', 'Brock', 'Sabrina', 'Lt. Surge', 'Erika', 'Blaine', 'Koga'];

function shuffle(list) {
  const result = [...list];
  for (let i = result.length - 1; i > 0; i--) {
    const other = Math.floor(Math.random() * (i + 1));
    [result[i], result[other]] = [result[other], result[i]];
  }
  return result;
}

export function createPlayer(id, name, bot = false) {
  return { id, name, bot, coins: 100, team: [] };
}

export function createGame(host) {
  return { host: host.id, players: [host], phase: 'lobby', log: [] };
}

export const maxBid = player => player.team.length < TEAM_SIZE
  ? player.coins - (TEAM_SIZE - player.team.length - 1) : 0;

function addLog(game, line) {
  game.log = [line, ...game.log].slice(0, 8);
}

export function addBot(game) {
  if (game.players.length >= MAX_PLAYERS) return 'A sala está cheia.';
  const index = game.players.filter(player => player.bot).length;
  game.players.push(createPlayer(`bot-${index}`, BOT_NAMES[index], true));
}

export function startGame(game, now) {
  if (game.players.length < 2) return 'Convide outro treinador ou adicione um bot.';
  const anchor = shuffle([3, 6, 9, 25, 94, 149])[0];
  const deck = [anchor, ...shuffle(Object.keys(dex).map(Number).filter(id => id !== anchor))];
  game.phase = 'auction';
  game.auction = { deck, index: -1, passed: [] };
  nextLot(game, now);
}

function nextLot(game, now) {
  const lot = game.auction;
  if (game.players.every(player => player.team.length === TEAM_SIZE)) {
    startTournament(game, now);
    return;
  }
  lot.index++;
  lot.id = lot.deck[lot.index];
  if (!lot.id) {
    for (const player of game.players) {
      while (player.team.length < TEAM_SIZE) {
        player.team.push({ id: lot.passed.shift(), price: 1 });
        player.coins--;
      }
    }
    addLog(game, 'Os times foram completados com os lotes restantes por ₽1 cada.');
    startTournament(game, now);
    return;
  }
  const available = Math.max(...game.players.map(maxBid));
  lot.opening = Math.min(available, dex[lot.id].opening);
  lot.amount = lot.opening - 1;
  lot.bidder = null;
  lot.closing = false;
  lot.deadline = now + AUCTION_TIME;
  lot.botAt = now + 1600 + Math.random() * 2300;
  lot.botBids = 0;
}

function makeBid(game, player, amount, now) {
  const lot = game.auction;
  lot.amount = amount;
  lot.bidder = player.id;
  lot.deadline = now + AUCTION_TIME;
  lot.botAt = now + 2400 + Math.random() * 2500;
  addLog(game, `${player.name} deu ₽${amount} em ${dex[lot.id].name}.`);
}

function botBid(game, now) {
  const lot = game.auction;
  lot.botAt = null;
  const price = lot.amount + 1;
  const pokemon = dex[lot.id];
  const candidates = shuffle(game.players.filter(player => {
    if (!player.bot || lot.bidder === player.id || price > maxBid(player)) return false;
    const needsType = !player.team.some(card => dex[card.id].types.includes(pokemon.types[0]));
    const ceiling = pokemon.power * .39 + (needsType ? 5 : 0) + Math.random() * 9 - 6;
    return price <= ceiling && Math.random() < (lot.bidder ? .64 : .86);
  }));
  if (!candidates.length || lot.botBids >= 3) return;
  const bot = candidates[0];
  makeBid(game, bot, Math.min(maxBid(bot), price + Math.floor(Math.random() * 3)), now);
  lot.botBids++;
}

function closeLot(game, now) {
  const lot = game.auction;
  const winner = game.players.find(player => player.id === lot.bidder);
  if (winner) {
    winner.coins -= lot.amount;
    winner.team.push({ id: lot.id, price: lot.amount });
    addLog(game, `${dex[lot.id].name} foi para ${winner.name} por ₽${lot.amount}.`);
  } else {
    lot.passed.push(lot.id);
    addLog(game, `${dex[lot.id].name} saiu sem lances.`);
  }
  lot.closing = true;
  lot.deadline = now + 2200;
  lot.botAt = null;
}

const health = id => Math.round(58 + dex[id].power * .59);
const roundNames = { 8: 'Quartas de final', 4: 'Semifinal', 2: 'Final' };

function startTournament(game, now) {
  game.phase = 'battle';
  const ids = shuffle(game.players.map(player => player.id));
  const size = 2 ** Math.ceil(Math.log2(ids.length));
  game.tournament = { rounds: [], size };
  seedRound(game.tournament, ids);
  game.log = [];
  nextMatch(game, now);
}

function seedRound(tournament, ids) {
  const count = tournament.size / 2;
  // Pair the top half with the remainder so a bye is always paired with a player.
  const matches = Array.from({ length: count }, (_, index) => ({
    players: [ids[index], ids[index + count] ?? null], winner: null,
  }));
  tournament.rounds.push({ name: roundNames[tournament.size], matches });
}

function nextMatch(game, now) {
  const tournament = game.tournament;
  while (true) {
    const round = tournament.rounds.at(-1);
    const index = round.matches.findIndex(match => !match.winner);
    if (index === -1) {
      const winners = round.matches.map(match => match.winner);
      if (winners.length === 1) {
        game.phase = 'finished';
        game.champion = winners[0];
        return;
      }
      tournament.size /= 2;
      seedRound(tournament, winners);
      continue;
    }
    const match = round.matches[index];
    if (!match.players[1]) {
      match.winner = match.players[0];
      continue;
    }
    const teams = match.players.map(id => game.players.find(player => player.id === id));
    game.battle = {
      index, players: match.players, turn: 1, active: [0, 0], choices: [null, null], played: [false, false],
      hp: teams.map(player => player.team.map(card => health(card.id))),
      deadline: now + TURN_TIME, winner: null,
    };
    addLog(game, `${teams[0].name} enfrenta ${teams[1].name}.`);
    if (!teams.every(player => player.bot)) return;
    while (!game.battle.winner) battleTurn(game, now);
  }
}

function pokemonAt(game, side, slot = game.battle.active[side]) {
  const player = game.players.find(player => player.id === game.battle.players[side]);
  return dex[player.team[slot].id];
}

function attackFactor(action, attacker, target) {
  if (action === 'attack') return effectiveness('normal', target);
  return effectiveness(attacker.types[Number(action.at(-1))], target);
}

function autoMove(game, side) {
  const attacker = pokemonAt(game, side);
  const target = pokemonAt(game, 1 - side);
  const options = ['attack', ...attacker.types.map((_, index) => `type${index}`)];
  return options.reduce((best, move) => attackFactor(move, attacker, target) * (move === 'attack' ? 1 : 1.2) >
    attackFactor(best, attacker, target) * (best === 'attack' ? 1 : 1.2) ? move : best);
}

function battleTurn(game, now) {
  const battle = game.battle;
  const moves = battle.choices.map((choice, side) => choice ?? autoMove(game, side));
  for (const [side, action] of moves.entries()) {
    if (action.startsWith('switch')) {
      battle.active[side] = Number(action.at(-1));
      addLog(game, `${pokemonAt(game, side).name} entrou em campo.`);
    }
  }
  const attacks = moves.map((action, side) => {
    if (action === 'guard' || action.startsWith('switch')) return 0;
    const attacker = pokemonAt(game, side);
    const target = pokemonAt(game, 1 - side);
    const factor = attackFactor(action, attacker, target);
    const element = action === 'attack' ? '' : ` de ${types[attacker.types[Number(action.at(-1))]][0]}`;
    const damage = Math.round((13 + attacker.power * .16 + Math.random() * 5) * factor *
      (element ? 1.15 : 1) * (moves[1 - side] === 'guard' ? .36 : 1));
    const note = factor === 0 ? ' · imune' : factor > 1 ? ' · super eficaz' : factor < 1 ? ' · pouco eficaz' : '';
    addLog(game, `${attacker.name} usou ataque${element} · ${damage} de dano${note}.`);
    return damage;
  });
  for (const [side, action] of moves.entries()) {
    if (action === 'guard') addLog(game, `${pokemonAt(game, side).name} se defendeu.`);
    const slot = battle.active[side];
    battle.hp[side][slot] = Math.max(0, battle.hp[side][slot] - attacks[1 - side]);
    if (!battle.hp[side][slot]) {
      addLog(game, `${pokemonAt(game, side).name} desmaiou.`);
      battle.active[side] = battle.hp[side].findIndex(hp => hp > 0);
    }
  }
  if (battle.active.includes(-1) || battle.turn >= 24) {
    const scores = battle.hp.map(team => team.reduce((sum, hp) => sum + hp, 0));
    const side = scores[0] === scores[1] ? Math.floor(Math.random() * 2) : Number(scores[1] > scores[0]);
    battle.winner = battle.players[side];
    const match = game.tournament.rounds.at(-1).matches[battle.index];
    match.winner = battle.winner;
    match.contested = battle.played.every(Boolean);
    addLog(game, `${game.players.find(player => player.id === battle.winner).name} venceu o duelo.`);
    battle.deadline = now + 4300;
    return;
  }
  battle.turn++;
  battle.choices = [null, null];
  battle.deadline = now + TURN_TIME;
}

export function advance(game, now) {
  let changed = false;
  while (game.phase === 'auction') {
    const lot = game.auction;
    if (lot.botAt && lot.botAt <= now && lot.botAt < lot.deadline) botBid(game, lot.botAt);
    else if (lot.deadline > now) break;
    else if (lot.closing) nextLot(game, lot.deadline);
    else closeLot(game, lot.deadline);
    changed = true;
  }
  while (game.phase === 'battle' && game.battle.deadline <= now) {
    if (game.battle.winner) nextMatch(game, game.battle.deadline);
    else battleTurn(game, game.battle.deadline);
    changed = true;
  }
  return changed;
}

export function act(game, id, action, body, now) {
  const player = game.players.find(item => item.id === id);
  if (!player || player.bot) return 'Treinador inválido.';
  if (action === 'start' || action === 'bot') {
    if (game.phase !== 'lobby' || game.host !== id) return 'Apenas o anfitrião pode fazer isso na sala de espera.';
    return action === 'start' ? startGame(game, now) : addBot(game);
  }
  if (action === 'bid') {
    const lot = game.auction;
    if (game.phase !== 'auction' || lot.closing || lot.id !== body.lot) return 'Esse lote já encerrou.';
    if (lot.bidder === id) return 'Seu lance já está na frente.';
    if (!Number.isInteger(body.amount) || body.amount <= lot.amount || body.amount > maxBid(player))
      return 'O lance precisa superar o atual e caber no seu saldo disponível.';
    makeBid(game, player, body.amount, now);
    return;
  }
  if (action === 'move') {
    const battle = game.battle;
    if (game.phase !== 'battle' || battle.winner || battle.turn !== body.turn ||
        game.tournament.rounds.length !== body.round || battle.index !== body.match) return 'Esse turno já encerrou.';
    const side = battle.players.indexOf(id);
    if (side < 0 || battle.choices[side]) return 'Você já escolheu ou está assistindo a este duelo.';
    const move = body.move;
    const pokemon = pokemonAt(game, side);
    const valid = ['attack', 'guard', ...pokemon.types.map((_, index) => `type${index}`)];
    battle.hp[side].forEach((hp, index) => {
      if (hp > 0 && index !== battle.active[side]) valid.push(`switch${index}`);
    });
    if (!valid.includes(move)) return 'Movimento indisponível.';
    battle.choices[side] = move;
    battle.played[side] = true;
    const opponent = game.players.find(item => item.id === battle.players[1 - side]);
    if (opponent.bot || battle.choices.every(Boolean)) battleTurn(game, now);
    return;
  }
  return 'Ação inválida.';
}

export function snapshot(game, id) {
  const publicGame = structuredClone(game);
  if (publicGame.auction) {
    delete publicGame.auction.deck;
    delete publicGame.auction.passed;
    delete publicGame.auction.botAt;
  }
  if (publicGame.battle) {
    publicGame.battle.choices = publicGame.battle.choices.map((choice, side) =>
      publicGame.battle.players[side] === id ? choice : Boolean(choice));
  }
  return publicGame;
}
