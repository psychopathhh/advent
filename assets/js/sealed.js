// Открытие запечатанных шаров: общий код для сайта и админки.
import * as C from './crypto.js';

export const nodesOf = (c) => [...(c.weeks || []), c.finale, c.newYearLetter].filter(Boolean);

export async function fetchReleased() {
  try {
    const r = await fetch('./data/keys.json?ts=' + Date.now(), { cache: 'no-store' });
    return r.ok ? await r.json() : {};
  } catch { return {}; }
}

/**
 * Дописывает в content содержимое шаров, ключи которых уже выложены.
 * Каждый запечатанный шар получает ready: true/false.
 */
export async function unsealContent(c, mainRaw, released, fetchBin, cache = new Map()) {
  await Promise.all(nodesOf(c).filter((n) => n.sealed).map(async (n) => {
    n.ready = false;
    const r = released[n.id];
    if (!r) return;
    const ck = `${n.id}:${n.sealVer}:${r}`;
    let data = cache.get(ck);
    if (!data) {
      try {
        const key = await C.sealedKey(mainRaw, C.unb64(r), n.id);
        data = await C.decryptJSON(key, await fetchBin(`./data/nodes/${n.id}.enc`));
        cache.set(ck, data);
      } catch (e) { console.error('Шар не открылся', n.id, e); return; }
    }
    Object.assign(n, data);
    n.ready = true;
  }));
  // названия образов лежат внутри шаров
  for (const l of c.looks || []) {
    const n = nodesOf(c).find((x) => x.lookId === l.id && x.lookName);
    if (n) l.name = n.lookName;
  }
  return c;
}

/** Шар можно показывать: время пришло и (если запечатан) ключ выложен. */
export const isReady = (n) => !n.sealed || n.ready === true;
