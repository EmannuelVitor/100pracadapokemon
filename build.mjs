import { copyFile, mkdir } from 'node:fs/promises';

// Upload the same rules of play that power browser-only matches.
await mkdir('functions/shared/public', { recursive: true });
for (const file of ['api.mjs', 'public/game.mjs', 'public/pokemon.mjs', 'public/avatars.mjs']) {
  await copyFile(file, `functions/shared/${file}`);
}
