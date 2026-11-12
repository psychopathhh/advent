// Содержимое оверлеев: письмо шара, приветствие, правила, квиз, тизер.
import { h, toast } from './dom.js';
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
  const seal = h('button', { class: 'seal', 'aria-label': 'Сломать печать', onclick: onOpen },
    node.kind === 'star' ? '★' : node.kind === 'bell' ? '♪' : String(node.slot));
  return h('div', { '--accent': node.accent },
    closeBtn(onClose),
    h('div', { class: 'envelope' },
      seal,
      h('p', { class: 'envelope-title' }, kickerFor(node)),
      h('p', { class: 'envelope-hint' }, 'Тапни по печати')));
}

/** Письмо шара. ctx: { content, state, now, onClose, onTeaser } */
export function letterView(node, ctx) {
  const f = (t) => fill(t, ctx.content);
  const letter = h('article', { class: `letter${node.dark ? ' dark' : ''}`, '--accent': node.accent });
  letter.append(
    h('p', { class: 'kicker' }, kickerFor(node)),
    h('h2', {}, f(node.title)),
    h('div', { class: 'hand' }, (node.letter || []).map((p) => h('p', {}, f(p)))),
    h('p', { class: 'signature' }, ctx.content.signature || ''),
  );

  if (node.inBox) letter.append(section('Что в коробке', h('p', { class: 'muted', style: { margin: 0 } }, f(node.inBox))));
  if (node.mission?.length) letter.append(section('Миссия вечера', h('ul', {}, node.mission.map((m) => h('li', {}, f(m))))));

  if (node.stakes) {
    const labels = node.stakesLabels || { him: 'Выиграешь ты', her: 'Выиграю я' };
    const box = h('div', {},
      h('div', { class: 'stakes' },
        h('div', { class: 'stake' }, h('b', {}, labels.him), f(node.stakes.him)),
        h('div', { class: 'stake' }, h('b', {}, labels.her), f(node.stakes.her))),
      node.stakesNote ? h('p', { class: 'stake-note' }, f(node.stakesNote)) : null);
    letter.append(section('Ставки', box));
  }

  if (node.quest) {
    letter.append(section(`Мини-квест · +${node.quest.reward} ❄`,
      h('div', { class: 'quest' }, h('span', {}, '🎯'), h('span', {}, f(node.quest.text)))));
  }

  if (node.quiz?.length) letter.append(section('Вопросы обо мне', quizView(node, ctx)));

  if ((ctx.state.codes || []).includes(node.id)) letter.append(section('🔑 Кодовое слово', codeForm(node, ctx)));

  const ny = ctx.content.newYearLetter;
  if (node.kind === 'star' && ny && isOpen(ny, ctx.now) && ny.text) {
    letter.append(section(ny.title || 'С Новым годом', h('div', { class: 'hand' }, ny.text.map((p) => h('p', {}, f(p))))));
  }

  const actions = h('div', { class: 'letter-actions' });
  const teaser = (ctx.state.teasers || []).find((t) => t.weekId === node.id && ctx.now >= new Date(t.revealAt) && teaserReady(t));
  if (teaser) actions.append(h('button', { class: 'btn btn-gold', onclick: () => ctx.onTeaser(teaser.id) }, '🎁 Подарок под ёлочкой'));
  actions.append(h('button', { class: 'btn btn-ghost', onclick: ctx.onClose }, 'К ёлке'));
  letter.append(actions);

  return h('div', {}, closeBtn(ctx.onClose), letter);
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
      h('legend', { style: { fontWeight: 700, marginBottom: '6px' } }, `${i + 1}. ${fill(q.q, ctx.content)}`),
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
