// SVG-ёлка: шары, колокольчик, звезда, гирлянда, подарки и Хранитель.
import { s, mix } from './dom.js';
import { formatDate } from '../time.js';

// Позиции в viewBox 0 0 360 500 (спираль снизу вверх)
const POS = {
  1: { x: 112, y: 352, r: 21 },
  2: { x: 248, y: 320, r: 21 },
  0: { x: 172, y: 272, r: 14 },   // колокольчик-пауза
  3: { x: 122, y: 232, r: 20 },
  4: { x: 236, y: 192, r: 19 },
  5: { x: 158, y: 132, r: 17 },
  6: { x: 180, y: 40, r: 26 },    // звезда
};
const GIFT_SPOTS = [
  { x: 96, y: 428, w: 38, h: 30 }, { x: 236, y: 430, w: 34, h: 28 }, { x: 140, y: 438, w: 30, h: 24 },
  { x: 274, y: 436, w: 30, h: 24 }, { x: 56, y: 440, w: 30, h: 22 }, { x: 196, y: 444, w: 28, h: 22 },
];

/**
 * nodes: [{ id, kind: 'ball'|'bell'|'star', slot, opensAt, accent, status: 'locked'|'new'|'open', label }]
 * gifts: [{ id, accent, isNew }]
 * mascot: { arrived: bool, name? }
 * sky: { visible: bool, p: 0..1 } — луна и солнце (парные браслеты), сближаются к Новому году
 */
export function renderTree(svg, { nodes, gifts, mascot, sky }) {
  svg.replaceChildren();
  // с луной и солнцем над ёлкой нужно больше неба
  svg.setAttribute('viewBox', sky?.visible ? '0 -44 360 544' : '0 0 360 500');
  const defs = s('defs', {},
    s('linearGradient', { id: 'g-pine', x1: '0', y1: '0', x2: '0', y2: '1' },
      s('stop', { offset: '0', 'stop-color': '#1f5a45' }),
      s('stop', { offset: '1', 'stop-color': '#0f2e25' })),
    s('linearGradient', { id: 'g-pine-hi', x1: '0', y1: '0', x2: '1', y2: '0' },
      s('stop', { offset: '0', 'stop-color': '#fff', 'stop-opacity': '0' }),
      s('stop', { offset: '.5', 'stop-color': '#fff', 'stop-opacity': '.06' }),
      s('stop', { offset: '1', 'stop-color': '#fff', 'stop-opacity': '0' })),
    s('radialGradient', { id: 'g-ground', cx: '50%', cy: '50%', r: '50%' },
      s('stop', { offset: '0', 'stop-color': '#F5F1EA', 'stop-opacity': '.22' }),
      s('stop', { offset: '1', 'stop-color': '#F5F1EA', 'stop-opacity': '0' })),
    s('radialGradient', { id: 'g-star', cx: '45%', cy: '40%', r: '60%' },
      s('stop', { offset: '0', 'stop-color': '#fff6dc' }),
      s('stop', { offset: '.5', 'stop-color': '#E8C27A' }),
      s('stop', { offset: '1', 'stop-color': '#a8792e' })),
    s('filter', { id: 'f-glow', x: '-50%', y: '-50%', width: '200%', height: '200%' },
      s('feGaussianBlur', { stdDeviation: '2.2', result: 'b' }),
      s('feMerge', {}, s('feMergeNode', { in: 'b' }), s('feMergeNode', { in: 'SourceGraphic' }))),
    s('filter', { id: 'f-sky', x: '-120%', y: '-120%', width: '340%', height: '340%' },
      s('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: '5', result: 'b1' }),
      s('feGaussianBlur', { in: 'SourceGraphic', stdDeviation: '1.8', result: 'b2' }),
      s('feMerge', {}, s('feMergeNode', { in: 'b1' }), s('feMergeNode', { in: 'b1' }), s('feMergeNode', { in: 'b2' }), s('feMergeNode', { in: 'SourceGraphic' }))),
    s('mask', { id: 'm-crescent', maskUnits: 'userSpaceOnUse', x: -30, y: -30, width: 60, height: 60 },
      s('rect', { x: -30, y: -30, width: 60, height: 60, fill: '#fff' }),
      s('circle', { cx: 6.4, cy: -4, r: 10, fill: '#000' })),
    s('filter', { id: 'f-soft', x: '-80%', y: '-80%', width: '260%', height: '260%' },
      s('feGaussianBlur', { stdDeviation: '7' })),
  );
  svg.append(defs);

  // Земля и ствол
  svg.append(
    s('ellipse', { cx: 180, cy: 440, rx: 175, ry: 34, fill: 'url(#g-ground)' }),
    s('rect', { x: 166, y: 388, width: 28, height: 34, rx: 3, fill: '#4a2f1d' }),
  );

  // Ярусы ёлки (с фестонами по низу)
  const tiers = [
    { top: 58, bottom: 172, half: 66 },
    { top: 118, bottom: 272, half: 98 },
    { top: 205, bottom: 392, half: 132 },
  ];
  for (const t of tiers) {
    const L = 180 - t.half, R = 180 + t.half, n = 5, step = (R - L) / n;
    let d = `M180 ${t.top} L${R} ${t.bottom}`;
    for (let i = n; i > 0; i--) {
      const x1 = L + step * (i - 1);
      d += ` Q${x1 + step / 2} ${t.bottom + 12} ${x1} ${t.bottom}`;
    }
    d += ' Z';
    svg.append(s('path', { d, fill: 'url(#g-pine)' }));
    svg.append(s('path', { d, fill: 'url(#g-pine-hi)' }));
    // снежная кромка
    let snow = `M${L + 6} ${t.bottom - 2}`;
    for (let i = 0; i < n; i++) {
      const x0 = L + step * i;
      snow += ` Q${x0 + step / 2} ${t.bottom + 9} ${x0 + step} ${t.bottom - 2}`;
    }
    svg.append(s('path', { d: snow, fill: 'none', stroke: '#F5F1EA', 'stroke-width': 3, 'stroke-linecap': 'round', opacity: '.35' }));
  }

  // Гирлянда: сегмент i ведёт к узлу i и горит, если узел открыт
  const order = [...nodes].sort((a, b) => a.opensAt.localeCompare(b.opensAt));
  let prev = { x: 64, y: 378 };
  for (const n of order) {
    const p = POS[n.slot];
    const to = { x: p.x, y: n.kind === 'star' ? p.y + 30 : p.y - p.r - 6 };
    const cx = (prev.x + to.x) / 2, cy = Math.max(prev.y, to.y) + 16;
    svg.append(s('path', { class: `garland ${n.status === 'locked' ? 'off' : 'on'}`, d: `M${prev.x} ${prev.y} Q${cx} ${cy} ${to.x} ${to.y}` }));
    prev = to;
  }

  // Подарки под ёлкой
  gifts.slice(-GIFT_SPOTS.length).forEach((g, i) => svg.append(giftEl(g, GIFT_SPOTS[i])));

  // Луна и солнце в небе
  if (sky?.visible) svg.append(skyEl(sky.p));

  // Хранитель
  svg.append(mascotEl(mascot));

  // Узлы поверх
  for (const n of order) svg.append(nodeEl(n));
}

function nodeEl(n) {
  const p = POS[n.slot];
  const g = s('g', {
    class: `node is-${n.status}`, 'data-node': n.id, tabindex: 0, role: 'button',
    'aria-label': n.label, transform: `translate(${p.x} ${p.y})`,
  });
  const accent = n.accent || '#E8C27A';

  if (n.kind === 'star') {
    const star = starPath(p.r, p.r * 0.45);
    g.append(s('path', { class: 'glow', d: starPath(p.r + 10, (p.r + 10) * 0.45), fill: '#E8C27A', filter: 'url(#f-soft)', opacity: n.status === 'locked' ? 0 : 0.6 }));
    const sw = s('g', { class: 'swing' });
    const art = s('g', { class: 'ball-art' });
    art.append(s('path', { class: 'ball-body', d: star, fill: n.status === 'locked' ? '#cfdbe6' : 'url(#g-star)', stroke: '#fff', 'stroke-opacity': '.5', 'stroke-width': 1 }));
    if (n.status === 'locked') art.append(s('path', { d: star, fill: '#BFD7EA', opacity: '.45' }));
    sw.append(art);
    g.append(sw);
    g.append(s('text', { class: 'node-date', y: p.r + 18 }, formatDate(n.opensAt)));
    return g;
  }

  const gradId = `g-ball-${n.id}`;
  g.append(s('defs', {}, s('radialGradient', { id: gradId, cx: '35%', cy: '32%', r: '75%' },
    s('stop', { offset: '0', 'stop-color': mix(accent, '#ffffff', 0.75) }),
    s('stop', { offset: '.35', 'stop-color': accent }),
    s('stop', { offset: '1', 'stop-color': mix(accent, '#000000', 0.55) }))));

  // Нить сверху
  g.append(s('line', { x1: 0, y1: -p.r - 14, x2: 0, y2: -p.r, stroke: '#E8C27A', 'stroke-width': 1.2, opacity: '.8' }));
  g.append(s('circle', { class: 'glow', r: p.r + 9, fill: accent, filter: 'url(#f-soft)', opacity: n.status === 'locked' ? 0 : 0.55 }));

  // Точка подвеса — верх нити: внешний g сдвигает начало координат туда, внутренний качается вокруг него
  const pivot = s('g', { transform: `translate(0 ${-p.r - 14})` });
  const sw = s('g', { class: 'swing' });
  const art = s('g', { class: 'ball-art', transform: `translate(0 ${p.r + 14})` });

  if (n.kind === 'bell') {
    const r = p.r;
    const bell = `M${-r} ${r * 0.7} Q${-r} ${-r * 0.9} 0 ${-r} Q${r} ${-r * 0.9} ${r} ${r * 0.7} L${r * 1.15} ${r} L${-r * 1.15} ${r} Z`;
    art.append(s('path', { class: 'ball-body', d: bell, fill: `url(#${gradId})` }));
    art.append(s('circle', { cx: 0, cy: r * 1.15, r: r * 0.28, fill: mix(accent, '#000', 0.4) }));
    if (n.status === 'locked') art.append(s('path', { d: bell, fill: '#BFD7EA', opacity: '.5' }));
  } else {
    art.append(s('rect', { x: -5, y: -p.r - 5, width: 10, height: 7, rx: 2, fill: '#E8C27A' }));
    art.append(s('circle', { class: 'ball-body', r: p.r, fill: `url(#${gradId})` }));
    const pat = n.pattern && PATTERNS[n.pattern];
    if (pat) {
      const clip = `c-ball-${n.id}`;
      g.querySelector('defs').append(s('clipPath', { id: clip }, s('circle', { r: p.r })));
      const layer = s('g', { 'clip-path': `url(#${clip})` });
      pat(layer, p.r, n);
      art.append(layer);
    }
    const topDeco = n.pattern && PATTERN_TOP[n.pattern];
    art.append(s('ellipse', { cx: -p.r * 0.35, cy: -p.r * 0.4, rx: p.r * 0.28, ry: p.r * 0.16, fill: '#fff', opacity: '.55', transform: 'rotate(-30)' }));
    if (topDeco) topDeco(art, p.r);
    if (n.status === 'locked') {
      art.append(s('circle', { r: p.r, fill: '#BFD7EA', opacity: '.5' }));
      art.append(s('path', { d: snowflakePath(p.r * 0.5), stroke: '#fff', 'stroke-width': 1.6, 'stroke-linecap': 'round', fill: 'none', opacity: '.85' }));
    } else {
      if (pat && n.pattern === 'trio') {
        art.append(s('circle', { r: p.r * 0.1, fill: '#E8C27A' })); // центр, где сходятся сектора
      } else {
        art.append(s('text', { y: p.r * 0.34, 'text-anchor': 'middle', 'font-family': 'Cormorant Garamond, serif', 'font-weight': 700, 'font-size': p.r * 0.95, fill: '#fff', opacity: '.9' }, String(n.slot)));
      }
    }
  }
  sw.append(art);
  pivot.append(sw);
  g.append(pivot);
  g.append(s('text', { class: 'node-date', y: p.r + (n.kind === 'bell' ? 26 : 16) }, formatDate(n.opensAt)));
  return g;
}

// Узоры шаров (рисуются внутри круга радиуса r, обрезаются по нему)
const PATTERNS = {
  // Шар 2 «Зефиркааа»: ярко-бирюзовый горошек на лиловом
  polka(g, r) {
    const k = r / 46;
    const art = s('g', { transform: `scale(${k})`, fill: '#1DE9D3' });
    for (const [x, y, rr] of [[-24, -26, 3.4], [6, -32, 3], [30, -18, 3.4], [-36, -4, 3], [-10, -8, 3.6], [18, 2, 3.4], [40, 10, 2.8],
      [-26, 18, 3.4], [2, 22, 3.2], [28, 30, 3], [-12, 38, 2.8], [-40, 30, 2.4], [14, -16, 2.4]]) art.append(s('circle', { cx: x, cy: y, r: rr }));
    g.append(art);
  },
  // Шар 3 «Нуар»: кинохлопушка — чёрный шар, сверху белая планка с косыми полосами
  clapper(g, r) {
    const top = -r * 0.3;
    g.append(s('rect', { x: -r, y: -r, width: 2 * r, height: 2 * r, fill: '#161616' }));
    g.append(s('rect', { x: -r, y: -r, width: 2 * r, height: r + top, fill: '#f2f2f2' }));
    const w = r * 0.38;
    for (let x = -r - w; x < r + w; x += w * 2) {
      g.append(s('path', { d: `M${x} ${-r} L${x + w} ${-r} L${x + w * 2} ${top} L${x + w} ${top} Z`, fill: '#161616' }));
    }
    g.append(s('rect', { x: -r, y: top, width: 2 * r, height: r * 0.1, fill: '#8a8a8a' }));
  },
  // Шар 5: три сектора — «Дурак» (сукно ♠), «Морской бой», «Кто я?». Сектор светлеет, когда по игре есть результат
  trio(g, r, n) {
    const a = (deg) => [r * 1.2 * Math.cos((deg - 90) * Math.PI / 180), r * 1.2 * Math.sin((deg - 90) * Math.PI / 180)];
    const sector = (from, to, fill) => {
      const [x1, y1] = a(from), [x2, y2] = a(to);
      return s('path', { d: `M0 0 L${x1} ${y1} A${r * 1.2} ${r * 1.2} 0 0 1 ${x2} ${y2} Z`, fill });
    };
    const played = new Set(n.played || []);
    const parts = [
      { id: 'cards', from: 0, to: 120, fill: '#1f5e3b', icon: () => s('text', { x: r * 0.45, y: -r * 0.02, 'text-anchor': 'middle', 'font-size': r * 0.75, fill: '#F5F1EA' }, '♠') },
      { id: 'sea', from: 120, to: 240, fill: '#1d3b6e', icon: () => s('path', { d: `M${-r * 0.2} ${r * 0.32} l${r * 0.4} ${r * 0.4} M${r * 0.2} ${r * 0.32} l${-r * 0.4} ${r * 0.4}`, stroke: '#E24B4A', 'stroke-width': r * 0.14, 'stroke-linecap': 'round' }) },
      { id: 'who', from: 240, to: 360, fill: '#F2DCC9', icon: () => s('text', { x: -r * 0.45, y: r * 0.06, 'text-anchor': 'middle', 'font-size': r * 0.85, 'font-family': 'Cormorant Garamond, serif', 'font-weight': 700, fill: '#5a2d0c' }, '?') },
    ];
    for (const p of parts) {
      g.append(sector(p.from, p.to, p.fill), p.icon());
      if (!played.has(p.id)) {
        const dim = sector(p.from, p.to, '#0b1220');
        dim.setAttribute('opacity', '.3');
        g.append(dim);
      }
    }
    for (const deg of [0, 120, 240]) {
      const [x, y] = a(deg);
      g.append(s('line', { x1: 0, y1: 0, x2: x, y2: y, stroke: '#E8C27A', 'stroke-width': 0.9 }));
    }
  },
};

// Украшения поверх шара (не обрезаются по кругу)
const PATTERN_TOP = {
  // бант у ушка шара 2
  polka(g, r) {
    const k = r / 46, y = -r - 1;
    const bow = s('g', { transform: `translate(0 ${y}) scale(${k})`, fill: '#1DE9D3' },
      s('path', { d: 'M0 0 L-18 -9 L-18 9Z' }), s('path', { d: 'M0 0 L18 -9 L18 9Z' }),
      s('circle', { r: 5, fill: '#12C4B2' }));
    g.append(bow);
  },
};

function giftEl(gift, spot) {
  const { x, y, w, h } = spot;
  const c = gift.accent || '#E8C27A';
  const g = s('g', { class: `gift${gift.isNew ? ' is-new' : ''}`, 'data-gift': gift.id, tabindex: 0, role: 'button', 'aria-label': gift.isNew ? 'Новый подарок под ёлкой' : 'Подарок под ёлкой' });
  const top = y - h;
  g.append(
    s('rect', { x: x - w / 2, y: top, width: w, height: h, rx: 3, fill: c }),
    s('rect', { x: x - w / 2, y: top, width: w, height: h, rx: 3, fill: '#000', opacity: '.12' }),
    s('rect', { x: x - w / 2 - 2, y: top - 6, width: w + 4, height: 8, rx: 2, fill: mix(c, '#ffffff', 0.15) }),
    s('rect', { x: x - 3, y: top - 6, width: 6, height: h + 6, fill: '#F5F1EA', opacity: '.9' }),
    s('ellipse', { cx: x - 7, cy: top - 9, rx: 7, ry: 4.5, fill: 'none', stroke: '#F5F1EA', 'stroke-width': 2.5 }),
    s('ellipse', { cx: x + 7, cy: top - 9, rx: 7, ry: 4.5, fill: 'none', stroke: '#F5F1EA', 'stroke-width': 2.5 }),
  );
  if (gift.isNew) {
    g.append(
      s('rect', { x: x - 20, y: y + 6, width: 40, height: 15, rx: 7.5, fill: '#E8C27A' }),
      s('text', { class: 'badge-new', x, y: y + 16.5, 'text-anchor': 'middle' }, 'Новое'),
    );
  }
  return g;
}

// Луна (у неё) слева, солнце (у него) справа. p: 0 — по краям неба (29.11), 1 — встретились над звездой (31.12)
function skyEl(p) {
  const lerp = (a, b) => a + (b - a) * p;
  const lift = Math.sin(p * Math.PI) * 8; // идут по дуге
  const y = lerp(76, -14) - lift;
  const met = p >= 1;
  const g = s('g', { class: `sky${met ? ' met' : ''}`, 'data-sky': '1', role: 'button', tabindex: 0, 'aria-label': met ? 'Луна и солнце встретились' : 'Луна и солнце' });
  // солнце
  const sun = s('g', { transform: `translate(${lerp(326, 191)} ${y})`, class: 'sky-sun' });
  const sunGlow = s('g', { filter: 'url(#f-sky)', class: 'sky-glow' },
    s('path', { d: 'M0 -14v-5M0 14v5M-14 0h-5M14 0h5M10 -10l3.5 -3.5M-10 10l-3.5 3.5M10 10l3.5 3.5M-10 -10l-3.5 -3.5', stroke: '#F6C453', 'stroke-width': 2.2, 'stroke-linecap': 'round' }),
    s('circle', { r: 9.5, fill: '#F6C453' }));
  sun.append(s('circle', { r: 22, fill: 'transparent' }), sunGlow, s('circle', { r: 9.5, fill: 'none', stroke: '#E89B2C', 'stroke-width': 1 }));
  // луна — белый полумесяц рожками к солнцу
  const moon = s('g', { transform: `translate(${lerp(34, 170)} ${y})`, class: 'sky-moon' });
  moon.append(s('circle', { r: 20, fill: 'transparent' }),
    s('g', { filter: 'url(#f-sky)', class: 'sky-glow' }, s('circle', { r: 12, fill: '#ffffff', mask: 'url(#m-crescent)' })));
  g.append(sun, moon);
  if (met) {
    g.append(s('path', { class: 'sky-heart', d: `M180 ${y - 18} c-3 -4 -9 -1 -6 4 l6 6 l6 -6 c3 -5 -3 -8 -6 -4z`, fill: '#C8102E' }));
  }
  return g;
}

function mascotEl(m) {
  // Внешний g ставит на место, внутренний анимируется (CSS-transform иначе затрёт атрибут transform)
  const outer = s('g', {
    'data-mascot': '1', transform: 'translate(318 418)', class: 'mascot',
    role: 'button', tabindex: 0, 'aria-label': m.arrived ? `Мишка-талисман ${m.name || ''}` : 'Сугроб',
  });
  const g = s('g', { class: m.arrived ? 'mascot-body is-here' : 'mascot-body' });
  outer.append(g);

  if (!m.arrived) {
    // Сугроб с искорками: здесь скоро кто-то поселится
    g.append(
      s('path', { d: 'M-30 14 Q-26 -6 -10 -4 Q-4 -18 10 -10 Q24 -12 30 14 Z', fill: '#e7eef5', opacity: '.9' }),
      s('path', { d: 'M-30 14 Q-26 -6 -10 -4 Q-4 -18 10 -10 Q24 -12 30 14 Z', fill: '#BFD7EA', opacity: '.35' }),
      s('path', { class: 'sparkle', d: 'M-8 -24 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z', fill: '#E8C27A' }),
      s('path', { class: 'sparkle s2', d: 'M14 -30 l1.4 3.5 3.5 1.4 -3.5 1.4 -1.4 3.5 -1.4 -3.5 -3.5 -1.4 3.5 -1.4z', fill: '#F5F1EA' }),
    );
    return outer;
  }

  // Мишка в красном шарфике
  const fur = '#c08a5b', dark = '#8a5a35', light = '#ecc9a2';
  g.append(
    s('ellipse', { cx: 0, cy: 16, rx: 26, ry: 5, fill: '#000', opacity: '.25' }),
    // тело и лапки
    s('ellipse', { cx: 0, cy: 0, rx: 19, ry: 17, fill: fur }),
    s('ellipse', { cx: 0, cy: 3, rx: 11, ry: 10, fill: light }),
    s('ellipse', { cx: -16, cy: -2, rx: 6, ry: 9, fill: fur, transform: 'rotate(25 -16 -2)' }),
    s('ellipse', { cx: 16, cy: -2, rx: 6, ry: 9, fill: fur, transform: 'rotate(-25 16 -2)' }),
    s('ellipse', { cx: -10, cy: 14, rx: 8, ry: 5.5, fill: fur }),
    s('ellipse', { cx: 10, cy: 14, rx: 8, ry: 5.5, fill: fur }),
    s('circle', { cx: -10, cy: 14.5, r: 3, fill: light }),
    s('circle', { cx: 10, cy: 14.5, r: 3, fill: light }),
    // шарф
    s('path', { d: 'M-15 -14 Q0 -8 15 -14 L15 -9 Q0 -3 -15 -9 Z', fill: '#c8243a' }),
    s('path', { d: 'M7 -10 l5 14 -6 1 -3 -13 z', fill: '#a81c30' }),
    // голова
    s('circle', { cx: -12, cy: -36, r: 6.5, fill: fur }),
    s('circle', { cx: 12, cy: -36, r: 6.5, fill: fur }),
    s('circle', { cx: -12, cy: -36, r: 3.2, fill: light }),
    s('circle', { cx: 12, cy: -36, r: 3.2, fill: light }),
    s('circle', { cx: 0, cy: -26, r: 15, fill: fur }),
    s('ellipse', { cx: 0, cy: -21, rx: 7, ry: 5.5, fill: light }),
    s('ellipse', { cx: 0, cy: -23, rx: 2.6, ry: 1.9, fill: '#3a2414' }),
    s('path', { d: 'M-2.5 -19.5 Q0 -17.5 2.5 -19.5', stroke: '#3a2414', 'stroke-width': 1, fill: 'none', 'stroke-linecap': 'round' }),
    s('circle', { cx: -5.5, cy: -29, r: 1.8, fill: '#2a1a10' }),
    s('circle', { cx: 5.5, cy: -29, r: 1.8, fill: '#2a1a10' }),
    s('circle', { cx: -4.9, cy: -29.6, r: 0.6, fill: '#fff' }),
    s('circle', { cx: 6.1, cy: -29.6, r: 0.6, fill: '#fff' }),
    s('ellipse', { cx: -9, cy: -23, rx: 2.4, ry: 1.4, fill: '#e88a8a', opacity: '.6' }),
    s('ellipse', { cx: 9, cy: -23, rx: 2.4, ry: 1.4, fill: '#e88a8a', opacity: '.6' }),
    s('path', { d: 'M-6 -3 Q0 0 6 -3', stroke: dark, 'stroke-width': 1, fill: 'none', opacity: '.5' }),
  );
  if (m.name) outer.append(s('text', { class: 'node-date', y: 32 }, m.name));
  return outer;
}

function starPath(R, r) {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const rad = i % 2 ? r : R;
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    d += (i ? 'L' : 'M') + (Math.cos(a) * rad).toFixed(2) + ' ' + (Math.sin(a) * rad).toFixed(2);
  }
  return d + 'Z';
}

function snowflakePath(r) {
  let d = '';
  for (let i = 0; i < 3; i++) {
    const a = (i * Math.PI) / 3;
    const dx = Math.cos(a) * r, dy = Math.sin(a) * r;
    d += `M${-dx} ${-dy}L${dx} ${dy}`;
  }
  return d;
}
