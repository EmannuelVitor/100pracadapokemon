import { dex } from './pokemon.mjs';

export const trainers = ['red', 'blue', 'misty', 'brock', 'sabrina', 'erika', 'lance'];
export const defaultAvatar = 'pokemon:25';

export function avatarInfo(value) {
  if (typeof value !== 'string') return null;
  const [group, id, extra] = value.split(':');
  if (extra !== undefined) return null;
  if (group === 'trainer' && trainers.includes(id)) {
    return { name: id[0].toUpperCase() + id.slice(1), url: `/trainers/${id}.png`, group };
  }
  if (group === 'pokemon' && /^\d+$/.test(id) && Object.hasOwn(dex, id)) {
    return { name: dex[id].name, url: `/pokemon/${id}.webp`, group };
  }
  return null;
}
