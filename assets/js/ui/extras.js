// Этап 2: Кошкина лавка, Гардероб, ачивки.
import { h, toast } from './dom.js';
import { formatDate } from '../time.js';
import { drawOriented, orientedSize } from './scratch.js';
import { loadMedia, loadFullMedia, unlockedCodes, unlockedBonuses, store, teaserReady, releasedAt } from '../data.js';
import { fill } from './views.js';

const closeBtn = (onClose) => h('button', { class: 'close-btn', 'aria-label': 'Закрыть', onclick: onClose }, '×');
const allNodes = (c) => [...c.weeks, c.finale].filter(Boolean);

// ───────── Покупки (локально) ─────────
const BOUGHT = 'advent.bought'; // { shopId: сколько раз купил на этом телефоне }

export function couponCounts(state) {
  const bought = store.get(BOUGHT, {});
  // в state: купоны, которые кошка приняла (done: false — ждут исполнения, иначе использованы)
  const redeemed = {}, waiting = {}, used = {};
  for (const c of state.coupons || []) {
    redeemed[c.shopId] = (redeemed[c.shopId] || 0) + 1;
    const bucket = c.done === false ? waiting : used;
    bucket[c.shopId] = (bucket[c.shopId] || 0) + 1;
  }
  const pending = {};
  for (const [id, n] of Object.entries(bought)) pending[id] = Math.max(0, n - (redeemed[id] || 0));
  return { bought, redeemed, pending, waiting, used };
}

/** Снежинки, «замороженные» в купонах, которые ещё не погашены. */
export function pendingCost(content, state) {
  const { pending } = couponCounts(state);
  return (content.shop || []).reduce((a, s) => a + (pending[s.id] || 0) * s.price, 0);
}

/**
 * Если купонов «в ожидании» больше, чем снежинок (например, начисление удалили
 * или покупка осталась с предпросмотра), — снимаем лишние покупки, самые дорогие первыми.
 * Баланс никогда не уходит в минус.
 */
export function settlePending(content, state, total) {
  const shop = [...(content.shop || [])].sort((a, b) => b.price - a.price);
  let cost = pendingCost(content, state);
  if (cost <= total) return;
  const { bought, pending } = couponCounts(state);
  const next = { ...bought };
  for (const s of shop) {
    while (cost > total && pending[s.id] > 0) {
      pending[s.id]--; next[s.id] = Math.max(0, (next[s.id] || 0) - 1); cost -= s.price;
    }
  }
  store.set(BOUGHT, next);
}

function buy(item, state) {
  const { bought, redeemed } = couponCounts(state);
  // если у него на телефоне меньше покупок, чем погашено, — выравниваем
  const base = Math.max(bought[item.id] || 0, redeemed[item.id] || 0);
  store.set(BOUGHT, { ...bought, [item.id]: base + 1 });
}

function cancel(item, state) {
  const { bought, pending } = couponCounts(state);
  if (!pending[item.id]) return;
  store.set(BOUGHT, { ...bought, [item.id]: Math.max(0, (bought[item.id] || 0) - 1) });
}

function sendToCat(text) {
  window.open(`https://t.me/share/url?url=${encodeURIComponent(' ')}&text=${encodeURIComponent(text)}`, '_blank', 'noopener');
}

/** ctx: { content, state, flakes (доступно), onClose, rerender } */
export function shopView(ctx) {
  const c = ctx.content;
  const { pending, redeemed, waiting, used } = couponCounts(ctx.state);
  const items = [...(c.shop || [])].sort((a, b) => a.price - b.price);

  const myList = items.filter((s) => pending[s.id] || redeemed[s.id]);
  return h('div', {}, closeBtn(ctx.onClose),
    h('div', { class: 'sheet shop' },
      h('h2', {}, '🏪 Кошкина лавка'),
      h('p', { class: 'shop-balance' }, 'У тебя ', h('b', {}, `${ctx.flakes} ❄`)),
      h('ul', { class: 'tickets' }, items.map((s) => {
        const can = ctx.flakes >= s.price;
        return h('li', { class: `ticket${can ? '' : ' poor'}` },
          h('div', { class: 'ticket-main' },
            h('b', {}, s.title),
            s.text ? h('span', {}, s.text) : null),
          h('div', { class: 'ticket-side' },
            h('div', { class: 'ticket-price' }, `${s.price} ❄`),
            h('button', {
              class: `btn btn-sm ${can ? 'btn-gold' : 'btn-ghost'}`, disabled: !can,
              onclick: () => {
                if (!confirm(`Купить «${s.title}» за ${s.price} ❄?`)) return;
                buy(s, ctx.state);
                toast('Купон куплен! Покажи его кошке 🎟');
                sendToCat(`Покупаю купон «${s.title}» за ${s.price} ❄ 🎟`);
                ctx.rerender();
              },
            }, can ? 'Купить' : `ещё ${s.price - ctx.flakes} ❄`)));
      })),
      h('h3', { class: 'shop-sub' }, 'Мои купоны'),
      myList.length ? h('ul', { class: 'my-coupons' }, myList.flatMap((s) => [
        ...Array.from({ length: pending[s.id] || 0 }, () => h('li', {},
          h('span', {}, '🎟 ', s.title), h('span', { class: 'mc-state' }, 'кошка ещё не приняла'),
          h('span', { class: 'mc-actions' },
            h('button', { class: 'btn btn-ghost btn-sm', onclick: () => sendToCat(`Купил купон «${s.title}» за ${s.price} ❄ 🎟 Жду, когда примешь!`) }, 'Напомнить'),
            h('button', { class: 'btn btn-ghost btn-sm', onclick: () => { if (confirm('Отменить покупку? Снежинки вернутся.')) { cancel(s, ctx.state); ctx.rerender(); } } }, 'Отменить')))),
        ...Array.from({ length: waiting[s.id] || 0 }, () => h('li', {},
          h('span', {}, '🎟 ', s.title), h('span', { class: 'mc-state' }, 'кошка приняла'),
          h('span', { class: 'mc-actions' },
            h('button', { class: 'btn btn-ghost btn-sm', onclick: () => sendToCat(`Напоминаю про купон «${s.title}» 🎟`) }, 'Напомнить')))),
        ...Array.from({ length: used[s.id] || 0 }, () => h('li', { class: 'used' },
          h('span', {}, '✓ ', s.title), h('span', { class: 'mc-state' }, 'использован'))),
      ])) : h('p', { class: 'muted-light' }, 'Пока пусто. Выигрывай — и лавка подождёт.')));
}

// ───────── Гардероб ─────────
function teaserFor(weekId, ctx) {
  return (ctx.state.teasers || [])
    .filter((t) => t.weekId === weekId && ctx.now >= new Date(t.revealAt) && teaserReady(t))
    .sort((a, b) => b.revealAt.localeCompare(a.revealAt))[0] || null;
}

/** Состояние образа: locked | frost | blur | open */
export function lookStatus(look, ctx) {
  const node = allNodes(ctx.content).find((n) => n.lookId === look.id);
  const t = node ? teaserFor(node.id, ctx) : null;
  if (!t) return { status: 'locked', node, teaser: null };
  if (t.mode === 'silhouette') return { status: unlockedCodes()[t.weekId] ? 'open' : 'blur', node, teaser: t };
  const revealed = new Set(store.get('advent.revealed', []));
  return { status: revealed.has(t.id) ? 'open' : 'frost', node, teaser: t };
}

export function wardrobeView(ctx) {
  const looks = ctx.content.looks || [];
  const states = looks.map((l) => ({ look: l, ...lookStatus(l, ctx) }));
  const got = states.filter((s) => s.status === 'open').length;
  return h('div', {}, closeBtn(ctx.onClose),
    h('div', { class: 'sheet wardrobe' },
      h('h2', {}, '👗 Гардероб кошки'),
      h('p', { class: 'muted-light' }, `Собрано ${got} из ${looks.length}`),
      h('div', { class: 'polaroids' }, states.map((s, i) => polaroid(s, i, ctx)))));
}

function polaroid(s, i, ctx) {
  const date = s.node ? formatDate(s.node.opensAt) : '';
  const photo = h('div', { class: `pl-photo pl-${s.status}` });
  const caption = {
    locked: `Появится к ${date}`,
    frost: 'Сотри иней под ёлкой',
    blur: '🔑 Нужен код',
    open: s.look.name,
  }[s.status];
  const card = h('button', {
    class: `polaroid${s.status === 'locked' ? ' is-locked' : ''}`, style: { '--tilt': `${[-3, 2, -1.5, 3, -2.5][i % 5]}deg` },
    disabled: s.status === 'locked',
    onclick: () => { if (s.teaser) ctx.onTeaser(s.teaser.id); },
  }, h('span', { class: 'pl-tape' }), photo, h('span', { class: 'pl-caption' }, caption));

  if (s.status === 'locked') photo.append(h('span', { class: 'pl-icon' }, '❄'));
  else {
    photo.append(h('span', { class: 'pl-icon' }, '…'));
    (async () => {
      try {
        let img;
        if (s.status === 'open' && s.teaser.mode === 'silhouette') img = await loadFullMedia(s.teaser);
        else img = await loadMedia(s.teaser);
        if (!img) return;
        const o = s.teaser.orientation || 1;
        const { w, h: hh } = orientedSize(img, o);
        const size = 300;
        const scale = Math.max(size / w, size / hh);
        const cv = document.createElement('canvas');
        drawOriented(cv, img, o, w * scale, hh * scale, 1);
        // центрируем квадрат
        const sq = document.createElement('canvas');
        sq.width = size; sq.height = size;
        sq.getContext('2d').drawImage(cv, (size - cv.width) / 2, (size - cv.height) / 2);
        photo.replaceChildren(sq);
        if (s.status !== 'open') photo.append(h('span', { class: 'pl-veil' }, s.status === 'blur' ? '🔑' : '❄'));
      } catch (e) { console.error(e); }
    })();
  }
  return card;
}

// ───────── Ачивки ─────────
const ACH_SEEN = 'advent.ach';

export function computeAchievements(ctx) {
  const c = ctx.content;
  const st = ctx.state;
  const seen = new Set(store.get('advent.seen', []));
  const openedAt = store.get('advent.openedAt', {});
  const results = st.results || [];
  const nodes = allNodes(c).concat(c.weeks.filter((w) => w.kind === 'bell'));
  const won = (w) => results.some((r) => r.weekId === w && r.winner === 'him');
  let quiz = [];
  try { quiz = Object.keys(localStorage).filter((k) => k.startsWith('advent.quiz.')).map((k) => store.get(k)?.score || 0); } catch { /* */ }
  const looks = c.looks || [];
  const early = Object.entries(openedAt).some(([id, at]) => {
    const n = nodes.find((x) => x.id === id);
    // от момента, когда кошка зажгла шар; для старых записей без времени — от даты на ёлке
    return n && new Date(at) - new Date(releasedAt(id) || n.opensAt) < 15 * 60 * 1000;
  });
  const bonuses = unlockedBonuses();
  const fromCodes = new Set(Object.values(bonuses).map((b) => b.achievement).filter(Boolean));

  const has = {
    first_snow: seen.size > 0,
    early_bird: early,
    hacker: !!store.get('advent.hacker'),
    uno_master: won('w1') || fromCodes.has('uno_master'),
    godfather: !!st.mascot?.name,
    oscar: results.some((r) => r.weekId === 'w3' && r.winner !== 'mammoth') || fromCodes.has('oscar'),
    in_form: seen.has('w5'),
    no_strings: seen.has('w4') || fromCodes.has('no_strings'),
    quiz_pro: quiz.some((s) => s >= 6),
    collector: looks.length > 0 && looks.every((l) => lookStatus(l, ctx).status === 'open'),
    champion: st.champion === 'him',
  };
  return (c.achievements || []).map((a) => ({ ...a, got: !!has[a.id] }));
}

/** Показывает тост о новых ачивках. Первый запуск — молча запоминает уже полученные. */
export function announceAchievements(ctx) {
  const list = computeAchievements(ctx);
  const known = store.get(ACH_SEEN, null);
  const got = list.filter((a) => a.got).map((a) => a.id);
  if (known === null) { store.set(ACH_SEEN, got); return; }
  const fresh = list.filter((a) => a.got && !known.includes(a.id));
  if (fresh.length) {
    store.set(ACH_SEEN, [...new Set([...known, ...got])]);
    toast(`🏅 Новая ачивка: ${fresh.map((a) => a.title).join(', ')}`, 4500);
  }
}

// ───────── Галерея: фото из мини-квестов ─────────
const GALLERY_SEEN = 'advent.seenGallery';

/** Есть фото, которые он ещё не видел. */
export const galleryHasNew = (state) => {
  const seen = new Set(store.get(GALLERY_SEEN, []));
  return (state.gallery || []).some((g) => !seen.has(g.id));
};

/** Рисует фото на canvas: квадратом (обложка) или целиком (maxSide). */
function photoCanvas(img, square, maxSide = 900) {
  const cv = document.createElement('canvas');
  if (square) {
    const size = 320;
    const scale = Math.max(size / img.width, size / img.height);
    const tmp = document.createElement('canvas');
    drawOriented(tmp, img, 1, img.width * scale, img.height * scale, 1);
    cv.width = size; cv.height = size;
    cv.getContext('2d').drawImage(tmp, (size - tmp.width) / 2, (size - tmp.height) / 2);
  } else {
    const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
    drawOriented(cv, img, 1, img.width * scale, img.height * scale, 1);
  }
  return cv;
}

export function galleryView(ctx) {
  const items = [...(ctx.state.gallery || [])].sort((a, b) => a.at.localeCompare(b.at));
  store.set(GALLERY_SEEN, items.map((g) => g.id));
  const nodes = allNodes(ctx.content);
  const title = (g) => g.caption || nodes.find((n) => n.id === g.weekId)?.title || '';
  const sheet = h('div', { class: 'sheet wardrobe gallery' }, h('h2', {}, '📸 Галерея'));

  if (!items.length) {
    sheet.append(h('div', { class: 'gallery-empty' },
      h('div', { class: 'polaroid', style: { '--tilt': '-3deg' } }, h('span', { class: 'pl-tape' }),
        h('div', { class: 'pl-photo' }, h('span', { class: 'pl-icon' }, '📷')), h('span', { class: 'pl-caption' }, 'скоро')),
      h('p', { class: 'muted-light' }, 'Здесь будут твои кадры из мини-квестов. Присылай их кошке, и они будут появляться на этой стене.')));
    return h('div', {}, closeBtn(ctx.onClose), sheet);
  }

  const open = (g, img) => {
    const box = h('div', { class: 'lightbox', onclick: () => box.remove() },
      h('div', { class: 'polaroid' }, h('div', { class: 'pl-photo' }, photoCanvas(img, false)),
        h('span', { class: 'pl-caption' }, title(g), h('small', {}, formatDate(g.at)))));
    document.body.append(box);
  };

  sheet.append(h('p', { class: 'muted-light' }, `Кадров на стене: ${items.length}`),
    h('div', { class: 'polaroids' }, items.map((g, i) => {
      const photo = h('div', { class: 'pl-photo' }, h('span', { class: 'pl-icon' }, '…'));
      let img = null;
      const card = h('button', {
        class: 'polaroid', style: { '--tilt': `${[2, -3, 1.5, -2, 3, -1.5][i % 6]}deg` },
        onclick: () => { if (img) open(g, img); },
      }, h('span', { class: 'pl-tape' }), photo, h('span', { class: 'pl-caption' }, title(g), h('small', {}, formatDate(g.at))));
      loadMedia(g).then((im) => { img = im; photo.replaceChildren(photoCanvas(im, true)); })
        .catch((e) => { console.error(e); photo.replaceChildren(h('span', { class: 'pl-icon' }, '⚠️')); });
      return card;
    })));
  return h('div', {}, closeBtn(ctx.onClose), sheet);
}

export function achievementsView(ctx) {
  const list = computeAchievements(ctx);
  const n = list.filter((a) => a.got).length;
  return h('div', {}, closeBtn(ctx.onClose),
    h('div', { class: 'sheet' },
      h('h2', {}, '🏅 Ачивки'),
      h('p', { class: 'muted-light' }, `Получено ${n} из ${list.length}`),
      h('ul', { class: 'ach-list' }, list.map((a) => h('li', { class: a.got ? 'got' : '' },
        h('span', { class: 'ach-icon' }, a.got ? '🏅' : '🔒'),
        h('span', {}, h('b', {}, a.title), h('span', { class: 'ach-text' }, fill(a.text, ctx.content)))))),
    ));
}
