// Тизер под инеем: фото на нижнем canvas, иней на верхнем, стирается пальцем.

/** Рисует картинку с учётом EXIF-ориентации (1–8) в canvas заданного размера. */
export function drawOriented(canvas, img, orientation, cssW, cssH, dpr) {
  canvas.width = Math.round(cssW * dpr);
  canvas.height = Math.round(cssH * dpr);
  const ctx = canvas.getContext('2d');
  const iw = img.width, ih = img.height;
  const swap = orientation >= 5;
  const sx = canvas.width / (swap ? ih : iw);
  const sy = canvas.height / (swap ? iw : ih);
  ctx.save();
  ctx.scale(sx, sy);
  switch (orientation) {
    case 2: ctx.transform(-1, 0, 0, 1, iw, 0); break;
    case 3: ctx.transform(-1, 0, 0, -1, iw, ih); break;
    case 4: ctx.transform(1, 0, 0, -1, 0, ih); break;
    case 5: ctx.transform(0, 1, 1, 0, 0, 0); break;
    case 6: ctx.transform(0, 1, -1, 0, ih, 0); break;
    case 7: ctx.transform(0, -1, -1, 0, ih, iw); break;
    case 8: ctx.transform(0, -1, 1, 0, 0, iw); break;
    default: break;
  }
  ctx.drawImage(img, 0, 0);
  ctx.restore();
}

export function orientedSize(img, orientation) {
  return orientation >= 5 ? { w: img.height, h: img.width } : { w: img.width, h: img.height };
}

/**
 * Монтирует блок «фото под инеем».
 * opts: { revealed: bool, onReveal: fn, hint: el }
 */
export function mountScratch(box, img, orientation, opts = {}) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const { w: iw, h: ih } = orientedSize(img, orientation);
  const maxW = Math.min(box.parentElement.clientWidth, 520);
  const maxH = window.innerHeight * 0.64;
  const scale = Math.min(maxW / iw, maxH / ih);
  const cssW = Math.round(iw * scale), cssH = Math.round(ih * scale);
  box.style.width = cssW + 'px';
  box.style.height = cssH + 'px';
  box.replaceChildren();

  const photo = document.createElement('canvas');
  drawOriented(photo, img, orientation, cssW, cssH, dpr);
  photo.addEventListener('contextmenu', (e) => e.preventDefault());
  box.append(photo);

  if (opts.revealed) return;

  const frost = document.createElement('canvas');
  frost.className = 'frost';
  frost.setAttribute('aria-label', 'Иней — сотри пальцем');
  frost.width = photo.width; frost.height = photo.height;
  box.append(frost);
  paintFrost(frost, dpr);

  const ctx = frost.getContext('2d');
  ctx.globalCompositeOperation = 'destination-out';
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.lineWidth = 46 * dpr;
  let last = null, moves = 0, done = false;

  const pos = (e) => {
    const r = frost.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (frost.width / r.width), y: (e.clientY - r.top) * (frost.height / r.height) };
  };
  const stroke = (p) => {
    ctx.beginPath();
    ctx.moveTo(last ? last.x : p.x, last ? last.y : p.y);
    ctx.lineTo(p.x + 0.01, p.y);
    ctx.stroke();
    last = p;
    if (++moves % 12 === 0) check();
  };
  const check = () => {
    if (done) return;
    const data = ctx.getImageData(0, 0, frost.width, frost.height).data;
    let clear = 0, total = 0;
    for (let i = 3; i < data.length; i += 4 * 24) { total++; if (data[i] < 100) clear++; }
    if (clear / total > 0.55) reveal();
  };
  const reveal = () => {
    done = true;
    frost.classList.add('gone');
    setTimeout(() => frost.remove(), 1000);
    opts.onReveal?.();
  };

  let drawing = false;
  frost.addEventListener('pointerdown', (e) => {
    drawing = true; last = null;
    try { frost.setPointerCapture(e.pointerId); } catch { /* не критично */ }
    stroke(pos(e));
  });
  frost.addEventListener('pointermove', (e) => { if (drawing) stroke(pos(e)); });
  const end = () => { if (!drawing) return; drawing = false; last = null; check(); };
  frost.addEventListener('pointerup', end);
  frost.addEventListener('pointercancel', end);
  frost.addEventListener('lostpointercapture', end);
  // Клавиатура/доступность: Enter или пробел растапливает иней
  frost.tabIndex = 0;
  frost.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); reveal(); } });
}

function paintFrost(c, dpr) {
  const ctx = c.getContext('2d');
  const { width: w, height: h } = c;
  const g = ctx.createLinearGradient(0, 0, w, h);
  g.addColorStop(0, '#e9f1f7');
  g.addColorStop(0.5, '#c4d8e8');
  g.addColorStop(1, '#eef4f9');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, w, h);

  // зерно
  for (let i = 0; i < (w * h) / 180; i++) {
    ctx.fillStyle = `rgba(255,255,255,${Math.random() * 0.6})`;
    ctx.fillRect(Math.random() * w, Math.random() * h, dpr * (Math.random() * 2 + 0.5), dpr * (Math.random() * 2 + 0.5));
  }
  // ледяные узоры
  ctx.strokeStyle = 'rgba(255,255,255,.7)';
  ctx.lineCap = 'round';
  for (let k = 0; k < 14; k++) {
    let x = Math.random() * w, y = Math.random() * h, a = Math.random() * Math.PI * 2;
    ctx.lineWidth = dpr * (0.8 + Math.random());
    for (let j = 0; j < 7; j++) {
      const len = (20 + Math.random() * 40) * dpr;
      const nx = x + Math.cos(a) * len, ny = y + Math.sin(a) * len;
      ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(nx, ny); ctx.stroke();
      for (const side of [-1, 1]) {
        const ba = a + side * 0.7;
        ctx.beginPath(); ctx.moveTo((x + nx) / 2, (y + ny) / 2);
        ctx.lineTo((x + nx) / 2 + Math.cos(ba) * len * 0.4, (y + ny) / 2 + Math.sin(ba) * len * 0.4); ctx.stroke();
      }
      x = nx; y = ny; a += (Math.random() - 0.5) * 1.2;
    }
  }
  // подпись
  ctx.fillStyle = 'rgba(30,55,80,.55)';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `${Math.round(30 * dpr)}px "Marck Script", cursive`;
  ctx.fillText('Сотри иней ✨', w / 2, h / 2);
}
