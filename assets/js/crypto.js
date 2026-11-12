// Шифрование: общее для сайта, админки и node-скриптов.
// Формат файла: [1 байт версии = 1][12 байт IV][ciphertext + GCM tag]

const enc = new TextEncoder();
const dec = new TextDecoder();
const subtle = () => globalThis.crypto.subtle;

export const VERSION = 1;

export function normalize(s) {
  return String(s).normalize('NFC').trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
}

export function b64(bytes) {
  const a = new Uint8Array(bytes);
  let s = '';
  for (let i = 0; i < a.length; i += 0x8000) s += String.fromCharCode.apply(null, a.subarray(i, i + 0x8000));
  return btoa(s);
}

export function unb64(str) {
  const s = atob(str);
  const a = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i);
  return a;
}

export function randomBytes(n) {
  return globalThis.crypto.getRandomValues(new Uint8Array(n));
}

export function randomId(n = 8) {
  return Array.from(randomBytes(n), (b) => b.toString(16).padStart(2, '0')).join('').slice(0, n * 2);
}

async function pbkdf2(secret, salt, iterations) {
  const base = await subtle().importKey('raw', enc.encode(secret), 'PBKDF2', false, ['deriveBits']);
  const bits = await subtle().deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base, 256);
  return new Uint8Array(bits);
}

/** Основной ключ (сырые 32 байта) из фразы-пароля. */
export function deriveMainKeyRaw(passphrase, kdf) {
  return pbkdf2(normalize(passphrase), unb64(kdf.salt), kdf.iterations);
}

/** Ключ недели (сырые 32 байта): основной ключ + id недели + кодовое слово. */
export function deriveWeekKeyRaw(mainKeyRaw, weekId, code, kdf) {
  const secret = b64(mainKeyRaw) + '\u0000' + weekId + '\u0000' + normalize(code);
  return pbkdf2(secret, unb64(kdf.salt), kdf.weekIterations || 300000);
}

export function importAesKey(raw) {
  return subtle().importKey('raw', raw, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}

export async function encryptBytes(key, data) {
  const iv = randomBytes(12);
  const ct = new Uint8Array(await subtle().encrypt({ name: 'AES-GCM', iv }, key, data));
  const out = new Uint8Array(1 + 12 + ct.length);
  out[0] = VERSION;
  out.set(iv, 1);
  out.set(ct, 13);
  return out;
}

export async function decryptBytes(key, buf) {
  const a = new Uint8Array(buf);
  if (a[0] !== VERSION) throw new Error('Неизвестная версия файла');
  const pt = await subtle().decrypt({ name: 'AES-GCM', iv: a.subarray(1, 13) }, key, a.subarray(13));
  return new Uint8Array(pt);
}

export function encryptJSON(key, obj) {
  return encryptBytes(key, enc.encode(JSON.stringify(obj)));
}

export async function decryptJSON(key, buf) {
  return JSON.parse(dec.decode(await decryptBytes(key, buf)));
}

// ───────── Запечатанные шары и подарки ─────────
// Содержимое шара шифруется ключом SHA-256(основной ключ ‖ ключ выпуска ‖ id).
// Ключ выпуска (32 случайных байта) лежит в data/seals.json, зашифрованный
// открытым RSA-ключом. Закрытый ключ есть только в секретах GitHub: в нужный
// момент GitHub Actions расшифровывает ключ выпуска и выкладывает в data/keys.json.
// Значит, до даты содержимое не прочитать даже с фразой.

const RSA = { name: 'RSA-OAEP', hash: 'SHA-256' };

export async function sealedKey(mainKeyRaw, releaseRaw, id) {
  const idBytes = enc.encode(id);
  const all = new Uint8Array(mainKeyRaw.length + releaseRaw.length + idBytes.length);
  all.set(mainKeyRaw, 0); all.set(releaseRaw, mainKeyRaw.length); all.set(idBytes, mainKeyRaw.length + releaseRaw.length);
  const raw = new Uint8Array(await subtle().digest('SHA-256', all));
  return importAesKey(raw);
}

export function importSealPublic(jwk) {
  return subtle().importKey('jwk', jwk, RSA, false, ['encrypt']);
}

export function importSealPrivate(jwk) {
  return subtle().importKey('jwk', jwk, RSA, false, ['decrypt']);
}

/** Шифрует ключ выпуска открытым ключом. Возвращает base64. */
export async function seal(pubKey, releaseRaw) {
  return b64(new Uint8Array(await subtle().encrypt({ name: 'RSA-OAEP' }, pubKey, releaseRaw)));
}

export async function unseal(privKey, sealedB64) {
  return new Uint8Array(await subtle().decrypt({ name: 'RSA-OAEP' }, privKey, unb64(sealedB64)));
}

export async function generateSealPair() {
  const pair = await subtle().generateKey({ ...RSA, modulusLength: 3072, publicExponent: new Uint8Array([1, 0, 1]) }, true, ['encrypt', 'decrypt']);
  return { publicJwk: await subtle().exportKey('jwk', pair.publicKey), privateJwk: await subtle().exportKey('jwk', pair.privateKey) };
}
