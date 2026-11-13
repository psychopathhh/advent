// Точка входа сайта «Под ёлочкой».
import { syncTime, startAutoSync, now, isPreview, clockSkewed, formatCountdown } from './time.js';
import { restoreSession, login, logout, loadContent, loadState, store, unlockCode, unlockedCodes, unlockedBonuses, teaserReady } from './data.js';
import { isReady, isOpen } from './sealed.js';
import { startSnow } from './ui/snow.js';
import { renderTree } from './ui/tree.js';
import { toast, vibrate, pulse } from './ui/dom.js';
import { envelopeView, letterView, welcomeView, rulesView, teaserView, tournamentView, flakesView } from './ui/views.js';
import { setScene } from './ui/scenes.js';
import { shopView, wardrobeView, galleryView, galleryHasNew, achievementsView, announceAchievements, pendingCost, settlePending } from './ui/extras.js';

const $ = (id) => document.getElementById(id);
const app = { content: null, state: null, sig: '' };
const seen = new Set(store.get('advent.seen', []));
const seenGifts = new Set(store.get('advent.seenGifts', []));
const knocks = {};

startSnow($('snow'));
// без этого Safari на iPhone не показывает нажатие (:active) на шарах и кнопках
document.addEventListener('touchstart', () => {}, { passive: true });
boot();

async function boot() {
  await syncTime();
  startAutoSync();
  if (isPreview()) {
    const b = $('preview-banner');
    b.hidden = false;
    document.body.classList.add('is-preview');
    b.textContent = 'Режим предпросмотра: ' + now().toLocaleString('ru-RU', { timeZone: 'Europe/Moscow' });
  }
  const content = await restoreSession().catch(() => null);
  if (content) return enter(content);
  showLogin();
}

// ───────── Вход ─────────
let fails = 0;
function showLogin() {
  $('screen-tree').hidden = true;
  $('screen-login').hidden = false;
  $('login-ios').hidden = !iosSafariTab();
  // Подсказка к фразе лежит открыто (data/hint.json), т.к. нужна до входа
  fetch('./data/hint.json?ts=' + Date.now(), { cache: 'no-store' })
    .then((r) => (r.ok ? r.json() : null)).then((j) => { app.hint = j?.hint || null; }).catch(() => {});
  const form = $('login-form');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const pass = $('pass').value;
    if (!pass.trim()) return;
    const btn = $('login-btn');
    btn.disabled = true;
    btn.replaceChildren(Object.assign(document.createElement('span'), { className: 'spinner' }), ' Зажигаю ёлку…');
    $('login-msg').textContent = '';
    try {
      const content = await login(pass, $('remember').checked);
      $('pass').value = '';
      enter(content);
    } catch (err) {
      fails++;
      form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake');
      vibrate(30);
      if (err.message === 'wrong') {
        $('login-msg').textContent = fails >= 3 && app.hint ? `Подсказка: ${app.hint}` : 'Неа. Кошка так не говорила 🙃';
        if (fails >= 3 && !app.hint) $('login-msg').textContent = 'Неа. Подсказка: это фраза, а не дата 😉';
      } else {
        $('login-msg').textContent = 'Ёлка не отвечает. Проверь интернет и попробуй ещё раз.';
        console.error(err);
      }
    } finally {
      btn.disabled = false;
      btn.textContent = 'Зажечь ёлку';
    }
  };
  setTimeout(() => $('pass').focus(), 300);
}

/** iPhone/iPad, открыто во вкладке браузера, а не с иконки на экране «Домой». */
function iosSafariTab() {
  const ios = /iPhone|iPad|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  return ios && !standalone;
}

// ───────── Ёлка ─────────
async function enter(content) {
  app.content = content;
  app.state = await loadState();
  // просим браузер не чистить память сайта (Safari иначе может стереть её после недели без визитов)
  try { navigator.storage?.persist?.().catch(() => {}); } catch { /* */ }
  $('screen-login').hidden = true;
  $('screen-tree').hidden = false;
  $('brand').textContent = content.siteTitle || 'Под ёлочкой';
  document.title = '🎄 ' + (content.siteTitle || 'Под ёлочкой');

  bindTree();
  bindMenu();
  bindNav();
  tick();
  setInterval(tick, 1000);

  if (clockSkewed() && !sessionStorage.getItem('advent.skew')) {
    try { sessionStorage.setItem('advent.skew', '1'); } catch { /* */ }
    setTimeout(() => toast(content.clockPhrase || 'Подкрутил часы? ⏰', 4500), 1200);
  }

  document.addEventListener('visibilitychange', async () => {
    if (document.hidden) return;
    await syncTime();
    await refresh();
  });
  setInterval(refresh, 60 * 1000);

  window.addEventListener('hashchange', route);
  if (!store.get('advent.welcomed')) {
    store.set('advent.welcomed', true);
    location.hash = '#/welcome';
  }
  route();
}

async function refresh() {
  try {
    app.content = await loadContent();
    app.state = await loadState();
    app.sig = '';
    tick();
  } catch { /* офлайн */ }
}

function allNodes() {
  const c = app.content;
  return [...c.weeks, c.finale].filter(Boolean);
}

function statusOf(node, t) {
  if (!isOpen(node, t)) return 'locked';
  return seen.has(node.id) ? 'open' : 'new';
}

function visibleTeasers(t) {
  return (app.state.teasers || [])
    .filter((x) => t >= new Date(x.revealAt) && teaserReady(x))
    .sort((a, b) => a.revealAt.localeCompare(b.revealAt));
}

function tick() {
  const t = now();
  const nodes = allNodes().map((n) => {
    const status = statusOf(n, t);
    const label = `${n.kind === 'star' ? 'Звезда' : n.kind === 'bell' ? 'Колокольчик' : 'Шар ' + n.slot}, ${status === 'locked' ? 'закрыт' : status === 'new' ? 'новый, можно открыть' : 'открыт'}`;
    const played = (app.state.results || []).filter((r) => r.weekId === n.id && r.game).map((r) => r.game);
    return { ...n, status, label, played };
  });
  const gifts = visibleTeasers(t).map((x) => {
    const node = allNodes().find((n) => n.id === x.weekId);
    return { id: x.id, accent: node?.accent, isNew: !seenGifts.has(x.id) };
  });
  const w2 = allNodes().find((n) => n.id === 'w2');
  const mascot = { arrived: !!(w2 && isOpen(w2, t)), name: app.state.mascot?.name || null };
  const sky = skyState(t);

  // Перерисовываем ёлку, только если что-то поменялось
  const sig = JSON.stringify([nodes.map((n) => n.status + n.played.join()), gifts.map((g) => g.id + g.isNew), mascot.arrived, sky.visible && sky.p]);
  if (sig !== app.sig) {
    app.sig = sig;
    renderTree($('tree'), { nodes, gifts, mascot, sky });
    setTimeout(() => announceAchievements(achCtx()), 400);
    const newGift = gifts.some((g) => g.isNew);
    $('tree-tip').textContent = newGift ? 'Под ёлочкой новый подарок 🎁' : '';
  }

  // Баланс снежинок
  $('flakes-n').textContent = String(flakesAvailable());
  $('nav-gallery').classList.toggle('has-new', galleryHasNew(app.state));

  // Таймер
  const fresh = nodes.find((n) => n.status === 'new');
  const future = [...allNodes(), app.content.newYearLetter].filter((n) => n && !isOpen(n, t))
    .map((n) => new Date(n.opensAt)).filter((d) => d > t).sort((a, b) => a - b)[0];
  // день шара настал, но кошка его ещё не зажгла
  const warming = allNodes().find((n) => t >= new Date(n.opensAt) && !isOpen(n, t));
  if (fresh) {
    $('cd-label').textContent = fresh.kind === 'star' ? 'Звезда уже горит!' : 'Новый шар уже горит!';
    $('cd-value').textContent = 'Тапни по нему ✨';
  } else if (warming) {
    $('cd-label').textContent = warming.kind === 'star' ? 'Звезда вот-вот загорится' : 'Новый шар вот-вот загорится';
    $('cd-value').textContent = 'Кошка уже несёт спички 🐾';
    if (!app.warmTimer) app.warmTimer = setTimeout(() => { app.warmTimer = null; refresh(); }, 30 * 1000);
  } else if (future) {
    $('cd-label').textContent = 'До следующего шара';
    $('cd-value').textContent = formatCountdown(future - t);
  } else {
    $('cd-label').textContent = 'Сезон завершён';
    $('cd-value').textContent = 'С Новым годом ✨';
  }
}

function flakesTotal() {
  const ledger = (app.state.ledger || []).reduce((a, e) => a + (Number(e.delta) || 0), 0);
  const codes = unlockedCodes();
  const live = app.state.codes || [];
  const bonus = Object.entries(unlockedBonuses()).filter(([w]) => codes[w] && live.includes(w)).reduce((a, [, b]) => a + (Number(b.reward) || 0), 0);
  return ledger + bonus;
}

/** Сколько можно потратить: всё заработанное минус купоны, которые ждут погашения. */
function flakesAvailable() {
  const total = Math.max(0, flakesTotal());
  settlePending(app.content, app.state, total);
  return Math.max(0, total - pendingCost(app.content, app.state));
}

function achCtx() {
  return { content: app.content, state: app.state, now: now() };
}

async function onUnlock(weekId, code) {
  const bonus = await unlockCode(weekId, code);
  vibrate(20);
  tick();
  setTimeout(() => announceAchievements(achCtx()), 1500);
  if (bonus.reward) toast(`+${bonus.reward} ❄`);
  return bonus;
}

function bindNav() {
  $('flakes').onclick = () => { location.hash = '#/flakes'; };
  document.querySelectorAll('.bottom-nav [data-tab]').forEach((b) => {
    b.onclick = () => { location.hash = b.dataset.tab; };
  });
}

function syncNav(kind) {
  const active = ['tournament', 'shop', 'wardrobe', 'gallery'].includes(kind) ? '#/' + kind : '#/';
  document.querySelectorAll('.bottom-nav [data-tab]').forEach((b) => b.classList.toggle('active', b.dataset.tab === active));
}

function bindTree() {
  const svg = $('tree');
  const act = (e) => {
    const nodeEl = e.target.closest('[data-node]');
    const giftEl = e.target.closest('[data-gift]');
    const mascotEl = e.target.closest('[data-mascot]');
    if (e.target.closest('[data-sky]')) return onSky();
    if (nodeEl) return onNode(nodeEl.dataset.node);
    if (giftEl) return (location.hash = '#/t/' + giftEl.dataset.gift);
    if (mascotEl) return onMascot();
  };
  svg.addEventListener('click', act);
  svg.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act(e); } });
}

function onNode(id) {
  const node = allNodes().find((n) => n.id === id);
  if (!node) return;
  const t = now();
  if (!isOpen(node, t) && t >= new Date(node.opensAt)) {
    toast('Кошка зажжёт этот шар совсем скоро 🐾');
    return;
  }
  if (!isOpen(node, t)) {
    vibrate(15);
    pulse($('tree').querySelector(`[data-node="${id}"]`), 'knock');
    knocks[id] = (knocks[id] || 0) + 1;
    const c = app.content;
    if (knocks[id] === 10 && node.lockedHint) {
      toast((c.hackerPhrase || 'Держи подсказку: {подсказка}').replace('{подсказка}', node.lockedHint), 5000);
      store.set('advent.hacker', true);
      return;
    }
    const w2 = allNodes().find((n) => n.id === 'w2');
    const bearHere = w2 && isOpen(w2, t);
    // Пока мишка не подарен (до шара 2) — никаких фраз о нём
    const pool = (c.lockedPhrases || []).filter((p) => bearHere || !/мишк/i.test(p));
    const list = pool.length ? pool : ['Не подглядывай 👀'];
    const phrase = list[Math.floor(Math.random() * list.length)]
      .replace('{таймер}', formatCountdown(new Date(node.opensAt) - t));
    toast(phrase);
    return;
  }
  vibrate(10);
  location.hash = '#/w/' + id;
}

// Луна и солнце: появляются с колокольчиком и каждый день сближаются; 31.12 встречаются
function skyState(t) {
  const bell = allNodes().find((n) => n.kind === 'bell');
  const star = allNodes().find((n) => n.kind === 'star');
  if (!bell || !star || !isOpen(bell, t)) return { visible: false, p: 0 };
  const day = 86400000;
  const start = new Date(bell.opensAt).getTime(), end = new Date(star.opensAt).getTime();
  const total = Math.round((end - start) / day);
  const passed = Math.min(total, Math.max(0, Math.floor((t - start) / day)));
  return { visible: true, p: total > 0 ? Math.round((passed / total) * 1000) / 1000 : 1, left: Math.max(0, Math.ceil((end - t) / day)) };
}

function onSky() {
  const c = app.content;
  const { left } = skyState(now());
  if (!left) return toast(c.skyMetPhrase || 'Солнце и луна встретились. С Новым годом ❤', 5000);
  const list = c.skyPhrases?.length ? c.skyPhrases : ['Луна у меня, солнце у тебя.'];
  const word = left % 10 === 1 && left % 100 !== 11 ? 'день' : [2, 3, 4].includes(left % 10) && ![12, 13, 14].includes(left % 100) ? 'дня' : 'дней';
  toast(`${list[Math.floor(Math.random() * list.length)]} Солнце и луна встретятся через ${left} ${word}.`, 5000);
}

function onMascot() {
  const c = app.content;
  const w2 = allNodes().find((n) => n.id === 'w2');
  if (!w2 || !isOpen(w2, now())) return toast(c.mascotSleeping || 'Здесь кто-то скоро поселится ❄');
  const list = c.mascotPhrases || [];
  const name = app.state.mascot?.name || c.mascotName || 'Мишка';
  toast(`🧸 ${name}: ${list[Math.floor(Math.random() * list.length)] || '…'}`);
}

function bindMenu() {
  const btn = $('menu-btn'), menu = $('menu');
  const close = () => { menu.hidden = true; btn.setAttribute('aria-expanded', 'false'); };
  btn.onclick = (e) => { e.stopPropagation(); menu.hidden = !menu.hidden; btn.setAttribute('aria-expanded', String(!menu.hidden)); };
  document.addEventListener('click', (e) => { if (!menu.contains(e.target)) close(); });
  menu.querySelectorAll('[data-go]').forEach((b) => { b.onclick = () => { close(); location.hash = b.dataset.go; }; });
  $('logout-btn').onclick = () => {
    logout();
    ['advent.seen', 'advent.seenGifts', 'advent.welcomed', 'advent.revealed', 'advent.codes', 'advent.bonus', 'advent.openedAt', 'advent.bought', 'advent.ach', 'advent.hacker'].forEach((k) => store.del(k));
    location.hash = '';
    location.reload();
  };
}

// ───────── Оверлеи ─────────
function closeOverlay() {
  if (location.hash && location.hash !== '#/') location.hash = '#/';
  else hideOverlay();
}
function hideOverlay() {
  $('overlay').hidden = true;
  $('overlay-inner').replaceChildren();
  setScene('', $('overlay'));
  document.body.style.overflow = '';
}
function showOverlay(el) {
  const ov = $('overlay');
  $('overlay-inner').replaceChildren(el);
  setScene(el.dataset?.scene || '', ov);
  ov.hidden = false;
  ov.scrollTop = 0;
  document.body.style.overflow = 'hidden';
}

function route() {
  const hash = location.hash.replace(/^#\/?/, '');
  const [kind, id] = hash.split('/');
  const ctx = { content: app.content, state: app.state, now: now(), onClose: closeOverlay, onTeaser: (tid) => { location.hash = '#/t/' + tid; }, onUnlock, flakes: flakesTotal(), rerender: () => { tick(); route(); } };
  syncNav(kind);
  document.body.dataset.view = kind || '';
  document.querySelectorAll('.lightbox').forEach((x) => x.remove());

  if (!kind) return hideOverlay();
  if (kind === 'tournament') return showOverlay(tournamentView(ctx));
  if (kind === 'flakes') return showOverlay(flakesView(ctx));
  if (kind === 'shop') return showOverlay(shopView({ ...ctx, flakes: flakesAvailable() }));
  if (kind === 'wardrobe') return showOverlay(wardrobeView(ctx));
  if (kind === 'gallery') { const v = galleryView(ctx); tick(); return showOverlay(v); }
  if (kind === 'achievements') return showOverlay(achievementsView(ctx));
  if (kind === 'welcome') return showOverlay(welcomeView(ctx));
  if (kind === 'rules') return showOverlay(rulesView(ctx));

  if (kind === 'w') {
    const node = allNodes().find((n) => n.id === id);
    if (!node || !isOpen(node, ctx.now)) { location.hash = '#/'; return; }
    const openLetter = () => {
      if (!seen.has(node.id)) {
        seen.add(node.id);
        store.set('advent.seen', [...seen]);
        const opened = store.get('advent.openedAt', {});
        opened[node.id] = now().toISOString();
        store.set('advent.openedAt', opened);
        app.sig = '';
        tick();
      }
      showOverlay(letterView(node, ctx));
    };
    if (seen.has(node.id)) return openLetter();
    return showOverlay(envelopeView(node, () => { vibrate(20); openLetter(); }, closeOverlay));
  }

  if (kind === 't') {
    const teaser = visibleTeasers(ctx.now).find((x) => x.id === id);
    if (!teaser) { location.hash = '#/'; return; }
    const node = allNodes().find((n) => n.id === teaser.weekId);
    if (!seenGifts.has(teaser.id)) {
      seenGifts.add(teaser.id);
      store.set('advent.seenGifts', [...seenGifts]);
      app.sig = '';
      tick();
    }
    return showOverlay(teaserView(teaser, node, ctx));
  }

  hideOverlay();
}
