// Серверное время: берём заголовок Date у собственного хостинга, а не часы телефона.

const PREVIEW_FLAG = 'advent.admin';
let offset = 0;          // serverNow - Date.now()
let skew = 0;            // |часы устройства - сервер|, мс
let preview = null;      // Date для режима предпросмотра

function isAdmin() {
  try { return localStorage.getItem(PREVIEW_FLAG) === '1'; } catch { return false; }
}

function parsePreview() {
  const raw = new URLSearchParams(location.search).get('now');
  if (!raw || !isAdmin()) return null;
  let s = raw.trim();
  if (s.length <= 10) s += 'T12:00:00';
  else if (/T\d\d:\d\d$/.test(s)) s += ':00'; // Safari не понимает время без секунд
  const withTz = /[zZ]$|[+-]\d\d:?\d\d$/.test(s) ? s : s + '+03:00';
  const d = new Date(withTz);
  return isNaN(d) ? null : d;
}

export async function syncTime() {
  preview = parsePreview();
  try {
    const t0 = Date.now();
    const res = await fetch('./data/kdf.json?ts=' + t0, { method: 'HEAD', cache: 'no-store' });
    const t1 = Date.now();
    const h = res.headers.get('Date');
    if (h) {
      const server = new Date(h).getTime() + 500; // Date округлён до секунды
      offset = server - (t0 + t1) / 2;
      skew = Math.abs(offset);
    }
  } catch { /* офлайн: остаёмся на часах устройства */ }
}

let previewStartedAt = Date.now();
export function now() {
  if (preview) return new Date(preview.getTime() + (Date.now() - previewStartedAt));
  return new Date(Date.now() + offset);
}

export const isPreview = () => !!preview;
export const clockSkewed = () => !preview && skew > 10 * 60 * 1000;

export function startAutoSync() {
  previewStartedAt = Date.now();
  setInterval(syncTime, 10 * 60 * 1000);
}

export function formatCountdown(ms) {
  if (ms <= 0) return 'уже!';
  const total = Math.floor(ms / 1000);
  const d = Math.floor(total / 86400);
  const h = Math.floor((total % 86400) / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const p = (n) => String(n).padStart(2, '0');
  if (d > 0) return `${d} д ${p(h)} ч ${p(m)} м ${p(s)} с`;
  if (h > 0) return `${h} ч ${p(m)} м ${p(s)} с`;
  return `${m} м ${p(s)} с`;
}

export function formatDate(iso) {
  const d = new Date(iso);
  // Показываем по Москве (UTC+3, без перехода на летнее время)
  const msk = new Date(d.getTime() + 3 * 3600 * 1000);
  const dd = String(msk.getUTCDate()).padStart(2, '0');
  const mo = String(msk.getUTCMonth() + 1).padStart(2, '0');
  return `${dd}.${mo}`;
}
