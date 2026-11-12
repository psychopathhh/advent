// Общие помощники для node-скриптов. Без npm-зависимостей.
import { webcrypto } from 'node:crypto';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

if (!globalThis.crypto) globalThis.crypto = webcrypto;

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const p = (...parts) => join(ROOT, ...parts);

const C = await import('../assets/js/crypto.js');
export const crypto = C;

export async function readPassphrase() {
  if (process.env.ADVENT_PASSPHRASE) return process.env.ADVENT_PASSPHRASE;
  const envFile = p('.env.local');
  if (existsSync(envFile)) {
    const text = await readFile(envFile, 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const m = line.match(/^\s*ADVENT_PASSPHRASE\s*=\s*(.*)\s*$/);
      if (m) return m[1].replace(/^["']|["']$/g, '');
    }
  }
  fail('Не найдена фраза-пароль. Создай файл .env.local со строкой:\n  ADVENT_PASSPHRASE=твоя фраза из нескольких слов');
}

export async function readKdf() {
  const f = p('data', 'kdf.json');
  if (!existsSync(f)) fail('Нет data/kdf.json. Сначала запусти: node tools/init-state.mjs');
  return JSON.parse(await readFile(f, 'utf8'));
}

export async function mainKey() {
  const kdf = await readKdf();
  const raw = await C.deriveMainKeyRaw(await readPassphrase(), kdf);
  return { kdf, raw, key: await C.importAesKey(raw) };
}

export async function readState(key) {
  const f = p('data', 'state.enc');
  if (!existsSync(f)) fail('Нет data/state.enc. Сначала запусти: node tools/init-state.mjs');
  try {
    return await C.decryptJSON(key, await readFile(f));
  } catch {
    fail('Не получилось расшифровать data/state.enc — фраза в .env.local не та, с которой создавались данные.\nЕсли ты сменила фразу: node tools/init-state.mjs --force (старые фото придётся добавить заново).');
  }
}

export async function writeState(key, state) {
  state.rev = (state.rev || 0) + 1;
  await writeBin(p('data', 'state.enc'), await C.encryptJSON(key, state));
}

export async function writeBin(file, bytes) {
  await mkdir(dirname(file), { recursive: true });
  await writeFile(file, bytes);
}

export function fail(msg) {
  console.error('\n✖ ' + msg + '\n');
  process.exit(1);
}

export function args() {
  const out = { _: [] };
  const a = process.argv.slice(2);
  for (let i = 0; i < a.length; i++) {
    if (a[i].startsWith('--')) {
      const k = a[i].slice(2);
      const v = a[i + 1] && !a[i + 1].startsWith('--') ? a[++i] : true;
      out[k] = v;
    } else out._.push(a[i]);
  }
  return out;
}
