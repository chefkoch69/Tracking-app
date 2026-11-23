import { createContext, useContext, useEffect, useMemo, useReducer, type ReactNode } from 'react';
import { generateDemo } from '../core/demo';
import { emptyData, localStorageAdapter, type StorageAdapter } from '../core/storage';
import type { AppData, Entry, Profile, ReminderState, Tracker } from '../core/types';

export type Action =
  | { type: 'tracker/save'; tracker: Tracker }
  | { type: 'tracker/delete'; id: string }
  | { type: 'tracker/archive'; id: string; archived: boolean }
  | { type: 'tracker/reorder'; ids: string[] }
  | { type: 'entry/save'; entry: Entry }
  | { type: 'entry/delete'; id: string }
  | { type: 'reminder/update'; trackerId: string; patch: Partial<ReminderState> }
  | { type: 'profile/update'; patch: Partial<Profile> }
  | { type: 'data/replace'; data: AppData }
  | { type: 'data/merge'; trackers: Tracker[]; entries: Entry[] }
  | { type: 'demo/remove' };

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const i = list.findIndex((x) => x.id === item.id);
  if (i === -1) return [...list, item];
  const copy = list.slice();
  copy[i] = item;
  return copy;
}

export function reducer(state: AppData, action: Action): AppData {
  switch (action.type) {
    case 'tracker/save':
      return { ...state, trackers: upsert(state.trackers, action.tracker) };
    case 'tracker/delete': {
      const { [action.id]: _removed, ...reminders } = state.reminders;
      return {
        ...state,
        trackers: state.trackers.filter((t) => t.id !== action.id),
        entries: state.entries.filter((e) => e.trackerId !== action.id),
        reminders,
      };
    }
    case 'tracker/archive':
      return {
        ...state,
        trackers: state.trackers.map((t) => (t.id === action.id ? { ...t, archived: action.archived } : t)),
      };
    case 'tracker/reorder': {
      const order = new Map(action.ids.map((id, i) => [id, i]));
      return {
        ...state,
        trackers: [...state.trackers].sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0)),
      };
    }
    case 'entry/save':
      return { ...state, entries: upsert(state.entries, action.entry) };
    case 'entry/delete':
      return { ...state, entries: state.entries.filter((e) => e.id !== action.id) };
    case 'reminder/update':
      return {
        ...state,
        reminders: {
          ...state.reminders,
          [action.trackerId]: { ...state.reminders[action.trackerId], ...action.patch },
        },
      };
    case 'profile/update':
      return { ...state, profile: { ...state.profile, ...action.patch } };
    case 'data/replace':
      return action.data;
    case 'demo/remove': {
      const ids = new Set(state.trackers.filter((t) => t.demo).map((t) => t.id));
      return {
        ...state,
        trackers: state.trackers.filter((t) => !ids.has(t.id)),
        entries: state.entries.filter((e) => !ids.has(e.trackerId)),
      };
    }
    case 'data/merge':
      return {
        ...state,
        trackers: [...state.trackers, ...action.trackers],
        entries: [...state.entries, ...action.entries],
      };
  }
}

interface Store {
  data: AppData;
  dispatch: (a: Action) => void;
}

const Ctx = createContext<Store | null>(null);

/** Startzustand: leer – in der Vorschau-Version mit gekennzeichneten Beispieldaten. */
function initial(): AppData {
  if (import.meta.env.VITE_TARGET !== 'artifact') return emptyData();
  return { ...emptyData(), ...generateDemo() };
}

export function StoreProvider({ children, adapter = localStorageAdapter }: { children: ReactNode; adapter?: StorageAdapter }) {
  const [data, dispatch] = useReducer(reducer, undefined, () => adapter.load() ?? initial());
  useEffect(() => adapter.save(data), [data, adapter]);
  const value = useMemo(() => ({ data, dispatch }), [data]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore(): Store {
  const s = useContext(Ctx);
  if (!s) throw new Error('StoreProvider fehlt');
  return s;
}

export function useTracker(id: string | undefined) {
  const { data } = useStore();
  return data.trackers.find((t) => t.id === id);
}
