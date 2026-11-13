// Загрузка и расшифровка данных сайта.
import * as C from './crypto.js';
import { fetchReleased, unsealContent } from './sealed.js';

const KEY_STORE = 'advent.key';
let kdf = null;
let mainRaw = null;
let mainKey = null;
const mediaCache = new Map();
const nodeCache = new Map();
let released = {};

/** Подарок можно показывать: не запечатан или ключ уже выложен. */
export const teaserReady = (t) => !t.sealed || !!released[t.id];

/** Когда шар зажгли (ISO-строка) или null, если время не записано. */
export const releasedAt = (id) => released._at?.[id] || null;

async function openContent(content) {
  released = await fetchReleased();
  return unsealContent(content, mainRaw, released, fetchBin, nodeCache);
}

export const store = {
  get(k, def = null) { try { const v = localStorage.getItem(k); return v === null ? def : JSON.parse(v); } catch { return def; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* приватный режим */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* */ } },
};

async function fetchBin(path) {
  const res = await fetch(path + (path.includes('?') ? '&' : '?') + 'ts=' + Date.now(), { cache: 'no-store' });
  if (!res.ok) throw new Error(`${path}: ${res.status}`);
  return new Uint8Array(await res.arrayBuffer());
}

async function loadKdf() {
  if (kdf) return kdf;
  const res = await fetch('./data/kdf.json?ts=' + Date.now(), { cache: 'no-store' });
  if (!res.ok) throw new Error('Нет data/kdf.json');
  kdf = await res.json();
  return kdf;
}

/** Пробует войти по сохранённому ключу. Возвращает content или null. */
export async function restoreSession() {
  const saved = store.get(KEY_STORE);
  if (!saved) return null;
  try {
    await loadKdf();
    mainRaw = C.unb64(saved);
    mainKey = await C.importAesKey(mainRaw);
    return await loadContent();
  } catch {
    store.del(KEY_STORE);
    mainKey = null;
    return null;
  }
}

/** Вход по фразе. Бросает ошибку 'wrong', если фраза неверная. */
export async function login(passphrase, remember) {
  await loadKdf();
  const raw = await C.deriveMainKeyRaw(passphrase, kdf);
  const key = await C.importAesKey(raw);
  const buf = await fetchBin('./data/content.enc');
  let content;
  try { content = await C.decryptJSON(key, buf); } catch { throw new Error('wrong'); }
  mainRaw = raw; mainKey = key;
  if (remember) store.set(KEY_STORE, C.b64(raw)); else store.del(KEY_STORE);
  return openContent(content);
}

export function logout() {
  store.del(KEY_STORE);
  mainKey = null; mainRaw = null;
}

export async function loadContent() {
  return openContent(await C.decryptJSON(mainKey, await fetchBin('./data/content.enc')));
}

export async function loadState() {
  try {
    return await C.decryptJSON(mainKey, await fetchBin('./data/state.enc'));
  } catch {
    return { teasers: [], results: [], ledger: [], coupons: [], codes: [], mascot: null, champion: null };
  }
}

// ───────── Кодовые слова ─────────
const CODES = 'advent.codes';
const BONUS = 'advent.bonus';
const weekKeys = new Map();

export const unlockedCodes = () => store.get(CODES, {});
export const unlockedBonuses = () => store.get(BONUS, {});

async function weekKeyFor(weekId, code) {
  const k = weekId + '\u0000' + C.normalize(code);
  if (!weekKeys.has(k)) weekKeys.set(k, C.deriveWeekKeyRaw(mainRaw, weekId, code, await loadKdf()).then(C.importAesKey));
  return weekKeys.get(k);
}

/** Проверяет кодовое слово. Возвращает бонус или бросает Error('wrong'). */
export async function unlockCode(weekId, code) {
  const key = await weekKeyFor(weekId, code);
  let bonus;
  try { bonus = await C.decryptJSON(key, await fetchBin(`./data/bonus/${weekId}.enc`)); } catch (e) {
    if (String(e.message).includes(': 404')) throw new Error('nocode');
    throw new Error('wrong');
  }
  store.set(CODES, { ...unlockedCodes(), [weekId]: code });
  store.set(BONUS, { ...unlockedBonuses(), [weekId]: { text: bonus.text, reward: Number(bonus.reward) || 0 } });
  return bonus;
}

/** Чёткое фото «силуэта» по сохранённому коду недели. */
export async function loadFullMedia(teaser) {
  const code = unlockedCodes()[teaser.weekId];
  if (!code) return null;
  const key = await weekKeyFor(teaser.weekId, code);
  const bytes = await C.decryptBytes(key, await fetchBin(`./data/media/${teaser.media}.full.bin`));
  return bytesToImage(bytes, teaser.mime);
}

async function bytesToImage(bytes, mime = 'image/jpeg') {
  const blob = new Blob([bytes], { type: mime });
  if ('createImageBitmap' in window) {
    try { return await createImageBitmap(blob); } catch { /* fallback */ }
  }
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.src = url;
  await img.decode();
  return img;
}

/** Расшифровывает фото подарка (ImageBitmap/HTMLImageElement). */
export async function loadMedia(teaser) {
  const mediaId = teaser.media;
  if (mediaCache.has(mediaId)) return mediaCache.get(mediaId);
  const p = (async () => {
    let key = mainKey;
    if (teaser.sealed) {
      if (!released[teaser.id]) released = await fetchReleased();
      const r = released[teaser.id];
      if (!r) throw new Error('Подарок ещё запечатан');
      key = await C.sealedKey(mainRaw, C.unb64(r), teaser.id);
    }
    const bytes = await C.decryptBytes(key, await fetchBin(`./data/media/${mediaId}.bin`));
    return bytesToImage(bytes, teaser.mime);
  })();
  mediaCache.set(mediaId, p);
  p.catch(() => mediaCache.delete(mediaId));
  return p;
}
