import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { cloudDiff, fromCloud, sameData, type CloudMeta, type CloudWeek } from '../core/cloudModel';
import type { AppData } from '../core/types';
import { useStore } from '../state/store';
import { claudeUse, hasClaudeRuntime } from './claudeRuntime';
import { IS_WORKER } from './env';
import { createWorkerDb } from './workerDb';

/** Gibt es hier einen Online-Speicher (claude.ai oder eigene Cloudflare-Version)? */
const hasRemote = () => IS_WORKER || hasClaudeRuntime();

/**
 * Abgleich mit dem privaten Cloud-Speicher der claude.ai-Seite ("db").
 *
 * - Nur verfügbar, wenn die Seite in claude.ai läuft und der Betrachter der
 *   Eigentümer ist; sonst bleibt alles lokal (Status "local").
 * - Erstes Öffnen mit leerer Cloud: der lokale Stand wird hochgeladen.
 * - Danach ist die Cloud maßgeblich; lokale Änderungen, die noch nicht
 *   hochgeladen waren ("dirty"), gehen beim Verbinden zuerst hinauf.
 * - Geschrieben wird gebündelt (kurz nach der letzten Änderung), nacheinander
 *   und nur für Dokumente, die sich tatsächlich geändert haben.
 */

export type SyncStatus = 'local' | 'connecting' | 'synced' | 'saving' | 'offline' | 'error';

interface SyncState {
  status: SyncStatus;
  message?: string;
  lastSaved?: Date;
}

const Ctx = createContext<SyncState>({ status: 'local' });
export const useSyncStatus = () => useContext(Ctx);

const DIRTY_KEY = 'byot:dirty';
const setDirty = (v: boolean) => {
  try {
    if (v) localStorage.setItem(DIRTY_KEY, '1');
    else localStorage.removeItem(DIRTY_KEY);
  } catch {
    /* ohne Browser-Speicher geht es auch */
  }
};
const isDirty = () => {
  try {
    return localStorage.getItem(DIRTY_KEY) === '1';
  } catch {
    return false;
  }
};

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

export function CloudSyncProvider({ children }: { children: ReactNode }) {
  const { data, dispatch } = useStore();
  const [state, setState] = useState<SyncState>({ status: hasRemote() ? 'connecting' : 'local' });
  const db = useRef<Db | null>(null);
  /** Zuletzt mit der Cloud übereinstimmender Zustand. */
  const synced = useRef<AppData | null>(null);
  const ready = useRef(false);
  const latest = useRef(data);
  latest.current = data;
  const flushing = useRef(false);
  const again = useRef(false);
  const timer = useRef<number | undefined>(undefined);
  /** Eine Speicherung ist geplant, aber noch nicht gestartet. */
  const pending = useRef(false);

  const flush = async () => {
    if (!db.current || !ready.current) return;
    if (flushing.current) {
      again.current = true;
      return;
    }
    flushing.current = true;
    try {
      do {
        again.current = false;
        const target = latest.current;
        const diff = cloudDiff(synced.current, target);
        if (!diff.meta && !diff.write.length && !diff.remove.length) break;
        setState((s) => ({ ...s, status: 'saving' }));
        if (diff.meta) await db.current.doc('diary/meta').set(diff.meta as unknown as Record<string, unknown>);
        for (const w of diff.write) await db.current.collection('entries').doc(w.week).set(w as unknown as Record<string, unknown>);
        for (const k of diff.remove) await db.current.collection('entries').doc(k).delete();
        synced.current = target;
      } while (again.current);
      setDirty(!sameData(synced.current!, latest.current));
      setState({ status: 'synced', lastSaved: new Date() });
    } catch (e) {
      const code = (e as { code?: string })?.code;
      setState({
        status: code === 'unavailable' ? 'offline' : 'error',
        message:
          code === 'quota_exceeded'
            ? 'Der Online-Speicher ist voll. Sichere alte Einträge als Datei und lösche sie dann.'
            : code === 'unavailable'
              ? 'Gerade keine Verbindung – Änderungen bleiben auf diesem Gerät und werden später hochgeladen.'
              : 'Online speichern hat nicht geklappt. Deine Daten bleiben auf diesem Gerät.',
      });
      // Einmal später erneut versuchen.
      window.setTimeout(() => void flush(), 15000);
    } finally {
      flushing.current = false;
    }
  };

  // Verbinden und abonnieren – genau einmal.
  useEffect(() => {
    if (!hasRemote()) return;
    let cancelled = false;
    const unsubs: (() => void)[] = [];
    let metaSnap: { exists: boolean; data(): unknown; metadata: { fromCache: boolean; hasPendingWrites: boolean } } | null = null;
    let weekSnap: { docs: { data(): unknown }[]; metadata: { fromCache: boolean; hasPendingWrites: boolean } } | null = null;
    let metaFinal = false;
    let weeksFinal = false;
    const loadTimer = window.setTimeout(() => {
      if (!ready.current && !cancelled) setState({ status: 'offline', message: 'Online-Speicher noch nicht erreichbar – du kannst ganz normal weiter eintragen.' });
    }, 10000);

    // Meta und Wochen kommen als getrennte Meldungen: kurz sammeln, dann gemeinsam auswerten,
    // damit nie ein halb aktualisierter Stand übernommen wird.
    let applyTimer: number | undefined;
    const scheduleApply = () => {
      window.clearTimeout(applyTimer);
      applyTimer = window.setTimeout(apply, ready.current ? 600 : 150);
    };
    const apply = () => {
      if (cancelled || !metaSnap || !weekSnap || !metaFinal || !weeksFinal) return;
      if (metaSnap.metadata.hasPendingWrites || weekSnap.metadata.hasPendingWrites) return;
      const remote = fromCloud(metaSnap.exists ? (metaSnap.data() as Partial<CloudMeta>) : undefined, weekSnap.docs.map((d) => d.data() as Partial<CloudWeek>));
      if (!ready.current) {
        ready.current = true;
        window.clearTimeout(loadTimer);
        const cloudEmpty = !metaSnap.exists && weekSnap.docs.length === 0;
        if (cloudEmpty || isDirty()) {
          // Erstes Mal (oder offline Geändertes): lokalen Stand hochladen.
          synced.current = cloudEmpty ? null : remote;
          void flush();
        } else {
          synced.current = remote;
          if (!sameData(remote, latest.current)) dispatch({ type: 'data/replace', data: remote });
          setState({ status: 'synced' });
        }
        return;
      }
      // Änderungen von einem anderen Gerät übernehmen (nie zurückschreiben).
      // Solange eigene Änderungen ausstehen, gewinnt der lokale Stand.
      if (flushing.current || pending.current || isDirty()) return;
      if (synced.current && sameData(remote, synced.current)) return;
      synced.current = remote;
      if (!sameData(remote, latest.current)) dispatch({ type: 'data/replace', data: remote });
    };

    (async () => {
      // Eigene Cloudflare-Version: angemeldet ist, wer das Passwort kennt – kein Besitzer-Check nötig.
      const user = IS_WORKER ? null : await claudeUse('user');
      if (cancelled) return;
      if (user && typeof user.isOwner === 'function' && !(await user.isOwner())) {
        setState({ status: 'local', message: 'Nur wer die Seite erstellt hat, speichert online. Du siehst hier deine eigene, lokale Version.' });
        window.clearTimeout(loadTimer);
        return;
      }
      const store = IS_WORKER ? createWorkerDb() : await claudeUse('db');
      if (cancelled) return;
      if (!store) {
        window.clearTimeout(loadTimer);
        setState({ status: 'local', message: 'Online-Speicher hier nicht verfügbar – deine Daten bleiben auf diesem Gerät.' });
        return;
      }
      db.current = store;
      const onError = (e: { code?: string }) => {
        window.clearTimeout(loadTimer);
        setState({ status: e?.code === 'revoked' ? 'local' : 'offline', message: 'Verbindung zum Online-Speicher unterbrochen – deine Daten bleiben auf diesem Gerät.' });
      };
      unsubs.push(
        store.doc('diary/meta').onSnapshot((s: typeof metaSnap) => {
          metaSnap = s;
          if (s && !s.metadata.fromCache) metaFinal = true;
          scheduleApply();
        }, onError),
      );
      unsubs.push(
        store.collection('entries').onSnapshot((q: typeof weekSnap) => {
          weekSnap = q;
          if (q && !q.metadata.fromCache) weeksFinal = true;
          scheduleApply();
        }, onError),
      );
    })();

    return () => {
      cancelled = true;
      window.clearTimeout(loadTimer);
      window.clearTimeout(applyTimer);
      unsubs.forEach((u) => u());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Lokale Änderungen gebündelt hochladen.
  useEffect(() => {
    if (!db.current || !ready.current) return;
    if (synced.current && sameData(synced.current, data)) return;
    setDirty(true);
    pending.current = true;
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => {
      pending.current = false;
      void flush();
    }, 800);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data]);

  return <Ctx.Provider value={state}>{children}</Ctx.Provider>;
}

const LABEL: Record<SyncStatus, string> = {
  local: 'Nur auf diesem Gerät gespeichert',
  connecting: 'Verbinde …',
  synced: 'Privat gespeichert – auf all deinen Geräten',
  saving: 'Speichert …',
  offline: 'Offline – auf diesem Gerät gesichert, wird später übertragen',
  error: 'Online-Speicher gerade gestört – auf diesem Gerät gesichert',
};

export function SyncBadge() {
  const s = useSyncStatus();
  if (s.status === 'local' && !hasRemote()) return null;
  const icon = s.status === 'synced' ? '☁︎✓' : s.status === 'saving' || s.status === 'connecting' ? '☁︎…' : s.status === 'local' ? '⌂' : '☁︎!';
  return (
    <a href="#/settings" className={`sync-badge ${s.status}`} title={s.message ?? LABEL[s.status]} aria-label={LABEL[s.status]}>
      {icon}
    </a>
  );
}

export function SyncInfo() {
  const s = useSyncStatus();
  return (
    <p className={`sync-info ${s.status}`}>
      <b>{LABEL[s.status]}</b>
      {s.lastSaved && s.status === 'synced' && <span className="muted"> · zuletzt {s.lastSaved.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })}</span>}
      {s.message && <span className="muted"> · {s.message}</span>}
    </p>
  );
}
