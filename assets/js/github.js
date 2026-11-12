// Мини-клиент GitHub API для админки: чтение файлов и атомарные коммиты через Git Data API.
import { b64, unb64 } from './crypto.js';

const API = 'https://api.github.com';

export class GitHubError extends Error {
  constructor(message, status) { super(message); this.status = status; }
}

export function makeRepo({ owner, repo, branch = 'main', token }) {
  const base = `${API}/repos/${owner}/${repo}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  };

  async function call(path, opts = {}) {
    let res;
    try {
      res = await fetch(path.startsWith('http') ? path : base + path, {
        ...opts,
        headers: { ...headers, ...(opts.body ? { 'Content-Type': 'application/json' } : {}), ...(opts.headers || {}) },
        cache: 'no-store',
      });
    } catch {
      throw new GitHubError('Нет связи с GitHub. Проверь интернет (или включи VPN) и попробуй ещё раз.', 0);
    }
    if (res.status === 401) throw new GitHubError('Токен не подходит или истёк. Создай новый и вставь в настройках.', 401);
    if (res.status === 403) throw new GitHubError('У токена нет прав на запись в этот репозиторий (нужно Contents: Read and write).', 403);
    if (res.status === 404 && opts.allow404) return null;
    if (!res.ok) {
      let msg = '';
      try { msg = (await res.json()).message; } catch { /* */ }
      throw new GitHubError(`GitHub ответил ${res.status}${msg ? ': ' + msg : ''}`, res.status);
    }
    return res;
  }

  return {
    /** Проверяет доступ. Возвращает true, если можно писать. */
    async check() {
      const r = await call('');
      const j = await r.json();
      return !!j.permissions?.push;
    },

    /** Запускает задачу GitHub Actions (нужно право токена Actions: Read and write). */
    async dispatch(workflow, inputs = {}) {
      try {
        await call(`/actions/workflows/${workflow}/dispatches`, { method: 'POST', body: JSON.stringify({ ref: branch, inputs }) });
      } catch (e) {
        if (e.status === 403 || e.status === 404) throw new GitHubError('У токена нет права запускать задачи. На GitHub: Settings → Developer settings → Fine-grained tokens → твой токен → Edit → Repository permissions → Actions: Read and write → Update.', e.status);
        throw e;
      }
    },

    /** Читает файл из ветки (свежий, мимо кэша Pages). null, если файла нет. */
    async readFile(path) {
      // Contents API (и raw, и base64) портит бинарные файлы, похожие на текст.
      // Поэтому берём только sha, а сами байты — из Git blobs API: он отдаёт файл байт в байт.
      const r = await call(`/contents/${encodePath(path)}?ref=${encodeURIComponent(branch)}&ts=${Date.now()}`, { allow404: true });
      if (!r) return null;
      const { sha } = await r.json();
      const blob = await (await call(`/git/blobs/${sha}`)).json();
      return unb64(String(blob.content).replace(/\s+/g, ''));
    },

    /**
     * Один коммит: files = { 'data/x.bin': Uint8Array | null (удалить) }.
     * build(): async () => ({ files, message }) — вызывается заново при конфликте.
     */
    async commit(build, attempts = 3) {
      for (let i = 0; i < attempts; i++) {
        const { files, message } = await build();
        const ref = await (await call(`/git/ref/heads/${encodeURIComponent(branch)}`)).json();
        const parent = ref.object.sha;
        const parentCommit = await (await call(`/git/commits/${parent}`)).json();

        const tree = [];
        for (const [path, bytes] of Object.entries(files)) {
          if (bytes === null) { tree.push({ path, mode: '100644', type: 'blob', sha: null }); continue; }
          const blob = await (await call('/git/blobs', { method: 'POST', body: JSON.stringify({ content: b64(bytes), encoding: 'base64' }) })).json();
          tree.push({ path, mode: '100644', type: 'blob', sha: blob.sha });
        }
        const newTree = await (await call('/git/trees', { method: 'POST', body: JSON.stringify({ base_tree: parentCommit.tree.sha, tree }) })).json();
        const commit = await (await call('/git/commits', {
          method: 'POST',
          body: JSON.stringify({
            message, tree: newTree.sha, parents: [parent],
            author: { name: 'advent', email: 'advent@users.noreply.github.com' },
          }),
        })).json();
        try {
          await call(`/git/refs/heads/${encodeURIComponent(branch)}`, { method: 'PATCH', body: JSON.stringify({ sha: commit.sha, force: false }) });
          return commit.sha;
        } catch (e) {
          if (e.status === 422 && i < attempts - 1) continue; // кто-то успел закоммитить раньше — пробуем заново
          throw e;
        }
      }
      throw new GitHubError('Не получилось сохранить: репозиторий меняется слишком часто. Попробуй ещё раз.', 409);
    },
  };
}

function encodePath(p) {
  return p.split('/').map(encodeURIComponent).join('/');
}
