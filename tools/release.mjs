// Запускается GitHub Actions по расписанию: выкладывает ключи шаров и подарков,
// у которых наступило время открытия. Ждёт до точной минуты, если до неё < LOOKAHEAD.
//   RELEASE_KEY — закрытый ключ (секрет репозитория)
//   Локально для теста: RELEASE_KEY="$(cat content/release-private.json)" node tools/release.mjs --dry
import { readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { webcrypto } from 'node:crypto';
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const C = await import('../assets/js/crypto.js');

const ROOT = new URL('..', import.meta.url);
const file = (rel) => new URL(rel, ROOT);
const LOOKAHEAD = Number(process.env.LOOKAHEAD_MIN || 25) * 60 * 1000;
const DRY = process.argv.includes('--dry');
const git = (...a) => execFileSync('git', a, { cwd: ROOT, stdio: ['ignore', 'pipe', 'inherit'] }).toString().trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const readJSON = async (rel) => (existsSync(file(rel)) ? JSON.parse(await readFile(file(rel), 'utf8')) : {});

if (!process.env.RELEASE_KEY) { console.error('Нет секрета RELEASE_KEY'); process.exit(1); }
const priv = await C.importSealPrivate(JSON.parse(process.env.RELEASE_KEY));

async function pending(limit) {
  const seals = await readJSON('data/seals.json');
  const keys = await readJSON('data/keys.json');
  const list = [];
  for (const [id, s] of Object.entries(seals)) {
    const at = new Date(s.at).getTime();
    if (at > limit) continue;
    const r = C.b64(await C.unseal(priv, s.sealed));
    if (keys[id] !== r) list.push({ id, at, r });
  }
  return list.sort((a, b) => a.at - b.at);
}

async function publish(items) {
  for (let attempt = 1; attempt <= 5; attempt++) {
    if (!DRY) git('pull', '--rebase', '-q');
    const keys = await readJSON('data/keys.json');
    for (const it of items) keys[it.id] = it.r;
    await writeFile(file('data/keys.json'), JSON.stringify(keys, null, 2) + '\n');
    if (DRY) { console.log('[dry] выложила бы:', items.map((i) => i.id).join(', ')); return; }
    git('add', 'data/keys.json');
    try { git('commit', '-q', '-m', `Открыто: ${items.map((i) => i.id).join(', ')}`); } catch { return; /* уже выложено */ }
    try { git('push', '-q'); console.log('✔ Выложено:', items.map((i) => i.id).join(', ')); break; } catch {
      console.log('push не прошёл, пробую ещё раз'); git('reset', '-q', '--hard', 'HEAD~1'); await sleep(3000 * attempt);
    }
  }
  // Просим GitHub Pages пересобрать сайт сразу
  if (process.env.GH_TOKEN && process.env.REPO) {
    const r = await fetch(`https://api.github.com/repos/${process.env.REPO}/pages/builds`, {
      method: 'POST', headers: { Authorization: `Bearer ${process.env.GH_TOKEN}`, Accept: 'application/vnd.github+json' },
    }).catch((e) => ({ status: String(e) }));
    console.log('Сборка Pages:', r.status);
  }
}

// Открыть указанное сразу, без оглядки на дату
const OPEN = String(process.env.OPEN || '').split(/[\s,]+/).filter(Boolean);
if (OPEN.length) {
  const seals = await readJSON('data/seals.json');
  const items = [];
  for (const id of OPEN) {
    if (!seals[id]) { console.log('Нет такого:', id); continue; }
    items.push({ id, at: Date.now(), r: C.b64(await C.unseal(priv, seals[id].sealed)) });
  }
  if (items.length) await publish(items);
  process.exit(0);
}

const due = await pending(Date.now() + LOOKAHEAD);
if (!due.length) { console.log('Открывать пока нечего.'); process.exit(0); }
// группируем по времени открытия
const groups = [];
for (const it of due) {
  const g = groups.find((x) => Math.abs(x.at - it.at) < 60 * 1000);
  if (g) g.items.push(it); else groups.push({ at: it.at, items: [it] });
}
for (const g of groups) {
  const wait = g.at - Date.now();
  if (wait > 0) {
    console.log(`Жду ${Math.round(wait / 1000)} с до ${new Date(g.at).toISOString()} (${g.items.map((i) => i.id).join(', ')})`);
    if (!DRY) await sleep(wait - 45 * 1000 > 0 ? wait - 45 * 1000 : 0); // ~45 с форы на сборку сайта
  }
  await publish(g.items);
}
