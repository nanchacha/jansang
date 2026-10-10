import { cp, mkdir, rm } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOUND_FILES } from '../audio.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const output = resolve(root, 'dist');
if (dirname(output) !== resolve(root)) throw new Error('Build output must stay inside the project');
await rm(output, { recursive: true, force: true });
const files = [
  'index.html', 'style.css', 'app.mjs', 'combat.mjs', 'expedition.mjs',
  'motion.mjs', 'audio.mjs', 'fighters3d.mjs', 'cards.mjs',
  'vendor/three/three.module.min.js', 'vendor/three/three.core.min.js',
  'vendor/three/LICENSE',
  'assets/concepts/hollow-warden-v1.png', 'assets/concepts/protagonist-v1.png',
  'assets/concepts/title-pilgrimage-v1.png',
  'assets/ui/status-items-v1.png',
  ...SOUND_FILES,
];
for (const file of files) {
  const destination = resolve(output, file);
  await mkdir(dirname(destination), { recursive: true });
  await cp(resolve(root, file), destination);
}
console.log(`Static build: ${files.length} game files → dist/`);
