/**
 * Online-Speicher der eigenen Cloudflare-Version: dieselbe kleine Schnittstelle wie der
 * claude.ai-Speicher (doc/collection, set/delete, onSnapshot), umgesetzt über die API des
 * Workers (/api/docs). Neue Stände von anderen Geräten werden beim Öffnen, beim Zurückkehren
 * in die App und regelmäßig abgefragt.
 */

type Snapshot = { exists: boolean; id: string; data(): unknown; metadata: { fromCache: boolean; hasPendingWrites: boolean } };
type QuerySnap = { docs: Snapshot[]; size: number; empty: boolean; metadata: { fromCache: boolean; hasPendingWrites: boolean } };
type ErrorCb = (e: { code?: string }) => void;

class NeedsLogin extends Error {}

async function api(method: string, path: string, body?: unknown): Promise<Response> {
  const res = await fetch(path, {
    method,
    credentials: 'same-origin',
    cache: 'no-store',
    headers: body !== undefined ? { 'content-type': 'application/json' } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.status === 401) throw new NeedsLogin('login');
  if (!res.ok) throw Object.assign(new Error(`HTTP ${res.status}`), { code: res.status === 413 ? 'quota_exceeded' : 'upstream_error' });
  return res;
}

export function createWorkerDb() {
  const docs = new Map<string, unknown>();
  const docListeners = new Map<string, Set<{ next: (s: Snapshot) => void; err?: ErrorCb }>>();
  const colListeners = new Map<string, Set<{ next: (q: QuerySnap) => void; err?: ErrorCb }>>();
  let loaded = false;
  let inflight: Promise<void> | null = null;

  const meta = { fromCache: false, hasPendingWrites: false };
  const snap = (path: string): Snapshot => ({
    id: path.split('/').pop()!,
    exists: docs.has(path),
    data: () => (docs.has(path) ? structuredClone(docs.get(path)) : undefined),
    metadata: meta,
  });
  const query = (col: string): QuerySnap => {
    const list = [...docs.keys()].filter((k) => k.startsWith(`${col}/`) && k.split('/').length === 2).sort().map(snap);
    return { docs: list, size: list.length, empty: !list.length, metadata: meta };
  };
  const notify = () => {
    if (!loaded) return;
    docListeners.forEach((set, path) => set.forEach((l) => l.next(snap(path))));
    colListeners.forEach((set, col) => set.forEach((l) => l.next(query(col))));
  };
  const fail = (e: unknown) => {
    if (e instanceof NeedsLogin) {
      // Sitzung abgelaufen: zur Anmeldung (danach zurück in die App).
      window.location.href = `/login?next=${encodeURIComponent(window.location.pathname + window.location.hash)}`;
      return;
    }
    const code = (e as { code?: string })?.code ?? 'unavailable';
    docListeners.forEach((set) => set.forEach((l) => l.err?.({ code })));
    colListeners.forEach((set) => set.forEach((l) => l.err?.({ code })));
  };

  const refresh = () => {
    if (inflight) return inflight;
    inflight = (async () => {
      try {
        const res = await api('GET', '/api/docs');
        const body = (await res.json()) as { docs: Record<string, unknown> };
        docs.clear();
        for (const [k, v] of Object.entries(body.docs ?? {})) docs.set(k, v);
        loaded = true;
        notify();
      } catch (e) {
        fail(e);
      } finally {
        inflight = null;
      }
    })();
    return inflight;
  };

  // Neue Stände von anderen Geräten: beim Zurückkehren in die App und jede Minute.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') void refresh();
  });
  window.setInterval(() => {
    if (document.visibilityState === 'visible') void refresh();
  }, 60000);

  const docRef = (path: string) => ({
    id: path.split('/').pop()!,
    path,
    async get() {
      if (!loaded) await refresh();
      return snap(path);
    },
    async set(data: unknown) {
      try {
        await api('PUT', `/api/doc?path=${encodeURIComponent(path)}`, data);
      } catch (e) {
        if (e instanceof NeedsLogin) fail(e);
        throw Object.assign(new Error('save failed'), { code: (e as { code?: string })?.code ?? 'unavailable' });
      }
      docs.set(path, structuredClone(data));
    },
    async delete() {
      try {
        await api('DELETE', `/api/doc?path=${encodeURIComponent(path)}`);
      } catch (e) {
        if (e instanceof NeedsLogin) fail(e);
        throw Object.assign(new Error('delete failed'), { code: (e as { code?: string })?.code ?? 'unavailable' });
      }
      docs.delete(path);
    },
    onSnapshot(next: (s: Snapshot) => void, err?: ErrorCb) {
      const set = docListeners.get(path) ?? new Set();
      const l = { next, err };
      set.add(l);
      docListeners.set(path, set);
      if (loaded) next(snap(path));
      else void refresh();
      return () => set.delete(l);
    },
  });

  return {
    doc: docRef,
    collection: (col: string) => ({
      doc: (id: string) => docRef(`${col}/${id}`),
      onSnapshot(next: (q: QuerySnap) => void, err?: ErrorCb) {
        const set = colListeners.get(col) ?? new Set();
        const l = { next, err };
        set.add(l);
        colListeners.set(col, set);
        if (loaded) next(query(col));
        else void refresh();
        return () => set.delete(l);
      },
    }),
  };
}
