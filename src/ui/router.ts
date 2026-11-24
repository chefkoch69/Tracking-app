import { useEffect, useState } from 'react';

export type Route =
  | { name: 'dashboard' }
  | { name: 'new' }
  | { name: 'edit'; id: string }
  | { name: 'tracker'; id: string; view?: string }
  | { name: 'entry'; id: string; entryId?: string; date?: string }
  | { name: 'data'; day?: string }
  | { name: 'now'; talk?: boolean; moment?: string; at?: string }
  | { name: 'try' }
  | { name: 'doctor' }
  | { name: 'health'; payload?: string }
  | { name: 'settings' };

export function parseRoute(hash: string): Route {
  const [path, query = ''] = hash.replace(/^#\/?/, '').split('?');
  const params = new URLSearchParams(query);
  const parts = path.split('/').filter(Boolean);
  if (parts[0] === 'new') return { name: 'new' };
  if (parts[0] === 'data') return { name: 'data', day: params.get('d') ?? undefined };
  if (parts[0] === 'now') return { name: 'now', talk: parts[1] === 'talk', moment: params.get('m') ?? undefined, at: params.get('at') ?? undefined };
  if (parts[0] === 'try') return { name: 'try' };
  if (parts[0] === 'arzt') return { name: 'doctor' };
  if (parts[0] === 'health') return { name: 'health', payload: params.get('data') ?? undefined };
  if (parts[0] === 'settings') return { name: 'settings' };
  if (parts[0] === 't' && parts[1]) {
    if (parts[2] === 'edit') return { name: 'edit', id: parts[1] };
    if (parts[2] === 'entry') return { name: 'entry', id: parts[1], entryId: parts[3], date: params.get('d') ?? undefined };
    return { name: 'tracker', id: parts[1], view: parts[2] };
  }
  return { name: 'dashboard' };
}

export function navigate(path: string) {
  window.location.hash = path;
}

export function useRoute(): Route {
  const [route, setRoute] = useState(() => parseRoute(window.location.hash));
  useEffect(() => {
    const on = () => {
      setRoute(parseRoute(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', on);
    return () => window.removeEventListener('hashchange', on);
  }, []);
  return route;
}
