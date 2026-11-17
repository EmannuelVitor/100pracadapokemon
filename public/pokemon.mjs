// National Pokédex number, name, types and power in this game.
const entries = [
  [3,'Venusaur','grass poison',83],[6,'Charizard','fire flying',87],[9,'Blastoise','water',85],
  [12,'Butterfree','bug flying',56],[18,'Pidgeot','normal flying',72],[25,'Pikachu','electric',59],
  [26,'Raichu','electric',73],[31,'Nidoqueen','poison ground',77],[34,'Nidoking','poison ground',78],
  [38,'Ninetales','fire',77],[45,'Vileplume','grass poison',73],[59,'Arcanine','fire',86],
  [65,'Alakazam','psychic',81],[68,'Machamp','fighting',82],[73,'Tentacruel','water poison',80],
  [76,'Golem','rock ground',77],[80,'Slowbro','water psychic',77],[82,'Magneton','electric steel',72],
  [89,'Muk','poison',76],[91,'Cloyster','water ice',79],[94,'Gengar','ghost poison',84],
  [95,'Onix','rock ground',58],[103,'Exeggutor','grass psychic',80],[105,'Marowak','ground',68],
  [112,'Rhydon','ground rock',77],[113,'Chansey','normal',67],[115,'Kangaskhan','normal',77],
  [121,'Starmie','water psychic',81],[123,'Scyther','bug flying',79],[127,'Pinsir','bug',79],
  [130,'Gyarados','water flying',87],[131,'Lapras','water ice',84],[134,'Vaporeon','water',82],
  [135,'Jolteon','electric',82],[136,'Flareon','fire',82],[142,'Aerodactyl','rock flying',82],
  [143,'Snorlax','normal',85],[144,'Articuno','ice flying',88],[145,'Zapdos','electric flying',89],
  [146,'Moltres','fire flying',88],[149,'Dragonite','dragon flying',91],[150,'Mewtwo','psychic',95],
];

export const types = {
  normal:['Normal','#bbc5d2'], fire:['Fogo','#ff9b76'], water:['Água','#73c9ff'],
  electric:['Elétrico','#fbd568'], grass:['Planta','#9fe390'], ice:['Gelo','#94eee7'],
  fighting:['Lutador','#ff9689'], poison:['Veneno','#eaa9f5'], ground:['Terra','#efc28c'],
  flying:['Voador','#c5c5ff'], psychic:['Psíquico','#ff9dca'], bug:['Inseto','#c5df81'],
  rock:['Pedra','#e0cb9a'], ghost:['Fantasma','#c4a8ff'], dragon:['Dragão','#a8b1ff'], steel:['Aço','#b5ccdf'],
};

export const dex = Object.fromEntries(entries.map(([id, name, group, power]) => [id, {
  id, name, power, types:group.split(' '), opening: Math.round((power - 45) / 3),
}]));

// Each row gives weaknesses, resistances and immunities to the attacking type.
const chart = {
  normal:['','rock steel','ghost'], fire:['grass ice bug steel','fire water rock dragon',''],
  water:['fire ground rock','water grass dragon',''], electric:['water flying','electric grass dragon','ground'],
  grass:['water ground rock','fire grass poison flying bug dragon steel',''],
  ice:['grass ground flying dragon','fire water ice steel',''],
  fighting:['normal ice rock steel','poison flying psychic bug','ghost'],
  poison:['grass','poison ground rock ghost','steel'], ground:['fire electric poison rock steel','grass bug','flying'],
  flying:['grass fighting bug','electric rock steel',''], psychic:['fighting poison','psychic steel',''],
  bug:['grass psychic','fire fighting poison flying ghost steel',''],
  rock:['fire ice flying bug','fighting ground steel',''], ghost:['psychic ghost','','normal'],
  dragon:['dragon','steel',''], steel:['ice rock','fire water electric steel',''],
};

export function effectiveness(type, target) {
  const [strong, weak, immune] = chart[type].map(row => row.split(' '));
  return target.types.reduce((factor, defense) => factor * (
    immune.includes(defense) ? 0 : strong.includes(defense) ? 2 : weak.includes(defense) ? .5 : 1
  ), 1);
}
