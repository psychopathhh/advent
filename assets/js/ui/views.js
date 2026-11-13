// Содержимое оверлеев: письмо шара, приветствие, правила, квиз, тизер.
import { h, toast, pulse } from './dom.js';
import { formatDate } from '../time.js';
import { mountScratch } from './scratch.js';
import { isOpen } from '../sealed.js';
import { loadMedia, loadFullMedia, unlockedCodes, unlockedBonuses, store, teaserReady } from '../data.js';

export function fill(text, ctx) {
  return String(text ?? '')
    .replace(/\{ИМЯ\}/g, ctx.name && !/^\{.*\}$/.test(ctx.name) ? ctx.name : '{ИМЯ}');
}

const closeBtn = (onClose) => h('button', { class: 'close-btn', 'aria-label': 'Закрыть', onclick: onClose }, '×');

function kickerFor(node) {
  const d = formatDate(node.opensAt);
  if (node.kind === 'star') return `Звезда · ${d}`;
  if (node.kind === 'bell') return `Колокольчик · ${d}`;
  return `Шар №${node.slot} · ${d}`;
}

/** Конверт с печатью → по тапу письмо. */
export function envelopeView(node, onOpen, onClose) {
  const wax = node.paper === 'seal';
  const seal = h('button', { class: `seal${wax ? ' seal-wax' : ''}`, 'aria-label': 'Сломать печать', onclick: onOpen },
    wax ? pawIcon() : node.kind === 'star' ? '★' : node.kind === 'bell' ? '♪' : String(node.slot));
  return h('div', { '--accent': node.accent, 'data-scene': node.paper === 'sea' ? 'sea' : null },
    closeBtn(onClose),
    h('div', { class: `envelope${wax ? ' envelope-wax' : ''}` },
      seal,
      h('p', { class: 'envelope-title' }, kickerFor(node)),
      h('p', { class: 'envelope-hint' }, 'Тапни по печати')));
}

/** Письмо шара. ctx: { content, state, now, onClose, onTeaser } */
export function letterView(node, ctx) {
  const f = (t) => fill(t, ctx.content);
  const paper = node.paper || '';
  const letter = h('article', { class: `letter${node.dark ? ' dark' : ''}${paper ? ' paper-' + paper : ''}`, '--accent': node.accent });
  const body = h('div', { class: 'letter-body' });
  if (paper === 'scoreboard') letter.append(scoreboardHead(ctx.state));
  if (paper === 'sea') letter.append(h('div', { class: 'pine-leaves', 'aria-hidden': 'true' }), h('div', { class: 'pine-window', 'aria-hidden': 'true' }));
  const wheel = paper === 'seal' ? wheelHead() : null;
  if (wheel) letter.append(wheel);
  if (paper === 'map') letter.append(mapHead());
  letter.append(body);
  body.append(
    h('p', { class: 'kicker' }, kickerFor(node)),
    h('h2', {}, f(node.title)),
    h('div', { class: 'hand' }, (node.letter || []).map((p) => h('p', {}, f(p)))),
    h('p', { class: 'signature' }, ctx.content.signature || ''),
  );

  if (node.inBox) body.append(section('Что тебя ждёт', h('p', { class: 'muted', style: { margin: 0 } }, f(node.inBox))));
  if (node.missionSealed && !node.missionOpen) body.append(section('Миссия вечера', missionSpoiler(node, ctx.content)));
  else if (node.mission?.length) body.append(section('Миссия вечера', missionList(node, ctx.content)));

  if (node.stakes) {
    const labels = node.stakesLabels || { him: 'Выиграешь ты', her: 'Выиграю я' };
    const box = h('div', {},
      h('div', { class: 'stakes' },
        h('div', { class: 'stake' }, h('b', {}, labels.him), f(node.stakes.him)),
        h('div', { class: 'stake' }, h('b', {}, labels.her), f(node.stakes.her))),
      node.stakesNote ? h('p', { class: 'stake-note' }, f(node.stakesNote)) : null);
    body.append(section('Ставки', box));
  }

  const quests = node.quests || (node.quest ? [node.quest] : []);
  if (quests.length) body.append(section(quests.length > 1 ? 'Мини-квесты' : 'Мини-квест', questList(node, ctx.content)));

  if (node.quiz?.length) body.append(section('Вопросы обо мне', quizView(node, ctx)));

  if ((ctx.state.codes || []).includes(node.id)) body.append(section('🔑 Кодовое слово', codeForm(node, ctx)));

  const ny = ctx.content.newYearLetter;
  if (node.kind === 'star' && ny && isOpen(ny, ctx.now) && ny.text) {
    body.append(section(ny.title || 'С Новым годом', h('div', { class: 'hand' }, ny.text.map((p) => h('p', {}, f(p))))));
  }

  const actions = h('div', { class: 'letter-actions' });
  const teaser = (ctx.state.teasers || []).find((t) => t.weekId === node.id && ctx.now >= new Date(t.revealAt) && teaserReady(t));
  if (teaser) actions.append(h('button', { class: 'btn btn-gold', onclick: () => ctx.onTeaser(teaser.id) }, '🎁 Подарок под ёлочкой'));
  actions.append(h('button', { class: 'btn btn-ghost', onclick: ctx.onClose }, 'К ёлке'));
  body.append(actions);
  if (wheel) maskCover(letter, wheel);
  if (paper === 'typewriter') typeOut(letter, [...body.querySelectorAll(':scope > .kicker, :scope > h2, .hand p, :scope > .signature')]);

  return h('div', { 'data-scene': paper === 'sea' ? 'sea' : null }, closeBtn(ctx.onClose), letter);
}

/** Колесо-рулетка в шапке письма (шар 4). wheel.spin() — раскрутить, остановится на лапке. */
function wheelHead() {
  const C = 66, R = 58, N = 8;
  const pt = (a, r = R) => `${(C + r * Math.sin(a)).toFixed(2)} ${(C - r * Math.cos(a)).toFixed(2)}`;
  let art = '';
  for (let i = 0; i < N; i++) {
    const a0 = ((i - 0.5) * 2 * Math.PI) / N, a1 = ((i + 0.5) * 2 * Math.PI) / N, mid = (i * 2 * Math.PI) / N;
    art += `<path d="M${C} ${C} L${pt(a0)} A${R} ${R} 0 0 1 ${pt(a1)} Z" fill="${i % 2 ? '#1E1418' : '#8B0F1E'}"/>`;
    if (i) art += `<text x="${C}" y="${C - 36}" transform="rotate(${(mid * 180) / Math.PI} ${C} ${C})" text-anchor="middle" dominant-baseline="middle" font-size="13" font-weight="700" fill="#E8C27A" opacity=".75">?</text>`;
  }
  for (let i = 0; i < 16; i++) art += `<circle cx="${pt((i * Math.PI) / 8, R - 4).split(' ')[0]}" cy="${pt((i * Math.PI) / 8, R - 4).split(' ')[1]}" r="1.5" fill="#E8C27A"/>`;
  art += `<g transform="translate(${C} ${C - 36}) scale(.62)" fill="#F3D9DD"><ellipse cx="0" cy="4" rx="6" ry="5"/><circle cx="-6.5" cy="-4" r="2.6"/><circle cx="-2.2" cy="-8" r="2.6"/><circle cx="2.8" cy="-7.6" r="2.6"/><circle cx="7" cy="-3" r="2.6"/></g>`;
  const wrap = h('div', { class: 'wheel-head', 'aria-hidden': 'true' });
  wrap.innerHTML = `<svg viewBox="0 0 132 146"><g transform="translate(0 12)"><g class="wheel-spin"><circle cx="${C}" cy="${C}" r="${R + 3}" fill="#0B080A" stroke="#E8C27A" stroke-width="2"/>${art}<circle cx="${C}" cy="${C}" r="9" fill="#E8C27A"/><circle cx="${C}" cy="${C}" r="3.5" fill="#8B0F1E"/></g></g><polygon points="57,2 75,2 66,22" fill="#E8C27A" stroke="#0B080A" stroke-width="1.5" stroke-linejoin="round"/></svg>`;
  const g = wrap.querySelector('.wheel-spin');
  let turn = 90 + Math.floor(Math.random() * 5) * 45; // до раскрутки лапка не сверху
  g.style.transform = `rotate(${turn}deg)`;
  wrap.spin = () => { turn = Math.ceil(turn / 360) * 360 + 360 * 4; g.style.transform = `rotate(${turn}deg)`; };
  wrap.addEventListener('click', wrap.spin);
  return wrap;
}

/** Атласная маска поверх письма (шар 4): при каждом открытии; тап — соскальзывает, и колесо раскручивается. */
function maskCover(letter, wheel) {
  letter.classList.add('masked');
  const off = () => {
    if (cover.classList.contains('off')) return;
    cover.classList.add('off');
    letter.classList.remove('masked');
    setTimeout(() => { cover.remove(); wheel.spin(); }, 700);
  };
  const mask = h('div', { class: 'mask-art' });
  mask.innerHTML = '<svg viewBox="0 0 240 100"><path d="M2 48 Q30 34 46 44" stroke="#2A2226" stroke-width="8" fill="none" stroke-linecap="round"/><path d="M238 48 Q210 34 194 44" stroke="#2A2226" stroke-width="8" fill="none" stroke-linecap="round"/><path d="M200 46 q14 18 6 40" stroke="#2A2226" stroke-width="6" fill="none" stroke-linecap="round"/><path d="M44 34 Q120 8 196 34 Q208 66 172 77 Q140 84 120 66 Q100 84 68 77 Q32 66 44 34 Z" fill="#1A1316" stroke="#8B0F1E" stroke-width="1.6"/><path d="M60 38 Q120 20 180 38" stroke="rgba(255,255,255,.22)" stroke-width="3.5" fill="none" stroke-linecap="round"/><path d="M76 56 q16 9 32 0" stroke="#B3263A" stroke-width="2.2" fill="none" stroke-linecap="round"/><path d="M132 56 q16 9 32 0" stroke="#B3263A" stroke-width="2.2" fill="none" stroke-linecap="round"/></svg>';
  const cover = h('div', { class: 'mask-cover', role: 'button', tabindex: '0', 'aria-label': 'Снять маску и открыть письмо', onclick: off,
    onkeydown: (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); off(); } } },
  h('div', { class: 'mask-inner' }, mask, h('p', { class: 'mask-title' }, 'Сними маску'), h('p', { class: 'mask-hint' }, 'тапни по ней')));
  letter.append(cover);
}

/** Табло стадиона (шар 5): текущий счёт турнира, как на светодиодном табло. */
function scoreboardHead(state) {
  const res = state.results || [];
  const n = (w) => res.filter((r) => r.winner === w).length;
  const him = n('him'), her = n('her'), mammoth = n('mammoth');
  const num = (v) => h('span', { class: 'sb-num', 'data-ghost': '8'.repeat(String(v).length) }, String(v));
  return h('div', { class: 'sb-board', role: 'img', 'aria-label': `Счёт турнира: ты ${him}, я ${her}` },
    h('div', { class: 'sb-top' }, 'Финал'),
    h('div', { class: 'sb-row' }, h('span', { class: 'sb-name' }, 'Ты'), num(him), h('span', { class: 'sb-colon' }, ':'), num(her), h('span', { class: 'sb-name' }, 'Я')),
    h('div', { class: 'sb-sub' }, mammoth ? `счёт турнира · 🦣 ${mammoth}` : 'счёт турнира'));
}

/** Машинка: буквы пропечатываются по очереди. Место под текст занято сразу, поэтому ничего не прыгает; тап — допечатать. */
function typeOut(letter, els) {
  if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
  const parts = els.filter((el) => el.textContent).map((el) => {
    const text = el.textContent;
    const done = h('span', {}), caret = h('span', { class: 'tw-caret' }), rest = h('span', { class: 'tw-rest' }, text);
    el.textContent = '';
    el.append(done, caret, rest);
    return { text, done, caret, rest };
  });
  const total = parts.reduce((a, p) => a + p.text.length, 0);
  if (!total) return;
  const step = Math.max(6, Math.min(28, 3500 / total));
  let i = 0, pos = 0, timer = 0;
  const finish = () => {
    clearTimeout(timer);
    for (const p of parts) { p.done.textContent = p.text; p.rest.remove(); p.caret.remove(); }
    letter.removeEventListener('click', finish);
  };
  const tick = () => {
    if (!letter.isConnected) return;
    const p = parts[i];
    if (!p) return finish();
    p.caret.classList.add('on');
    pos += 1;
    p.done.textContent = p.text.slice(0, pos);
    p.rest.textContent = p.text.slice(pos);
    if (pos >= p.text.length) { p.caret.remove(); p.rest.remove(); i += 1; pos = 0; }
    timer = setTimeout(tick, p.text[pos - 1] === ' ' ? step * 0.5 : step);
  };
  letter.addEventListener('click', finish);
  timer = setTimeout(tick, 450);
}

/** Шапка письма-карты: пунктирный маршрут от «ты» к «я». */
function mapHead() {
  const wrap = h('div', { class: 'map-head', 'aria-hidden': 'true' });
  wrap.innerHTML = `<svg viewBox="0 0 320 120" preserveAspectRatio="xMidYMid meet">
    <path d="M10 92 q30 -18 52 -6 q22 12 44 -4 M150 110 q20 -30 60 -26 M230 20 q20 16 54 8" fill="none" stroke="#AFC4EA" stroke-width="1.2" opacity=".45"/>
    <path class="map-route" d="M40 96 C90 40 150 120 200 64 S270 30 282 30" fill="none" stroke="#E8C27A" stroke-width="2.4" stroke-dasharray="7 6" stroke-linecap="round"/>
    <path d="M40 90 c-4 -6 -13 -2 -9 6 l9 9 l9 -9 c4 -8 -5 -12 -9 -6z" fill="#F2D08A"/>
    <path d="M282 24 c-4 -6 -13 -2 -9 6 l9 9 l9 -9 c4 -8 -5 -12 -9 -6z" fill="#F2D08A"/>
    <text x="40" y="118" text-anchor="middle" font-size="17" fill="#E6ECF5" font-family="Marck Script, cursive">ты</text>
    <text x="60" y="117" text-anchor="middle" font-size="12">🔆</text>
    <text x="300" y="54" text-anchor="middle" font-size="17" fill="#E6ECF5" font-family="Marck Script, cursive">я</text>
    <text x="300" y="72" text-anchor="middle" font-size="12">🌙</text>
    <g transform="translate(150 22)" fill="none" stroke="#AFC4EA" stroke-width="1" opacity=".7"><circle r="12"/><path d="M0 -16 L3 0 L0 16 L-3 0Z" fill="#AFC4EA"/><path d="M-16 0 L0 3 L16 0 L0 -3Z"/></g>
  </svg>`;
  return wrap;
}

function pawIcon() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('viewBox', '-12 -14 24 24');
  svg.setAttribute('class', 'paw');
  svg.innerHTML = '<ellipse cx="0" cy="4" rx="6" ry="5"/><circle cx="-6.5" cy="-4" r="2.6"/><circle cx="-2.2" cy="-8" r="2.6"/><circle cx="2.8" cy="-7.6" r="2.6"/><circle cx="7" cy="-3" r="2.6"/>';
  return svg;
}

export function missionList(node, content) {
  return h('ul', {}, node.mission.map((m) => h('li', {}, fill(m, content))));
}

/** Миссия под спойлером, как в Telegram: строчки-заглушки с мерцающими блёстками. */
function missionSpoiler(node, content) {
  const widths = [92, 74, 86, 63, 80, 70, 88];
  const box = h('div', { class: 'spoiler', 'data-node': node.id, role: 'button', tabindex: 0, 'aria-label': 'Миссия пока скрыта' },
    h('p', { class: 'sp-note' }, '🤫 Миссию кошка откроет, когда сядем играть'),
    h('ul', { 'aria-hidden': 'true' }, Array.from({ length: node.missionCount || 3 }, (_, i) =>
      h('li', {}, h('span', { class: 'sp-line', style: { width: widths[i % widths.length] + '%' } })))));
  const poke = () => { pulse(box, 'sp-poke'); toast(fill('Терпение, {ИМЯ} 🐾', content)); };
  box.addEventListener('click', poke);
  box.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); poke(); } });
  return box;
}

/** Мини-квесты: «+N ❄» в конце формулировки; скрытые — под спойлером. */
function questList(node, content) {
  const quests = node.quests || (node.quest ? [node.quest] : []);
  const wrap = h('div', { class: 'quests', 'data-node': node.id });
  for (const q of quests) {
    if (q.secret) {
      const row = h('div', { class: 'quest quest-secret', role: 'button', tabindex: 0, 'aria-label': 'Квест пока скрыт' },
        h('span', {}, '🎯'),
        h('span', { class: 'q-body' }, h('span', { class: 'sp-line', style: { width: '88%' } }), h('small', {}, '🤫 откроется позже')));
      const poke = () => { pulse(row, 'sp-poke'); toast(fill('Терпение, {ИМЯ} 🐾', content)); };
      row.addEventListener('click', poke);
      row.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); poke(); } });
      wrap.append(row);
    } else {
      wrap.append(h('div', { class: 'quest' }, h('span', {}, '🎯'),
        h('span', {}, fill(q.text, content), q.reward ? h('b', { class: 'q-reward' }, ` +${q.reward} ❄`) : null)));
    }
  }
  return wrap;
}

/** Кошка открыла миссию или квесты, пока письмо открыто: блёстки рассыпаются, проступает текст. */
export function revealMissions(nodes, content) {
  document.querySelectorAll('.spoiler[data-node]').forEach((el) => {
    const n = nodes.find((x) => x.id === el.dataset.node);
    if (!n?.missionOpen || !n.mission?.length || el.classList.contains('sp-out')) return;
    el.classList.add('sp-out');
    setTimeout(() => { const list = missionList(n, content); list.classList.add('sp-in'); el.replaceWith(list); }, 650);
  });
  document.querySelectorAll('.quests[data-node]').forEach((el) => {
    const n = nodes.find((x) => x.id === el.dataset.node);
    if (!n?.questsOpen || !el.querySelector('.quest-secret')) return;
    el.querySelectorAll('.quest-secret').forEach((x) => x.classList.add('sp-out'));
    setTimeout(() => { const list = questList(n, content); list.classList.add('sp-in'); el.replaceWith(list); }, 650);
  });
}

function section(title, body) {
  return h('section', { class: 'section' }, h('h3', {}, title), body);
}

/** Поле кодового слова. После успеха показывает бонус и вызывает onDone. */
export function codeForm(node, ctx, onDone) {
  const wrap = h('div', { class: 'code-box' });
  const bonus = unlockedBonuses()[node.id];
  if (unlockedCodes()[node.id] && bonus) {
    wrap.append(h('p', { class: 'code-ok' }, '✅ ', fill(bonus.text, ctx.content), bonus.reward ? ` · +${bonus.reward} ❄` : ''));
    return wrap;
  }
  const input = h('input', { type: 'text', placeholder: 'Шепни мне слово…', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', 'aria-label': 'Кодовое слово' });
  const btn = h('button', { class: 'btn btn-gold', type: 'submit' }, 'Открыть');
  const msg = h('p', { class: 'code-msg', role: 'status' });
  const form = h('form', { class: 'code-form' }, input, btn);
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!input.value.trim()) return;
    btn.disabled = true; msg.textContent = 'Проверяю…';
    try {
      const b = await ctx.onUnlock(node.id, input.value);
      wrap.replaceChildren(h('p', { class: 'code-ok' }, '✅ ', fill(b.text, ctx.content), b.reward ? ` · +${b.reward} ❄` : ''));
      pulse(wrap);
      onDone?.();
    } catch (err) {
      btn.disabled = false;
      form.classList.remove('shake'); void form.offsetWidth; form.classList.add('shake');
      msg.textContent = err.message === 'nocode' ? 'Для этого шара слово ещё не загадано.' : 'Не то слово 🙃 Попробуй ещё — или сначала выиграй.';
    }
  });
  wrap.append(form, msg);
  return wrap;
}

function quizView(node, ctx) {
  const key = `advent.quiz.${node.id}`;
  const saved = store.get(key);
  const wrap = h('div', {});
  if (saved) {
    wrap.append(h('p', {}, `Твой результат: ${saved.score} из ${node.quiz.length}.`), shareBtn(`Мой результат в квизе: ${saved.score} из ${node.quiz.length} ❄`));
    return wrap;
  }
  const form = h('form', {});
  node.quiz.forEach((q, i) => {
    form.append(h('fieldset', { style: { border: 0, padding: 0, margin: '0 0 16px' } },
      h('legend', { style: { fontWeight: 700, marginBottom: '6px' } }, `${i % 2 ? '🔆' : '🌙'} ${i + 1}. ${fill(q.q, ctx.content)}`), // луна и солнце — как браслеты
      q.options.map((o, j) => h('label', { style: { display: 'flex', gap: '8px', alignItems: 'center', padding: '6px 0' } },
        h('input', { type: 'radio', name: `q${i}`, value: j, required: true }), fill(o, ctx.content)))));
  });
  form.append(h('button', { class: 'btn btn-gold', type: 'submit' }, 'Проверить'));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const fd = new FormData(form);
    const score = node.quiz.reduce((acc, q, i) => acc + (Number(fd.get(`q${i}`)) === q.answer ? 1 : 0), 0);
    store.set(key, { score, at: new Date().toISOString() });
    wrap.replaceChildren(h('p', {}, `${score} из ${node.quiz.length}! ${score >= 6 ? 'Ты меня знаешь 🫶' : score >= 4 ? 'Неплохо. Но я запомню 👀' : 'Так-так. Нам надо чаще разговаривать'}`),
      shareBtn(`Мой результат в квизе: ${score} из ${node.quiz.length} ❄`));
  });
  wrap.append(form);
  return wrap;
}

function shareBtn(text) {
  return h('button', {
    class: 'btn btn-ghost', type: 'button',
    onclick: () => window.open(`https://t.me/share/url?url=${encodeURIComponent(' ')}&text=${encodeURIComponent(text)}`, '_blank', 'noopener'),
  }, 'Отправить кошке');
}

/** Приветственное письмо */
export function welcomeView(ctx) {
  const f = (t) => fill(t, ctx.content);
  return h('div', {}, closeBtn(ctx.onClose),
    h('article', { class: 'letter', '--accent': '#E8C27A' },
      h('p', { class: 'kicker' }, 'Письмо №0'),
      h('h2', {}, 'Под ёлочкой'),
      h('div', { class: 'hand' }, (ctx.content.welcome || []).map((p) => h('p', {}, f(p)))),
      h('p', { class: 'signature' }, ctx.content.signature || ''),
      h('div', { class: 'letter-actions' },
        h('button', { class: 'btn btn-gold', onclick: () => { location.hash = '#/rules'; } }, 'Как это работает'),
        h('button', { class: 'btn btn-ghost', onclick: ctx.onClose }, 'К ёлке'))));
}

/** Правила */
export function rulesView(ctx) {
  return h('div', {}, closeBtn(ctx.onClose),
    h('div', { class: 'sheet' },
      h('h2', {}, 'Как это работает'),
      h('ul', { class: 'rules' }, (ctx.content.rules || []).map((r) =>
        h('li', {}, h('span', { class: 'ri' }, r.icon), h('span', {}, h('b', {}, r.title), ' — ', r.text)))),
      h('div', { class: 'letter-actions' }, h('button', { class: 'btn btn-gold', onclick: ctx.onClose }, 'К ёлке'))));
}

/** Подарок под ёлкой */
export function teaserView(teaser, node, ctx) {
  const caption = fill(teaser.caption || node?.teaserCaption || '', ctx.content);
  const box = h('div', { class: 'scratch' }, h('div', { class: 'loading' }, 'Развязываю ленточку…'));
  const hint = h('p', { class: 'teaser-hint' });
  const revealedKey = 'advent.revealed';
  const revealed = new Set(store.get(revealedKey, []));
  const view = h('div', { class: 'teaser', '--accent': node?.accent },
    closeBtn(ctx.onClose),
    h('p', { class: 'kicker', style: { color: 'var(--snow-dim)' } }, node ? `К ${node.kind === 'star' ? 'звезде' : `шару №${node.slot}`} · ${formatDate(node.opensAt)}` : 'Подарок'),
    h('h2', {}, 'Под ёлочкой'),
    h('p', { class: 'teaser-caption' }, caption),
    h('div', { style: { width: '100%' } }, box),
    hint,
    h('div', { class: 'letter-actions' }, h('button', { class: 'btn btn-ghost', onclick: ctx.onClose }, 'К ёлке')));

  if (teaser.mode === 'silhouette') {
    const codeSlot = h('div', { class: 'teaser-code' });
    view.insertBefore(codeSlot, view.lastChild);
    const showFull = async () => {
      const full = await loadFullMedia(teaser);
      if (!full) return false;
      mountScratch(box, full, teaser.orientation || 1, { revealed: true });
      hint.textContent = 'Иней растаял 💫';
      const b = unlockedBonuses()[teaser.weekId];
      codeSlot.replaceChildren(b ? h('p', { class: 'code-ok', style: { textAlign: 'center' } }, '✅ ', fill(b.text, ctx.content), b.reward ? ` · +${b.reward} ❄` : '') : '');
      return true;
    };
    requestAnimationFrame(async () => {
      try {
        if (await showFull()) return;
        const blurred = await loadMedia(teaser);
        mountScratch(box, blurred, teaser.orientation || 1, { revealed: true });
        hint.textContent = 'Остальное — для победителя 🔑';
        if (node && (ctx.state.codes || []).includes(node.id)) {
          codeSlot.replaceChildren(codeForm(node, ctx, () => showFull().catch(console.error)));
        }
      } catch (e) {
        console.error(e);
        box.replaceChildren(h('div', { class: 'loading' }, 'Не получилось загрузить подарок. Попробуй позже.'));
      }
    });
    return view;
  }

  requestAnimationFrame(async () => {
    try {
      const img = await loadMedia(teaser);
      const isRevealed = revealed.has(teaser.id);
      hint.textContent = isRevealed ? '' : 'Води пальцем по инею ✨';
      mountScratch(box, img, teaser.orientation || 1, {
        revealed: isRevealed,
        onReveal: () => {
          revealed.add(teaser.id);
          store.set(revealedKey, [...revealed]);
          hint.textContent = 'Вот так-то лучше 💫';
          try { navigator.vibrate?.([10, 40, 10]); } catch { /* */ }
          pulse(box);
        },
      });
    } catch (e) {
      console.error(e);
      box.replaceChildren(h('div', { class: 'loading' }, 'Не получилось загрузить подарок. Попробуй позже.'));
      toast('Подарок не загрузился 😔');
    }
  });
  return view;
}

// ───────── Турнир ─────────
const WHO = { him: 'Он', her: 'Она', draw: 'Ничья', mammoth: 'Мамонт' };

export function tournamentView(ctx) {
  const c = ctx.content;
  const nodes = [...c.weeks, c.finale].filter((n) => n.kind !== 'bell');
  const results = ctx.state.results || [];
  const count = (w) => results.filter((r) => r.winner === w).length;
  const him = count('him'), her = count('her'), mammoth = count('mammoth');
  const left = nodes.filter((n) => !isOpen(n, ctx.now)).length;
  const champ = ctx.state.champion;

  return h('div', {}, closeBtn(ctx.onClose),
    h('div', { class: 'sheet tournament' },
      h('h2', {}, '🏆 Турнир'),
      champ ? h('div', { class: 'champ' }, h('div', { class: 'champ-crown' }, '👑'), h('div', {}, h('b', {}, 'Чемпион сезона'), h('div', {}, champ === 'him' ? fill('{ИМЯ}', c) : 'Кошка'))) : null,
      h('div', { class: 'score' },
        h('div', { class: 'score-side' }, h('div', { class: 'score-n' }, String(him)), h('div', { class: 'score-name' }, 'Он')),
        h('div', { class: 'score-sep' }, ':'),
        h('div', { class: 'score-side' }, h('div', { class: 'score-n' }, String(her)), h('div', { class: 'score-name' }, 'Она'))),
      mammoth ? h('p', { class: 'score-extra' }, `🦣 Мамонт: ${mammoth}`) : null,
      h('p', { class: 'score-extra' }, champ ? 'Сезон завершён ✨' : left ? `До конца сезона: ${left} ${plural(left, 'вечер', 'вечера', 'вечеров')}` : 'Решающий вечер позади — ждём объявления чемпиона'),
      h('ul', { class: 'timeline' }, nodes.flatMap((n) => {
        const future = !isOpen(n, ctx.now);
        // игры шара не раскрываем, пока он не открылся
        const games = n.games?.length && !future ? n.games : [null];
        return games.map((g, i) => {
          const r = results.find((x) => x.weekId === n.id && (x.game || null) === (g?.id || null));
          return h('li', { class: `${future ? 'future' : ''}${g && i ? ' sub' : ''}` },
            h('span', { class: 'tl-dot', style: { background: n.accent, visibility: g && i ? 'hidden' : 'visible' } }),
            h('span', { class: 'tl-date' }, g && i ? '' : formatDate(n.opensAt)),
            h('span', { class: 'tl-title' }, g ? (i ? '' : fill(n.title, c) + ': ') + g.title : fill(n.title, c)),
            h('span', { class: `tl-res ${r ? 'r-' + r.winner : ''}` }, r ? WHO[r.winner] : future ? '—' : n.id === 'w4' ? 'вне турнира' : '…'));
        });
      }))));
}

function plural(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

// ───────── История снежинок ─────────
export function flakesView(ctx) {
  const c = ctx.content;
  const nodes = [...c.weeks, c.finale];
  const bonuses = unlockedBonuses();
  const codes = unlockedCodes();
  const rows = [
    ...(ctx.state.ledger || []).map((e) => ({ delta: Number(e.delta) || 0, reason: e.reason, at: e.at })),
    ...Object.entries(bonuses).filter(([w]) => codes[w] && (ctx.state.codes || []).includes(w)).map(([w, b]) => {
      const n = nodes.find((x) => x.id === w);
      return { delta: b.reward, reason: `Кодовое слово: ${n ? fill(n.title, c) : w}`, at: '' };
    }),
  ].filter((r) => r.delta);
  return h('div', {}, closeBtn(ctx.onClose),
    h('div', { class: 'sheet' },
      h('h2', {}, `❄ Снежинки: ${ctx.flakes}`),
      h('p', { class: 'muted-light' }, 'Даются за победы, кодовые слова и мини-квесты. Скоро на них можно будет купить купоны в Кошкиной лавке.'),
      rows.length
        ? h('ul', { class: 'flake-list' }, rows.map((r) => h('li', {}, h('b', { class: r.delta > 0 ? 'plus' : 'minus' }, `${r.delta > 0 ? '+' : ''}${r.delta}`), h('span', {}, r.reason))))
        : h('p', { class: 'muted-light' }, 'Пока ни одной. Всё впереди!')));
}
