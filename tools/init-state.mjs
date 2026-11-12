// Создаёт data/kdf.json (соль) и пустой data/state.enc.
// Запуск: node tools/init-state.mjs          — если данных ещё нет
//         node tools/init-state.mjs --force  — начать заново (после смены фразы-пароля)
import { existsSync } from 'node:fs';
import { rm, writeFile, mkdir } from 'node:fs/promises';
import { p, crypto as C, readPassphrase, writeBin, args } from './lib.mjs';

const a = args();
const kdfFile = p('data', 'kdf.json');

if (existsSync(kdfFile) && !a.force) {
  console.log('data/kdf.json уже есть — ничего не трогаю. Чтобы начать заново: node tools/init-state.mjs --force');
  process.exit(0);
}

const pass = await readPassphrase();
if (pass.trim().split(/\s+/).length < 3) {
  console.warn('⚠ Фраза-пароль короче трёх слов. Лучше 4+ слова и точно не дата.');
}

if (a.force) {
  await rm(p('data'), { recursive: true, force: true });
  console.log('Старые данные удалены.');
}
await mkdir(p('data', 'media'), { recursive: true });

const kdf = { v: 1, salt: C.b64(C.randomBytes(16)), iterations: 600000, weekIterations: 300000 };
await writeFile(kdfFile, JSON.stringify(kdf, null, 2) + '\n');

const raw = await C.deriveMainKeyRaw(pass, kdf);
const key = await C.importAesKey(raw);
const state = {
  rev: 1, teasers: [], results: [], ledger: [], coupons: [], codes: [],
  mascot: null, champion: null,
};
await writeBin(p('data', 'state.enc'), await C.encryptJSON(key, state));

console.log('✔ Готово: data/kdf.json и data/state.enc. Теперь: node tools/encrypt-content.mjs');
