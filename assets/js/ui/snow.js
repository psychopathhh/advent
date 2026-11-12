// Мягкий снег на фоне. При prefers-reduced-motion — статичные снежинки.
export function startSnow(canvas) {
  const ctx = canvas.getContext('2d');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let w = 0, h = 0, dpr = 1, flakes = [], raf = 0, last = 0;

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    w = canvas.clientWidth; h = canvas.clientHeight;
    canvas.width = w * dpr; canvas.height = h * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const n = Math.min(60, Math.round(w / 7));
    flakes = Array.from({ length: n }, () => make(true));
    if (reduce) draw(0);
  }

  function make(anywhere) {
    const r = Math.random() * 2.2 + 0.6;
    return {
      x: Math.random() * w,
      y: anywhere ? Math.random() * h : -10,
      r,
      vy: 10 + r * 9 + Math.random() * 8,
      sway: Math.random() * Math.PI * 2,
      swaySpeed: 0.4 + Math.random() * 0.8,
      a: 0.35 + Math.random() * 0.5,
    };
  }

  function draw(dt) {
    ctx.clearRect(0, 0, w, h);
    for (const f of flakes) {
      if (dt) {
        f.y += f.vy * dt;
        f.sway += f.swaySpeed * dt;
        f.x += Math.sin(f.sway) * 12 * dt;
        if (f.y > h + 10) Object.assign(f, make(false));
      }
      ctx.globalAlpha = f.a;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fillStyle = '#F5F1EA';
      ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function loop(t) {
    const dt = last ? Math.min((t - last) / 1000, 0.05) : 0;
    last = t;
    draw(dt);
    raf = requestAnimationFrame(loop);
  }

  addEventListener('resize', resize);
  document.addEventListener('visibilitychange', () => {
    if (reduce) return;
    if (document.hidden) { cancelAnimationFrame(raf); last = 0; } else raf = requestAnimationFrame(loop);
  });
  resize();
  if (!reduce) raf = requestAnimationFrame(loop);
}
