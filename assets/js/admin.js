// Админка кошки: подарки под ёлку, кодовые слова, результаты, снежинки, мишка, чемпион.
import * as C from './crypto.js';
import { makeRepo } from './github.js';
import { processPhoto } from './imageproc.js';
import { h, toast } from './ui/dom.js';
import { formatDate } from './time.js';
import { fetchReleased, unsealContent } from './sealed.js';

const CFG_KEY = 'advent.adminCfg';
const KEY_STORE = 'advent.key';
const store = {
  get(k, d = null) { try { const v = localStorage.getItem(k); return v === null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch { /* */ } },
  del(k) { try { localStorage.removeItem(k); } catch { /* */ } },
};

const root = document.getElementById('admin');
const A = { cfg: null, repo: null, kdf: null, mainRaw: null, mainKey: null, content: null, state: null, busy: false };

boot();

async function boot() {
  try { localStorage.setItem('advent.admin', '1'); } catch { /* */ }
  A.kdf = await (await fetch('./data/kdf.json?ts=' + Date.now(), { cache: 'no-store' })).json();
  A.cfg = store.get(CFG_KEY);
  const saved = store.get(KEY_STORE);
  if (A.cfg && saved) {
    try {
      A.mainRaw = C.unb64(saved);
      A.mainKey = await C.importAesKey(A.mainRaw);
      A.content = await openContent(A.mainRaw, await C.decryptJSON(A.mainKey, await fetchBin('./data/content.enc')));
      A.repo = repoFor(A.cfg);
      await reloadState();
      return renderMain();
    } catch (e) { console.error(e); }
  }
  renderSetup();
}

function repoFor(cfg) {
  return cfg.owner === 'local' ? makeLocalRepo() : makeRepo(cfg);
}

async function fetchBin(path) {
  const r = await fetch(path + '?ts=' + Date.now(), { cache: 'no-store' });
  if (!r.ok) throw new Error(path + ' ' + r.status);
  return new Uint8Array(await r.arrayBuffer());
}

function openContent(raw, content) {
  return fetchReleased().then((rel) => unsealContent(content, raw, rel, fetchBin));
}

async function readSeals() {
  const bytes = await A.repo.readFile('data/seals.json');
  return bytes ? JSON.parse(new TextDecoder().decode(bytes)) : {};
}
const jsonBytes = (o) => new TextEncoder().encode(JSON.stringify(o, null, 2) + '\n');

async function readStateFresh() {
  const bytes = await A.repo.readFile('data/state.enc');
  if (!bytes) throw new Error('В репозитории нет data/state.enc');
  const st = await C.decryptJSON(A.mainKey, bytes);
  for (const k of ['teasers', 'results', 'ledger', 'coupons', 'codes']) st[k] = st[k] || [];
  return st;
}

async function reloadState() { A.state = await readStateFresh(); }

/** Изменение с коммитом. fn(state, files) мутирует state и добавляет файлы. */
async function mutate(message, fn, okText = 'Сохранено. Сайт обновится через 1–2 минуты ✨') {
  if (A.busy) return;
  A.busy = true;
  document.body.classList.add('busy');
  try {
    let finalState = null;
    await A.repo.commit(async () => {
      const st = await readStateFresh();
      const files = {};
      await fn(st, files);
      st.rev = (st.rev || 0) + 1;
      files['data/state.enc'] = await C.encryptJSON(A.mainKey, st);
      finalState = st;
      return { files, message };
    });
    A.state = finalState;
    toast(okText, 4000);
    renderMain();
    return true;
  } catch (e) {
    console.error(e);
    toast('⚠️ ' + (e.message || 'Ошибка'), 6000);
    return false;
  } finally {
    A.busy = false;
    document.body.classList.remove('busy');
  }
}

// ───────────────────────── Настройка ─────────────────────────

function guessRepo() {
  const host = location.hostname;
  if (host.endsWith('.github.io')) {
    return { owner: host.split('.')[0], repo: location.pathname.split('/').filter(Boolean)[0] || '' };
  }
  if (host === 'localhost' || host === '127.0.0.1') return { owner: 'local', repo: 'dev' };
  return { owner: '', repo: '' };
}

function renderSetup(error = '') {
  const g = A.cfg || { ...guessRepo(), branch: 'main' };
  const f = {
    pass: h('input', { type: 'password', required: true, placeholder: 'Фраза-пароль', autocomplete: 'current-password' }),
    owner: h('input', { required: true, value: g.owner || '', placeholder: 'логин на GitHub', autocapitalize: 'off' }),
    repo: h('input', { required: true, value: g.repo || '', placeholder: 'репозиторий', autocapitalize: 'off' }),
    branch: h('input', { required: true, value: g.branch || 'main', autocapitalize: 'off' }),
    token: h('input', { type: 'password', placeholder: 'github_pat_…', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false' }),
  };
  const msg = h('p', { class: 'a-msg' }, error);
  const btn = h('button', { class: 'btn btn-gold', type: 'submit' }, 'Войти');
  const form = h('form', { class: 'a-card' },
    h('h2', {}, 'Вход в админку'),
    h('p', { class: 'a-hint' }, 'Один раз на этом телефоне. Всё сохранится только здесь.'),
    label('Фраза-пароль от сайта', f.pass),
    label('Логин на GitHub', f.owner),
    label('Репозиторий', f.repo),
    label('Ветка', f.branch),
    label('GitHub-токен (fine-grained, Contents: Read and write)', f.token),
    h('p', { class: 'a-hint' }, g.owner === 'local' ? 'Локальный режим: токен не нужен.' : 'Токен создаётся на GitHub: Settings → Developer settings → Fine-grained tokens.'),
    btn, msg);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    btn.disabled = true; msg.textContent = 'Проверяю…';
    try {
      const raw = await C.deriveMainKeyRaw(f.pass.value, A.kdf);
      const key = await C.importAesKey(raw);
      let content;
      try { content = await C.decryptJSON(key, await fetchBin('./data/content.enc')); } catch { throw new Error('Фраза не подходит.'); }
      const cfg = { owner: f.owner.value.trim(), repo: f.repo.value.trim(), branch: f.branch.value.trim() || 'main', token: f.token.value.trim() || A.cfg?.token || '' };
      const repo = repoFor(cfg);
      if (cfg.owner !== 'local') {
        if (!cfg.token) throw new Error('Нужен GitHub-токен.');
        if (!(await repo.check())) throw new Error('У токена нет права записи в этот репозиторий.');
      }
      Object.assign(A, { cfg, repo, mainRaw: raw, mainKey: key, content: await openContent(raw, content) });
      store.set(CFG_KEY, cfg);
      store.set(KEY_STORE, C.b64(raw));
      await reloadState();
      renderMain();
    } catch (err) {
      msg.textContent = '⚠️ ' + err.message;
      btn.disabled = false;
    }
  });
  root.replaceChildren(header(false), form);
}

// ───────────────────────── Главный экран ─────────────────────────

function header(loggedIn = true) {
  return h('header', { class: 'a-head' },
    h('h1', {}, 'Админка кошки'),
    loggedIn ? h('div', { class: 'a-head-actions' },
      h('a', { class: 'btn btn-ghost btn-sm', href: './index.html' }, 'К сайту'),
      h('button', { class: 'btn btn-ghost btn-sm', onclick: () => { if (confirm('Забыть токен и фразу на этом телефоне?')) { store.del(CFG_KEY); store.del(KEY_STORE); location.reload(); } } }, 'Выйти')) : null);
}

function weeks({ withBell = false } = {}) {
  const all = [...A.content.weeks, A.content.finale];
  return all.filter((w) => withBell || w.kind !== 'bell');
}
const weekLabel = (w) => `${w.kind === 'star' ? 'Звезда' : 'Шар ' + w.slot} · ${formatDate(w.opensAt)} · ${w.title}`;

function renderMain() {
  root.replaceChildren(
    header(),
    h('p', { class: 'a-hint a-repo' }, A.cfg.owner === 'local' ? 'Локальный режим (изменения пишутся в папку проекта)' : `Репозиторий: ${A.cfg.owner}/${A.cfg.repo}`),
    uploadCard(),
    teasersCard(),
    codesCard(),
    resultsCard(),
    flakesCard(),
    couponsCard(),
    mascotCard(),
    championCard(),
    nudgeCard(),
    previewCard(),
  );
}

// 1. Подарок под ёлку
function uploadCard() {
  const ws = weeks();
  const sel = h('select', {}, ws.map((w) => h('option', { value: w.id }, weekLabel(w))));
  const file = h('input', { type: 'file', accept: 'image/*' });
  const modeOpen = h('input', { type: 'radio', name: 'mode', value: 'open' });
  const modeSil = h('input', { type: 'radio', name: 'mode', value: 'silhouette' });
  const code1 = h('input', { type: 'text', placeholder: 'кодовое слово', autocomplete: 'off', autocapitalize: 'off' });
  const code2 = h('input', { type: 'text', placeholder: 'ещё раз', autocomplete: 'off', autocapitalize: 'off' });
  const codeBox = h('div', { class: 'a-stack' }, label('Кодовое слово (его ты скажешь ему)', code1), code2);
  const preview = h('div', { class: 'a-preview' });
  const btn = h('button', { class: 'btn btn-gold', type: 'submit' }, '🎁 Положить под ёлочку');
  let processed = null;

  const syncMode = () => {
    const w = ws.find((x) => x.id === sel.value);
    const silhouette = (w?.teaserMode || 'open') === 'silhouette';
    modeOpen.checked = !silhouette; modeSil.checked = silhouette;
    updateMode();
  };
  const updateMode = () => {
    const sil = modeSil.checked;
    const hasCode = A.state.codes.includes(sel.value);
    codeBox.hidden = !sil;
    code2.hidden = hasCode;
    code1.placeholder = hasCode ? 'уже задано — введи его же' : 'кодовое слово';
    drawPreview();
  };
  const drawPreview = () => {
    preview.replaceChildren();
    if (!processed) return;
    preview.append(h('img', { src: modeSil.checked ? processed.blurUrl : processed.previewUrl, alt: 'Предпросмотр' }),
      h('p', { class: 'a-hint' }, modeSil.checked ? 'Так он увидит фото до кодового слова' : 'Так фото будет выглядеть после стирания инея'));
  };
  sel.addEventListener('change', syncMode);
  modeOpen.addEventListener('change', updateMode);
  modeSil.addEventListener('change', updateMode);
  file.addEventListener('change', async () => {
    processed = null; preview.replaceChildren(h('p', { class: 'a-hint' }, 'Обрабатываю фото…'));
    try { processed = await processPhoto(file.files[0]); drawPreview(); } catch (e) { preview.replaceChildren(h('p', { class: 'a-msg' }, '⚠️ ' + e.message)); }
  });

  const form = h('form', { class: 'a-card' },
    h('h2', {}, '🎁 Положить подарок под ёлку'),
    label('Неделя', sel),
    label('Фото', file),
    h('div', { class: 'a-radios' },
      h('label', {}, modeOpen, ' Стирается пальцем'),
      h('label', {}, modeSil, ' Силуэт — откроется кодовым словом')),
    codeBox,
    h('p', { class: 'a-hint' }, 'Подарок появится под ёлкой сразу, как только сохранится (через 1–2 минуты).'),
    preview,
    btn);

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!processed) return toast('Сначала выбери фото');
    const w = ws.find((x) => x.id === sel.value);
    const sil = modeSil.checked;
    const reveal = new Date(); // подарок появляется сразу
    let weekKey = null, bonusBytes = null;
    if (sil) {
      const code = code1.value.trim();
      if (!code) return toast('Нужно кодовое слово');
      const hasCode = A.state.codes.includes(w.id);
      if (!hasCode && C.normalize(code) !== C.normalize(code2.value)) return toast('Кодовые слова не совпадают');
      const prep = await prepareCode(w, code);
      if (!prep) return;
      ({ weekKey, bonusBytes } = prep);
    }
    btn.disabled = true; btn.textContent = 'Шифрую и сохраняю…';
    const id = C.randomId(6);
    const tid = 't_' + id;
    const files = {};
    // Подарок «на потом» запечатываем: до даты его не открыть даже с фразой
    const sealIt = reveal.getTime() > Date.now() + 2 * 60 * 1000;
    let mediaKey = A.mainKey, sealed = null;
    if (sealIt) {
      const r = C.randomBytes(32);
      const pub = await C.importSealPublic(await (await fetch('./data/release.pub.json?ts=' + Date.now(), { cache: 'no-store' })).json());
      sealed = await C.seal(pub, r);
      mediaKey = await C.sealedKey(A.mainRaw, r, tid);
    }
    files[`data/media/${id}.bin`] = await C.encryptBytes(mediaKey, sil ? processed.blurred : processed.sharp);
    if (sil) files[`data/media/${id}.full.bin`] = await C.encryptBytes(weekKey, processed.sharp);
    if (bonusBytes) files[`data/bonus/${w.id}.enc`] = bonusBytes;
    const ok = await mutate(`Подарок под ёлку: ${w.id}`, async (st, out) => {
      Object.assign(out, files);
      if (sealed) {
        const seals = await readSeals();
        seals[tid] = { at: reveal.toISOString(), sealed };
        out['data/seals.json'] = jsonBytes(seals);
      }
      st.teasers = st.teasers.filter((t) => t.id !== tid);
      st.teasers.push({ id: tid, weekId: w.id, media: id, mime: 'image/jpeg', orientation: 1, mode: sil ? 'silhouette' : 'open', revealAt: reveal.toISOString(), lookId: w.lookId || null, caption: null, ...(sealed ? { sealed: true } : {}) });
      if (sil && !st.codes.includes(w.id)) st.codes.push(w.id);
    }, 'Подарок под ёлкой! Появится на сайте через 1–2 минуты 🎁');
    if (!ok) { btn.disabled = false; btn.textContent = '🎁 Положить под ёлочку'; }
  });

  queueMicrotask(syncMode);
  return form;
}

/** Готовит ключ недели и (если кода ещё нет) файл бонуса. При заданном коде проверяет совпадение. */
async function prepareCode(w, code) {
  const weekKey = await C.importAesKey(await C.deriveWeekKeyRaw(A.mainRaw, w.id, code, A.kdf));
  const existing = await A.repo.readFile(`data/bonus/${w.id}.enc`);
  if (existing) {
    try { await C.decryptJSON(weekKey, existing); } catch {
      toast('Это не то кодовое слово, которое уже задано для этой недели', 5000);
      return null;
    }
    return { weekKey, bonusBytes: null };
  }
  const bonus = { weekId: w.id, text: w.bonus?.text || 'Кодовое слово принято! ✨', reward: w.bonus?.reward ?? 2, achievement: w.bonus?.achievement || null };
  return { weekKey, bonusBytes: await C.encryptJSON(weekKey, bonus) };
}

// 2. Список подарков
function teasersCard() {
  const ws = weeks();
  const list = [...A.state.teasers].sort((a, b) => a.revealAt.localeCompare(b.revealAt));
  return h('section', { class: 'a-card' },
    h('h2', {}, '🎄 Подарки под ёлкой'),
    list.length ? h('ul', { class: 'a-list' }, list.map((t) => {
      const w = ws.find((x) => x.id === t.weekId);
      const shown = new Date(t.revealAt) <= new Date();
      return h('li', {},
        h('div', {}, h('b', {}, w ? weekLabel(w) : t.weekId),
          h('div', { class: 'a-hint' }, `${t.mode === 'silhouette' ? '🔑 силуэт' : '✋ стирается пальцем'}${t.sealed ? ' · 🔒 запечатан до даты' : ''} · ${shown ? 'уже виден' : 'появится ' + new Date(t.revealAt).toLocaleString('ru-RU', { timeZone: 'Europe/Moscow', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}`)),
        h('button', { class: 'btn btn-ghost btn-sm', onclick: () => {
          if (!confirm('Убрать этот подарок из-под ёлки?')) return;
          mutate(`Убрать подарок ${t.id}`, async (st, files) => {
            st.teasers = st.teasers.filter((x) => x.id !== t.id);
            if (t.sealed) {
              const seals = await readSeals();
              if (seals[t.id]) { delete seals[t.id]; files['data/seals.json'] = jsonBytes(seals); }
            }
            files[`data/media/${t.media}.bin`] = null;
            if (t.mode === 'silhouette') files[`data/media/${t.media}.full.bin`] = null;
          }, 'Подарок убран. С сайта исчезнет через 1–2 минуты');
        } }, 'Убрать'));
    })) : h('p', { class: 'a-hint' }, 'Пока пусто.'));
}

// 3. Кодовые слова
function codesCard() {
  const ws = weeks().filter((w) => w.bonus);
  return h('section', { class: 'a-card' },
    h('h2', {}, '🔑 Кодовые слова'),
    h('p', { class: 'a-hint' }, 'Если он выиграл, шепни ему слово. Он введёт его в письме шара и получит бонус (+снежинки), а фото-«силуэт» станет чётким. Задать можно один раз.'),
    h('ul', { class: 'a-list' }, ws.map((w) => {
      const has = A.state.codes.includes(w.id);
      if (has) return h('li', {}, h('div', {}, h('b', {}, weekLabel(w)), h('div', { class: 'a-hint' }, '✅ задано')));
      const c1 = h('input', { type: 'text', placeholder: 'слово', autocomplete: 'off', autocapitalize: 'off' });
      const c2 = h('input', { type: 'text', placeholder: 'ещё раз', autocomplete: 'off', autocapitalize: 'off' });
      const go = h('button', { class: 'btn btn-ghost btn-sm', onclick: async () => {
        const code = c1.value.trim();
        if (!code) return toast('Введи слово');
        if (C.normalize(code) !== C.normalize(c2.value)) return toast('Слова не совпадают');
        const prep = await prepareCode(w, code);
        if (!prep) return;
        mutate(`Кодовое слово: ${w.id}`, (st, files) => {
          if (prep.bonusBytes) files[`data/bonus/${w.id}.enc`] = prep.bonusBytes;
          if (!st.codes.includes(w.id)) st.codes.push(w.id);
        }, 'Кодовое слово задано 🔑');
      } }, 'Задать');
      return h('li', { class: 'a-col' }, h('b', {}, weekLabel(w)), h('div', { class: 'a-row' }, c1, c2, go));
    })));
}

// 4. Результаты
const WIN_LABEL = { him: 'Он', her: 'Я', draw: 'Ничья', mammoth: 'Мамонт' };
function resultsCard() {
  const ws = weeks();
  return h('section', { class: 'a-card' },
    h('h2', {}, '🏆 Кто победил'),
    h('p', { class: 'a-hint' }, 'Его победа: +3 ❄, ничья: +2 ❄ (в играх шара 5 — по +1 ❄ за победу). Счёт турнира обновится сам.'),
    h('ul', { class: 'a-list' }, ws.flatMap((w) => {
      // У шара может быть несколько игр (шар 5) — каждая отмечается отдельно
      const games = w.games?.length ? w.games : [null];
      return games.map((g) => {
        const r = A.state.results.find((x) => x.weekId === w.id && (x.game || null) === (g?.id || null));
        const opts = ['him', 'her', 'draw', ...(w.id === 'w3' ? ['mammoth'] : [])];
        return h('li', { class: 'a-col' },
          h('div', {}, h('b', {}, weekLabel(w) + (g ? ` — ${g.title}` : '')),
            h('div', { class: 'a-hint' }, r ? `Итог: ${WIN_LABEL[r.winner]}` : (w.id === 'w4' ? 'Этот вечер не на победу — можно не отмечать' : 'Не отмечено'))),
          h('div', { class: 'a-row' },
            opts.map((o) => h('button', { class: `btn btn-sm ${r?.winner === o ? 'btn-gold' : 'btn-ghost'}`, onclick: () => setResult(w, o, g) }, WIN_LABEL[o])),
            r ? h('button', { class: 'btn btn-ghost btn-sm', onclick: () => setResult(w, null, g) }, 'Сбросить') : null));
      });
    })));
}

function setResult(w, winner, game = null) {
  const gid = game?.id || null;
  const title = w.title + (game ? ` — ${game.title}` : '');
  mutate(`Результат ${w.id}${gid ? '/' + gid : ''}: ${winner || 'сброс'}`, (st) => {
    const ref = 'result:' + w.id + (gid ? ':' + gid : '');
    st.results = st.results.filter((x) => !(x.weekId === w.id && (x.game || null) === gid));
    st.ledger = st.ledger.filter((x) => x.ref !== ref);
    if (!winner) return;
    st.results.push({ weekId: w.id, ...(gid ? { game: gid } : {}), winner, at: new Date().toISOString() });
    // Игры внутри шара (шар 5): по одной снежинке за победу, как написано в миссии
    const delta = gid ? (winner === 'him' ? 1 : 0) : (winner === 'him' ? 3 : winner === 'draw' ? 2 : 0);
    if (delta) st.ledger.push({ id: C.randomId(4), delta, reason: `${winner === 'him' ? 'Победа' : 'Ничья'}: ${title}`, at: new Date().toISOString(), ref });
  }, winner ? 'Результат записан 🏆' : 'Результат сброшен');
}

// 5. Снежинки
function flakesCard() {
  const total = A.state.ledger.reduce((a, e) => a + (Number(e.delta) || 0), 0);
  const n = h('input', { type: 'number', value: '1', step: '1', style: { width: '90px' } });
  const why = h('input', { type: 'text', placeholder: 'за что (например, мини-квест)' });
  return h('section', { class: 'a-card' },
    h('h2', {}, `❄ Снежинки: ${total}`),
    h('p', { class: 'a-hint' }, 'Плюс к этому он сам получает бонусы за кодовые слова.'),
    h('div', { class: 'a-row' }, n, why, h('button', { class: 'btn btn-ghost btn-sm', onclick: () => {
      const delta = Math.trunc(Number(n.value));
      if (!delta) return toast('Укажи число');
      mutate(`Снежинки ${delta > 0 ? '+' : ''}${delta}`, (st) => {
        st.ledger.push({ id: C.randomId(4), delta, reason: why.value.trim() || (delta > 0 ? 'Просто так 💛' : 'Списание'), at: new Date().toISOString(), ref: 'manual' });
      }, 'Снежинки начислены ❄');
    } }, 'Начислить')),
    A.state.ledger.length ? h('ul', { class: 'a-list' }, [...A.state.ledger].reverse().map((e) =>
      h('li', {}, h('div', {}, h('b', {}, `${e.delta > 0 ? '+' : ''}${e.delta} ❄`), ' ', e.reason),
        e.ref === 'manual' ? h('button', { class: 'btn btn-ghost btn-sm', onclick: () => {
          if (!confirm('Удалить эту запись?')) return;
          mutate('Удалить запись о снежинках', (st) => { st.ledger = st.ledger.filter((x) => x.id !== e.id); }, 'Запись удалена');
        } }, '×') : null))) : null);
}

// 5½. Купоны из Лавки
function couponsCard() {
  const shop = [...(A.content.shop || [])].sort((a, b) => a.price - b.price);
  const used = [...A.state.coupons].reverse();
  return h('section', { class: 'a-card' },
    h('h2', {}, '🎟 Купоны из Лавки'),
    h('p', { class: 'a-hint' }, 'Когда он купит купон, тебе придёт сообщение в Telegram. Исполни его и нажми «Погасить» — снежинки спишутся.'),
    h('ul', { class: 'a-list' }, shop.map((c) => h('li', {},
      h('div', {}, h('b', {}, c.title), h('div', { class: 'a-hint' }, `${c.price} ❄`)),
      h('button', { class: 'btn btn-ghost btn-sm', onclick: () => {
        if (!confirm(`Погасить «${c.title}» (−${c.price} ❄)?`)) return;
        const id = C.randomId(4);
        mutate(`Купон: ${c.id}`, (st) => {
          st.coupons.push({ id, shopId: c.id, at: new Date().toISOString() });
          st.ledger.push({ id: C.randomId(4), delta: -c.price, reason: `Купон: ${c.title}`, at: new Date().toISOString(), ref: 'coupon:' + id });
        }, 'Купон погашен 🎟');
      } }, 'Погасить')))),
    used.length ? h('div', { class: 'a-stack' }, h('b', {}, 'Погашены'),
      h('ul', { class: 'a-list' }, used.map((u) => {
        const c = shop.find((x) => x.id === u.shopId);
        return h('li', {}, h('div', {}, '✓ ', c ? c.title : u.shopId, h('div', { class: 'a-hint' }, new Date(u.at).toLocaleDateString('ru-RU'))),
          h('button', { class: 'btn btn-ghost btn-sm', onclick: () => {
            if (!confirm('Отменить погашение? Снежинки вернутся.')) return;
            mutate('Отмена купона', (st) => {
              st.coupons = st.coupons.filter((x) => x.id !== u.id);
              st.ledger = st.ledger.filter((x) => x.ref !== 'coupon:' + u.id);
            }, 'Погашение отменено');
          } }, 'Отменить'));
      }))) : null);
}

// 6. Мишка
function mascotCard() {
  const name = h('input', { type: 'text', value: A.state.mascot?.name || '', placeholder: 'имя, которое придумал щеночек' });
  return h('section', { class: 'a-card' },
    h('h2', {}, '🧸 Мишка-талисман'),
    h('div', { class: 'a-row' }, name, h('button', { class: 'btn btn-ghost btn-sm', onclick: () => {
      const v = name.value.trim();
      mutate('Имя мишки', (st) => { st.mascot = v ? { ...(st.mascot || {}), name: v } : null; }, v ? `Мишку теперь зовут ${v} 🧸` : 'Имя убрано');
    } }, 'Сохранить')));
}

// 7. Чемпион
function championCard() {
  const cur = A.state.champion;
  const set = (v) => mutate('Чемпион сезона', (st) => { st.champion = v; }, v ? 'Чемпион объявлен 🏆' : 'Чемпион сброшен');
  return h('section', { class: 'a-card' },
    h('h2', {}, '👑 Чемпион сезона'),
    h('p', { class: 'a-hint' }, 'Отметь после финала 31.12.'),
    h('div', { class: 'a-row' },
      h('button', { class: `btn btn-sm ${cur === 'him' ? 'btn-gold' : 'btn-ghost'}`, onclick: () => set('him') }, 'Он'),
      h('button', { class: `btn btn-sm ${cur === 'her' ? 'btn-gold' : 'btn-ghost'}`, onclick: () => set('her') }, 'Я'),
      cur ? h('button', { class: 'btn btn-ghost btn-sm', onclick: () => set(null) }, 'Сбросить') : null));
}

// 8. Намёк
function nudgeCard() {
  const site = new URL('./', location.href).href;
  const text = A.content.nudgeText || 'Загляни под ёлочку 🎄';
  return h('section', { class: 'a-card' },
    h('h2', {}, '💌 Намекнуть ему'),
    h('div', { class: 'a-row' },
      h('button', { class: 'btn btn-gold btn-sm', onclick: () => window.open(`https://t.me/share/url?url=${encodeURIComponent(site)}&text=${encodeURIComponent(text)}`, '_blank', 'noopener') }, 'Отправить в Telegram'),
      h('button', { class: 'btn btn-ghost btn-sm', onclick: async () => { try { await navigator.clipboard.writeText(`${text} ${site}`); toast('Скопировано'); } catch { toast(site); } } }, 'Скопировать')));
}

// 9. Предпросмотр
function previewCard() {
  const when = h('input', { type: 'datetime-local', value: '2026-11-15T00:01' });
  return h('section', { class: 'a-card' },
    h('h2', {}, '👀 Посмотреть сайт на дату'),
    when,
    h('button', { class: 'btn btn-ghost btn-sm', onclick: () => { location.href = './index.html?now=' + encodeURIComponent(when.value); } }, 'Открыть'),
    h('p', { class: 'a-hint' }, 'Время московское. Видишь только ты. Шары и подарки, до которых ещё не дошло время, запечатаны — их не увидишь и ты, пока GitHub не откроет их в срок.'));
}

function label(text, input) {
  return h('label', { class: 'a-field' }, h('span', {}, text), input);
}

// ───────────────────────── Локальный режим (для проверки на компьютере) ─────────────────────────
function makeLocalRepo() {
  return {
    async check() { return true; },
    async readFile(path) {
      const r = await fetch('./' + path + '?ts=' + Date.now(), { cache: 'no-store' });
      return r.ok ? new Uint8Array(await r.arrayBuffer()) : null;
    },
    async commit(build) {
      const { files } = await build();
      const body = {};
      for (const [p, b] of Object.entries(files)) body[p] = b === null ? null : C.b64(b);
      const r = await fetch('./__dev/commit', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      if (!r.ok) throw new Error('Локальный сервер: ' + r.status);
      return 'local';
    },
  };
}
