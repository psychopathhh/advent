// Один раз: создаёт пару ключей для «запечатывания» шаров.
//   data/release.pub.json       — открытый ключ (идёт в репозиторий, им шифруют)
//   content/release-private.json — закрытый ключ (НЕ в репозиторий; его содержимое
//                                  кладётся в секрет RELEASE_KEY на GitHub)
// Запуск: node tools/release-setup.mjs   (--force — создать новую пару)
import { existsSync } from 'node:fs';
import { writeFile, mkdir } from 'node:fs/promises';
import { p, crypto as C, args } from './lib.mjs';

const a = args();
const pubFile = p('data', 'release.pub.json');
const privFile = p('content', 'release-private.json');
if (existsSync(privFile) && !a.force) {
  console.log('Ключи уже есть. Новая пара: node tools/release-setup.mjs --force (потом заново node tools/encrypt-content.mjs и обновить секрет на GitHub).');
  process.exit(0);
}
const { publicJwk, privateJwk } = await C.generateSealPair();
await mkdir(p('content'), { recursive: true });
await writeFile(pubFile, JSON.stringify(publicJwk) + '\n');
await writeFile(privFile, JSON.stringify(privateJwk));
console.log('✔ Ключи созданы.\n  Открытый: data/release.pub.json\n  Закрытый: content/release-private.json — скопируй его содержимое в секрет RELEASE_KEY на GitHub.');
