// Обработка фото в браузере: поворот по EXIF, уменьшение, удаление метаданных, размытая версия.

const MAX_SIDE = 1600;
const MAX_BYTES = 1.5 * 1024 * 1024;

async function loadImage(file) {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode(); // браузер сам применяет EXIF-ориентацию
    return img;
  } catch {
    throw new Error('Не получилось открыть фото. Если это HEIC, сохрани его как JPEG (или отправь себе в Telegram «как фото» и сохрани оттуда).');
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
}

function toBlob(canvas, quality) {
  return new Promise((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Не получилось сжать фото'))), 'image/jpeg', quality));
}

async function encode(canvas) {
  for (const q of [0.85, 0.78, 0.7, 0.6]) {
    const blob = await toBlob(canvas, q);
    if (blob.size <= MAX_BYTES) return new Uint8Array(await blob.arrayBuffer());
  }
  throw new Error('Фото слишком большое даже после сжатия. Попробуй другое.');
}

/** Возвращает { sharp: Uint8Array, blurred: Uint8Array, previewUrl, width, height } */
export async function processPhoto(file) {
  const img = await loadImage(file);
  const scale = Math.min(1, MAX_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.round(img.naturalWidth * scale), h = Math.round(img.naturalHeight * scale);

  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const ctx = c.getContext('2d');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  const sharp = await encode(c); // перекодирование через canvas = никаких EXIF и геометок

  // Размытая версия: ужимаем до крошечной и растягиваем обратно (работает во всех браузерах)
  const tiny = document.createElement('canvas');
  const tw = 18, th = Math.max(1, Math.round((h / w) * 18));
  tiny.width = tw; tiny.height = th;
  const tctx = tiny.getContext('2d');
  tctx.imageSmoothingQuality = 'high';
  tctx.drawImage(c, 0, 0, tw, th);
  const b = document.createElement('canvas');
  b.width = Math.round(w / 2); b.height = Math.round(h / 2);
  const bctx = b.getContext('2d');
  bctx.imageSmoothingEnabled = true;
  bctx.imageSmoothingQuality = 'high';
  bctx.drawImage(tiny, 0, 0, b.width, b.height);
  bctx.fillStyle = 'rgba(10,14,24,.25)';
  bctx.fillRect(0, 0, b.width, b.height);
  const blurred = await encode(b);

  return { sharp, blurred, previewUrl: c.toDataURL('image/jpeg', 0.6), blurUrl: b.toDataURL('image/jpeg', 0.6), width: w, height: h };
}
