import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile, readdir, stat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SOUND_FILES } from '../audio.mjs';

test('static deployment includes local page/module dependencies and audio, without a server or private project files', async () => {
  const root = fileURLToPath(new URL('../', import.meta.url));
  const result = spawnSync(process.execPath, ['scripts/build-static.mjs'], { cwd: root, encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  const output = resolve(root, 'dist');
  const files = await readdir(output, { recursive: true });
  assert.ok(files.includes('index.html'));
  assert.ok(!files.some(file => /server\.mjs|\.test\.mjs|PROJECT_HANDOFF|\.git|package\.json/.test(file)));
  for (const file of files.filter(file => /\.(html|mjs|js)$/.test(file))) {
    const source = await readFile(resolve(output, file), 'utf8');
    const references = file.endsWith('.html') ? [...source.matchAll(/(?:src|href)=["'](\.\/?[^"']+)["']/g)]
      : [...source.matchAll(/(?:from\s*|import\s*)["'](\.[^"']+)["']/g)];
    for (const [, reference] of references) {
      const target = reference.endsWith('/') ? `${reference}index.html` : reference;
      assert.ok((await stat(resolve(output, dirname(file), target))).isFile(), `${file} needs ${reference}`);
    }
  }
  for (const file of [...SOUND_FILES, 'vendor/three/LICENSE', 'assets/concepts/hollow-warden-v1.png', 'assets/concepts/protagonist-v1.png']) {
    assert.ok((await stat(resolve(output, file))).size > 0, file);
  }
  const config = JSON.parse(await readFile(resolve(root, 'vercel.json'), 'utf8'));
  assert.equal(config.framework, null);
  assert.equal(config.outputDirectory, 'dist');
});
