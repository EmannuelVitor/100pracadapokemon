export function tournamentScores(game, accounts) {
  const records = new Map();
  const contenders = new Set();
  const getRecord = uid => {
    if (!records.has(uid)) records.set(uid, { score: 0, wins: 0, titles: 0 });
    return records.get(uid);
  };
  for (const { matches } of game.tournament.rounds) {
    for (const match of matches) {
      const [first, second] = match.players.map(id => accounts[id]);
      if (!match.contested || !first || !second || first === second) continue;
      contenders.add(first);
      contenders.add(second);
      const winner = getRecord(accounts[match.winner]);
      getRecord(accounts[match.players.find(id => id !== match.winner)]);
      winner.wins++;
      winner.score++;
    }
  }
  const champion = accounts[game.champion];
  if (contenders.has(champion)) {
    const winner = getRecord(champion);
    winner.titles++;
    winner.score += 3;
  }
  return records;
}
