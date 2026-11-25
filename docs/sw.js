// Minimaler Service Worker: Offline-Cache (network-first) und Klick auf Benachrichtigungen.
const CACHE = 'byot-v4';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) =>
  e.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  ),
);

self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  if (e.request.method !== 'GET' || url.origin !== location.origin) return;
  // Daten und Anmeldung nie aus dem Zwischenspeicher – immer direkt vom Server.
  if (/^\/(api|login|logout)(\/|$|\?)/.test(url.pathname)) return;
  e.respondWith(
    fetch(e.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(e.request, copy));
        return res;
      })
      .catch(() => caches.match(e.request).then((r) => r || caches.match('./'))),
  );
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const target = new URL(e.notification.data?.url || '#/', self.registration.scope).href;
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if ('focus' in c) {
          c.navigate(target);
          return c.focus();
        }
      }
      return self.clients.openWindow(target);
    }),
  );
});

// Erinnerung vom Server (ohne Inhalt): freundlicher Text je nach Tageszeit, Zahl am App-Symbol.
const NUDGES = {
  morning: ['Guten Morgen ☀', 'Wie hast du geschlafen? Ein Tipp reicht.'],
  day: ['Kurzer Check 🌿', 'Wie geht’s dir gerade? Dauert 5 Sekunden.'],
  evening: ['Bevor der Tag endet 🌙', 'Wie war dein Tag? Ein Tipp reicht.'],
};
self.addEventListener('push', (e) => {
  const h = new Date().getHours();
  const [title, body] = h < 11 ? NUDGES.morning : h < 18 ? NUDGES.day : NUDGES.evening;
  e.waitUntil(
    Promise.all([
      self.registration.showNotification(title, { body, tag: 'checkin', icon: './icon-192.png', badge: './icon-192.png', data: { url: '#/' } }),
      self.navigator.setAppBadge ? self.navigator.setAppBadge(1).catch(() => undefined) : undefined,
    ]),
  );
});
