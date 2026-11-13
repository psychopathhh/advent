// Шифрует content/content.json → data/content.enc + data/nodes/<id>.enc
// Запуск после каждой правки текстов: node tools/encrypt-content.mjs
//
// В data/content.enc остаётся только то, что нужно до открытия шара (даты, названия,
// цвета, подсказки). Письма, миссии, ставки, квесты, игры лежат в data/nodes/<id>.enc
// и запечатаны: ключ к ним GitHub выкладывает в data/keys.json в момент открытия.
import { readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { p, crypto as C, mainKey, readState, writeBin, fail } from './lib.mjs';

const src = p('content', 'content.json');
if (!existsSync(src)) fail('Нет content/content.json');
const pubFile = p('data', 'release.pub.json');
if (!existsSync(pubFile)) fail('Нет data/release.pub.json. Сначала: node tools/release-setup.mjs');

let content;
try {
  content = JSON.parse(await readFile(src, 'utf8'));
} catch (e) {
  fail('В content/content.json ошибка синтаксиса JSON: ' + e.message);
}

const { key, raw, kdf } = await mainKey();
await readState(key); // заодно проверяем, что фраза та же, что у state.enc

// Что видно до открытия шара
const PUBLIC = new Set(['id', 'kind', 'slot', 'opensAt', 'title', 'accent', 'dark', 'lookId', 'teaserMode', 'teaserCaption', 'lockedHint', 'bonus', 'pattern']);

const pub = await C.importSealPublic(JSON.parse(await readFile(pubFile, 'utf8')));
// ключи выпуска: только у тебя; свой файл на каждый набор данных (по соли)
const secretsFile = p('content', `release-keys.${kdf.salt.replace(/[^a-z0-9]/gi, '').slice(0, 8)}.json`);
const secrets = existsSync(secretsFile) ? JSON.parse(await readFile(secretsFile, 'utf8')) : {};
const sealsFile = p('data', 'seals.json');
const seals = existsSync(sealsFile) ? JSON.parse(await readFile(sealsFile, 'utf8')) : {};

const out = structuredClone(content);
if (out.newYearLetter) out.newYearLetter.id = 'ny';
const nodes = [...out.weeks, out.finale, out.newYearLetter].filter(Boolean);
async function secretFor(id) {
  if (!secrets[id]) {
    const r = C.randomBytes(32);
    secrets[id] = { r: C.b64(r), sealed: await C.seal(pub, r) };
  }
  return secrets[id];
}
// Скрытая миссия открывается только кнопкой в админке: дата «никогда», чтобы GitHub не открыл её сам
const MANUAL_ONLY = '2099-12-31T00:00:00+03:00';
for (const n of nodes) {
  const locked = {};
  for (const k of Object.keys(n)) if (!PUBLIC.has(k)) { locked[k] = n[k]; delete n[k]; }
  // «Миссия вечера» под отдельным замком (missionSecret: true в тексте шара)
  const mid = n.id + 'm';
  if (locked.missionSecret && locked.mission?.length) {
    const ms = await secretFor(mid);
    const missionKey = await C.sealedKey(raw, C.unb64(ms.r), mid);
    await writeBin(p('data', 'nodes', `${mid}.enc`), await C.encryptJSON(missionKey, { mission: locked.mission }));
    seals[mid] = { at: MANUAL_ONLY, sealed: ms.sealed };
    n.missionSealed = true;
    n.missionCount = locked.mission.length;
    n.missionVer = C.randomId(4);
    delete locked.mission;
  } else {
    delete seals[mid];
    await rm(p('data', 'nodes', `${mid}.enc`), { force: true });
  }
  delete locked.missionSecret;

  // Мини-квесты: quests: [{ text, reward, secret? }]. Скрытые (secret: true) — под отдельным
  // замком <id>q, открываются кнопкой в админке. В письме вместо них остаются заглушки.
  if (locked.quest && !locked.quests) locked.quests = [locked.quest];
  delete locked.quest;
  const qid = n.id + 'q';
  const hidden = (locked.quests || []).filter((q) => q.secret);
  if (hidden.length) {
    const qs = await secretFor(qid);
    const questKey = await C.sealedKey(raw, C.unb64(qs.r), qid);
    await writeBin(p('data', 'nodes', `${qid}.enc`), await C.encryptJSON(questKey, { quests: hidden.map(({ secret, ...q }) => q) }));
    seals[qid] = { at: MANUAL_ONLY, sealed: qs.sealed };
    locked.quests = locked.quests.map((q) => (q.secret ? { secret: true } : q));
    n.questSealed = true;
    n.questVer = C.randomId(4);
  } else {
    delete seals[qid];
    await rm(p('data', 'nodes', `${qid}.enc`), { force: true });
  }
  const s = await secretFor(n.id);
  const nodeKey = await C.sealedKey(raw, C.unb64(s.r), n.id);
  const bytes = await C.encryptJSON(nodeKey, locked);
  await writeBin(p('data', 'nodes', `${n.id}.enc`), bytes);
  n.sealed = true;
  n.sealVer = C.randomId(4);
  seals[n.id] = { at: n.opensAt, sealed: s.sealed };
}

await writeBin(p('data', 'content.enc'), await C.encryptJSON(key, out));
await writeFile(secretsFile, JSON.stringify(secrets, null, 2));
await writeFile(sealsFile, JSON.stringify(seals, null, 2) + '\n');

// Подсказка к фразе нужна ДО входа, поэтому лежит открыто. Не пиши в неё саму фразу!
const hint = content.passHint && !/^\{.*\}$/.test(content.passHint) ? content.passHint : null;
await writeBin(p('data', 'hint.json'), new TextEncoder().encode(JSON.stringify({ hint }) + '\n'));

const text = JSON.stringify(content);
const nameSet = content.name && !/^\{.*\}$/.test(content.name);
const left = [...new Set(text.match(/\{[А-ЯЁA-Z][А-ЯЁA-Z_0-9]{2,}\}|\{вариант\}/g) || [])].filter((x) => !(nameSet && x === '{ИМЯ}'));
console.log(`✔ data/content.enc и ${nodes.length} запечатанных шаров обновлены.`);
if (left.length) console.log('ℹ Незаполненные плейсхолдеры: ' + left.join(', '));
