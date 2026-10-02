import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { networkInterfaces } from 'node:os';
import { SOUND_FILES } from './audio.mjs';

const root = dirname(fileURLToPath(import.meta.url));
const files = new Set(['index.html', 'style.css', 'app.mjs', 'combat.mjs', 'motion.mjs', 'audio.mjs', 'fighters3d.mjs', 'vendor/three/three.module.min.js', 'vendor/three/three.core.min.js', 'assets/concepts/hollow-warden-v1.png', 'assets/concepts/protagonist-v1.png', ...SOUND_FILES]);
const types = { html: 'text/html; charset=utf-8', css: 'text/css', mjs: 'text/javascript', js: 'text/javascript', png: 'image/png', wav: 'audio/wav' };
const port = Number(process.env.PORT || 4173);
http.createServer(async (req, res) => {
  const name = new URL(req.url, 'http://localhost').pathname.slice(1) || 'index.html';
  if (!files.has(name)) { res.writeHead(404); res.end('Not found'); return; }
  try {
    const data = await readFile(join(root, name));
    res.writeHead(200, { 'Content-Type': types[name.split('.').pop()], 'Cache-Control': 'no-store' });
    res.end(data);
  } catch { res.writeHead(500); res.end('Unable to load file'); }
}).listen(port, '0.0.0.0', () => {
  console.log(`AFTERIMAGE is ready: http://localhost:${port}`);
  for (const entries of Object.values(networkInterfaces())) {
    for (const entry of entries || []) {
      if (entry.family === 'IPv4' && !entry.internal) console.log(`Mobile on same Wi-Fi: http://${entry.address}:${port}`);
    }
  }
});
