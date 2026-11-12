// ТОЛЬКО ДЛЯ ЛОКАЛЬНОЙ ПРОВЕРКИ НА ТЕСТОВЫХ ДАННЫХ: открывает все шары и подарки
// (пишет все ключи в data/keys.json). Никогда не коммить data/keys.json после этого!
import { readFile, writeFile } from 'node:fs/promises';
import { webcrypto } from 'node:crypto';
if (!globalThis.crypto) globalThis.crypto = webcrypto;
const C = await import('../assets/js/crypto.js');

const root = new URL('..', import.meta.url);
const priv = await C.importSealPrivate(JSON.parse(await readFile(new URL('content/release-private.json', root), 'utf8')));
const seals = JSON.parse(await readFile(new URL('data/seals.json', root), 'utf8'));
const keys = {};
for (const [id, s] of Object.entries(seals)) keys[id] = C.b64(await C.unseal(priv, s.sealed));
await writeFile(new URL('data/keys.json', root), JSON.stringify(keys, null, 2) + '\n');
console.log('⚠ Все шары открыты локально:', Object.keys(keys).join(', '), '\n  НЕ коммить data/keys.json!');
