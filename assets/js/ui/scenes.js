// Фоновые сцены писем (под оверлеем). Сейчас одна: подводный мир для шара 1.
const SCENES = { sea: seaScene };
let current = null;

/** Включает сцену name (или выключает, если name пустой). overlay — прокручиваемый оверлей. */
export function setScene(name, overlay) {
  if (current?.name === name) return;
  current?.destroy();
  current = null;
  overlay.classList.remove('has-scene');
  if (!name || !SCENES[name]) return;
  overlay.classList.add('has-scene');
  current = { name, ...SCENES[name](overlay) };
}

function seaScene(overlay) {
  const root = document.createElement('div');
  root.className = 'sea-scene';
  root.setAttribute('aria-hidden', 'true');
  // Лучи света сверху
  root.insertAdjacentHTML('beforeend', '<div class="sea-rays"></div>');
  // Пузырьки: два одинаковых «листа» друг под другом — при прокрутке едут вверх бесшовно
  const layer = document.createElement('div');
  layer.className = 'sea-bubbles';
  const tile = document.createElement('div');
  tile.className = 'sea-tile';
  let seed = 7;
  const rnd = () => ((seed = (seed * 9301 + 49297) % 233280) / 233280);
  for (let i = 0; i < 22; i++) {
    const b = document.createElement('span');
    const size = 4 + rnd() * 14;
    b.style.cssText = `left:${rnd() * 100}%;top:${rnd() * 100}%;width:${size}px;height:${size}px;animation-duration:${5 + rnd() * 6}s;animation-delay:${-rnd() * 6}s`;
    tile.append(b);
  }
  layer.append(tile, tile.cloneNode(true));
  root.append(layer);
  // Водоросли по бокам
  const weed = (cls, color, d) => `<svg class="sea-weed ${cls}" viewBox="0 0 60 220" preserveAspectRatio="xMidYMax meet"><path d="${d}" fill="none" stroke="${color}" stroke-width="10" stroke-linecap="round"/></svg>`;
  root.insertAdjacentHTML('beforeend',
    weed('w1', '#1D9E75', 'M30 220 Q10 180 30 150 Q50 120 30 90 Q12 62 30 30') +
    weed('w2', '#0F6E56', 'M30 220 Q50 190 30 160 Q12 132 30 104 Q46 80 32 56') +
    weed('w3', '#5DCAA5', 'M30 220 Q14 196 30 172 Q46 150 30 128') +
    weed('w4', '#1D9E75', 'M30 220 Q48 186 30 154 Q12 124 30 96 Q46 70 30 40'));
  document.body.append(root);

  const onScroll = () => {
    const H = tile.offsetHeight || window.innerHeight;
    layer.style.transform = `translateY(${-((overlay.scrollTop * 0.6) % H)}px)`;
  };
  overlay.addEventListener('scroll', onScroll, { passive: true });
  return { destroy() { overlay.removeEventListener('scroll', onScroll); root.remove(); } };
}
