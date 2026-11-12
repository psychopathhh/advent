// Локальный сервер для проверки: node tools/serve.mjs  →  http://localhost:8080
import { createServer } from 'node:http';
import { readFile, stat, writeFile, mkdir, rm } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { ROOT, crypto as C } from './lib.mjs';

const PORT = Number(process.env.PORT) || 8080;
const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2', '.png': 'image/png', '.ico': 'image/x-icon', '.webmanifest': 'application/manifest+json',
  '.txt': 'text/plain; charset=utf-8', '.enc': 'application/octet-stream', '.bin': 'application/octet-stream',
};
const BLOCK = /^[\\/](content|tools|\.env|\.git|\.claude)/;

createServer(async (req, res) => {
  // Только для локальной проверки админки: «коммит» = запись файлов в data/
  if (req.method === 'POST' && req.url === '/__dev/commit') {
    try {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const files = JSON.parse(raw);
      for (const [rel, data] of Object.entries(files)) {
        const target = join(ROOT, normalize(rel));
        if (!target.startsWith(join(ROOT, 'data'))) throw new Error('only data/');
        if (data === null) await rm(target, { force: true });
        else { await mkdir(dirname(target), { recursive: true }); await writeFile(target, Buffer.from(data, 'base64')); }
      }
      res.writeHead(200); return res.end('ok');
    } catch (e) {
      res.writeHead(400); return res.end(String(e.message));
    }
  }
  // Только для локальной проверки: «зажечь шар» = выложить его ключ в data/keys.json
  if (req.method === 'POST' && req.url === '/__dev/open') {
    try {
      let raw = '';
      for await (const chunk of req) raw += chunk;
      const { open } = JSON.parse(raw);
      const priv = await C.importSealPrivate(JSON.parse(await readFile(join(ROOT, 'content', 'release-private.json'), 'utf8')));
      const seals = JSON.parse(await readFile(join(ROOT, 'data', 'seals.json'), 'utf8'));
      const kf = join(ROOT, 'data', 'keys.json');
      let keys = {};
      try { keys = JSON.parse(await readFile(kf, 'utf8')); } catch { /* */ }
      keys[open] = C.b64(await C.unseal(priv, seals[open].sealed));
      await writeFile(kf, JSON.stringify(keys, null, 2) + '\n');
      res.writeHead(200); return res.end('ok');
    } catch (e) { res.writeHead(400); return res.end(String(e.message)); }
  }
  try {
    let path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (path.endsWith('/')) path += 'index.html';
    const rel = normalize(path);
    if (BLOCK.test(rel)) { res.writeHead(403); return res.end('403'); }
    const file = join(ROOT, rel);
    if (!file.startsWith(ROOT) || !(await stat(file)).isFile()) throw 0;
    const body = await readFile(file);
    res.writeHead(200, { 'Content-Type': TYPES[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(req.method === 'HEAD' ? undefined : body);
  } catch {
    res.writeHead(404); res.end('404');
  }
}).listen(PORT, () => console.log(`Сайт: http://localhost:${PORT}/`));
