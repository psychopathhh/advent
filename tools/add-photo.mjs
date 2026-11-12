// Добавляет тизер-фото под ёлочку (альтернатива админке, работает с компьютера).
//
//   node tools/add-photo.mjs --week w1 --file content/photos/pink.jpg
//   node tools/add-photo.mjs --week w2 --file фото.jpg --reveal 2026-11-18T19:00
//   node tools/add-photo.mjs --list
//   node tools/add-photo.mjs --remove <id>
//
// Фото: JPEG или PNG. EXIF (в том числе геометка) вырезается, ориентация сохраняется.
import { readFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { p, crypto as C, mainKey, readState, writeState, writeBin, fail, args } from './lib.mjs';

const a = args();
const { key } = await mainKey();
const state = await readState(key);

if (a.list) {
  if (!state.teasers.length) console.log('Под ёлочкой пока пусто.');
  for (const t of state.teasers) console.log(`${t.id}  неделя ${t.weekId}  режим ${t.mode}  показ с ${t.revealAt}`);
  process.exit(0);
}

if (a.remove) {
  const t = state.teasers.find((x) => x.id === a.remove);
  if (!t) fail('Нет тизера с id ' + a.remove);
  state.teasers = state.teasers.filter((x) => x !== t);
  await rm(p('data', 'media', t.media + '.bin'), { force: true });
  await rm(p('data', 'media', t.media + '.full.bin'), { force: true });
  await writeState(key, state);
  console.log('✔ Тизер удалён.');
  process.exit(0);
}

if (!a.week || !a.file) fail('Нужно указать --week (например w1) и --file путь/к/фото.jpg');
if (!existsSync(a.file)) fail('Файл не найден: ' + a.file);

const content = JSON.parse(await readFile(p('content', 'content.json'), 'utf8'));
const all = [...content.weeks, content.finale];
const week = all.find((w) => w.id === a.week);
if (!week) fail(`Нет недели ${a.week}. Есть: ${all.map((w) => w.id).join(', ')}`);

const mode = a.mode || 'open';
if (mode !== 'open') fail('Режим «силуэт» с кодовым словом появится вместе с админкой (этап 1). Пока только --mode open.');

const src = new Uint8Array(await readFile(a.file));
const { bytes, mime, orientation } = cleanImage(src);
if (bytes.length > 4 * 1024 * 1024) console.warn('⚠ Фото больше 4 МБ — будет долго грузиться. Лучше уменьшить до ~1600 px по длинной стороне.');

const revealAt = !a.reveal || a.reveal === 'now'
  ? new Date().toISOString()
  : new Date(/[zZ]|[+-]\d\d:?\d\d$/.test(a.reveal) ? a.reveal : a.reveal + '+03:00').toISOString();
if (new Date(revealAt) > new Date(Date.now() + 2 * 60 * 1000)) fail('Подарок «на потом» загружай через админку — она его запечатает до даты. Здесь можно только --reveal now.');

const id = C.randomId(6);
await writeBin(p('data', 'media', id + '.bin'), await C.encryptBytes(key, bytes));
state.teasers.push({
  id: 't_' + id, weekId: week.id, media: id, mime, orientation, mode,
  revealAt, lookId: a.look || week.lookId || null, caption: a.caption || null,
});
await writeState(key, state);

console.log(`✔ Подарок под ёлочкой: неделя ${week.id}, показ с ${revealAt}, ${(bytes.length / 1024).toFixed(0)} КБ, EXIF удалён.`);
console.log('  Не забудь закоммитить папку data/ — тогда фото появится на сайте.');

// ───────────────────────── очистка метаданных ─────────────────────────

function cleanImage(buf) {
  const ftyp = String.fromCharCode(...buf.subarray(4, 12));
  if (/^ftyp(heic|heix|mif1|msf1|hevc|avif)/.test(ftyp)) {
    fail('Это HEIC/AVIF. Сохрани фото как JPEG (на iPhone: Настройки → Камера → Форматы → «Наиболее совместимый», или отправь себе фото в Telegram как файл).');
  }
  if (buf[0] === 0xff && buf[1] === 0xd8) return { ...cleanJpeg(buf), mime: 'image/jpeg' };
  if (buf[0] === 0x89 && buf[1] === 0x50) return { bytes: cleanPng(buf), mime: 'image/png', orientation: 1 };
  fail('Поддерживаются только JPEG и PNG.');
}

function cleanJpeg(buf) {
  const n = buf.length;
  const parts = [buf.subarray(0, 2)];
  let orientation = 1;
  let i = 2;
  while (i < n) {
    if (buf[i] !== 0xff) fail('Файл JPEG повреждён.');
    const m = buf[i + 1];
    if (m === 0xff) { i++; continue; }
    if (m === 0xd9) { parts.push(buf.subarray(i, i + 2)); break; } // конец картинки; хвост (доп. изображения) отбрасываем
    if ((m >= 0xd0 && m <= 0xd7) || m === 0x01) { parts.push(buf.subarray(i, i + 2)); i += 2; continue; }
    const len = (buf[i + 2] << 8) | buf[i + 3];
    const seg = buf.subarray(i, i + 2 + len);
    const body = seg.subarray(4);
    if (m === 0xe1) {
      const o = readOrientation(body);
      if (o) orientation = o;
    }
    const isIcc = m === 0xe2 && String.fromCharCode(...body.subarray(0, 11)) === 'ICC_PROFILE';
    const drop = (m >= 0xe1 && m <= 0xef && !isIcc) || m === 0xfe;
    if (!drop) parts.push(seg);
    i += 2 + len;
    if (m === 0xda) { // сжатые данные до следующего маркера
      let j = i;
      while (j < n) {
        if (buf[j] === 0xff) {
          const nx = buf[j + 1];
          if (nx === 0x00 || (nx >= 0xd0 && nx <= 0xd7)) { j += 2; continue; }
          if (nx === 0xff) { j += 1; continue; }
          break;
        }
        j++;
      }
      parts.push(buf.subarray(i, j));
      i = j;
    }
  }
  return { bytes: Buffer.concat(parts), orientation };
}

function readOrientation(d) {
  if (String.fromCharCode(...d.subarray(0, 4)) !== 'Exif') return 0;
  const t = d.subarray(6);
  const le = t[0] === 0x49;
  const r16 = (o) => (le ? t[o] | (t[o + 1] << 8) : (t[o] << 8) | t[o + 1]);
  const r32 = (o) => (le ? (t[o] | (t[o + 1] << 8) | (t[o + 2] << 16) | (t[o + 3] << 24)) >>> 0 : ((t[o] << 24) | (t[o + 1] << 16) | (t[o + 2] << 8) | t[o + 3]) >>> 0);
  try {
    const ifd = r32(4);
    const count = r16(ifd);
    for (let k = 0; k < count; k++) {
      const e = ifd + 2 + k * 12;
      if (r16(e) === 0x0112) { const v = r16(e + 8); return v >= 1 && v <= 8 ? v : 0; }
    }
  } catch { /* битый EXIF — игнорируем */ }
  return 0;
}

function cleanPng(buf) {
  const DROP = new Set(['eXIf', 'tEXt', 'iTXt', 'zTXt', 'tIME']);
  const parts = [buf.subarray(0, 8)];
  let i = 8;
  while (i < buf.length) {
    const len = ((buf[i] << 24) | (buf[i + 1] << 16) | (buf[i + 2] << 8) | buf[i + 3]) >>> 0;
    const type = String.fromCharCode(...buf.subarray(i + 4, i + 8));
    const end = i + 12 + len;
    if (!DROP.has(type)) parts.push(buf.subarray(i, end));
    i = end;
    if (type === 'IEND') break;
  }
  return Buffer.concat(parts);
}
