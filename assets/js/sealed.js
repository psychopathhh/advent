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
    // Скрытая миссия: свой ключ, открывается кнопкой «Открыть миссию» в админке
    let mission = null;
    if (n.missionSealed) {
      n.missionOpen = false;
      const mid = n.id + 'm';
      const mr = released[mid];
      if (mr) {
        const mk = `${mid}:${n.missionVer}:${mr}`;
        mission = cache.get(mk) || null;
        if (!mission) {
          try {
            mission = await C.decryptJSON(await C.sealedKey(mainRaw, C.unb64(mr), mid), await fetchBin(`./data/nodes/${mid}.enc`));
            cache.set(mk, mission);
          } catch (e) { console.error('Миссия не открылась', mid, e); }
        }
        n.missionOpen = !!mission;
      }
    }
    // Скрытые мини-квесты: свой ключ <id>q, кнопка «Открыть квесты» в админке
    let hiddenQuests = null;
    if (n.questSealed) {
      n.questsOpen = false;
      const qid = n.id + 'q';
      const qr = released[qid];
      if (qr) {
        const qk = `${qid}:${n.questVer}:${qr}`;
        hiddenQuests = cache.get(qk) || null;
        if (!hiddenQuests) {
          try {
            hiddenQuests = await C.decryptJSON(await C.sealedKey(mainRaw, C.unb64(qr), qid), await fetchBin(`./data/nodes/${qid}.enc`));
            cache.set(qk, hiddenQuests);
          } catch (e) { console.error('Квесты не открылись', qid, e); }
        }
        n.questsOpen = !!hiddenQuests;
      }
    }
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
    if (mission) n.mission = mission.mission;
    if (n.quest && !n.quests) n.quests = [n.quest];
    if (hiddenQuests && n.quests) {
      let i = 0;
      n.quests = n.quests.map((q) => (q.secret ? hiddenQuests.quests[i++] || q : q));
    }
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

/** Шар открыт: запечатанный — когда кошка его открыла (ключ выложен), обычный — по дате. */
export const isOpen = (n, t) => (n.sealed ? n.ready === true : t >= new Date(n.opensAt));
