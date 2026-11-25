// Cloudflare Worker für „Mein Befinden“ – wird von scripts/build-worker.mjs mit den App-Dateien
// (Konstante FILES) zu dist-worker/worker.js zusammengesetzt.
//
// - Ohne Passwort kommt niemand hinein. Festgelegt wird es einmalig in der App (/setup) mit einem
//   Einrichtungs-Code, dessen Hash im Speicher liegt (auth:setup); gespeichert wird nur ein PBKDF2-Hash.
//   Alternativ gilt ein Cloudflare-Geheimnis PASSWORT. Ohne beides bleibt die App gesperrt.
// - Nach der Anmeldung merkt sich das Gerät die Sitzung (Cookie, 1 Jahr). Ein neues Passwort
//   meldet alle Geräte ab.
// - /api/docs: die Tagebuch-Daten im Cloudflare-Speicher (KV, Bindung DATA) – nur angemeldet.

/* global FILES */
const PUBLIC = new Set(['/icon-180.png', '/icon-192.png', '/icon-512.png', '/icon.svg', '/manifest.webmanifest']);
const COOKIE = 'mb_session';
const YEAR = 60 * 60 * 24 * 365;
const MAX_FAILS = 10;
const enc = new TextEncoder();
const decoded = new Map();

function fileBody(path, f) {
  if (f.text !== undefined) return f.text;
  if (!decoded.has(path)) decoded.set(path, Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0)));
  return decoded.get(path);
}

const SECURITY = {
  'x-content-type-options': 'nosniff',
  'referrer-policy': 'no-referrer',
  'x-frame-options': 'DENY',
};

function serveFile(request, path) {
  if (path.endsWith('/')) path += 'index.html';
  let f = FILES[path];
  if (!f && !path.includes('.', path.lastIndexOf('/'))) {
    path = '/index.html';
    f = FILES[path];
  }
  if (!f) return new Response('Nicht gefunden', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8', ...SECURITY } });
  const fresh = path === '/index.html' || path === '/sw.js' || path === '/manifest.webmanifest';
  return new Response(request.method === 'HEAD' ? null : fileBody(path, f), {
    headers: {
      'content-type': f.type,
      'cache-control': fresh ? 'no-cache' : 'public, max-age=31536000, immutable',
      ...SECURITY,
    },
  });
}

// ---------- Anmeldung ----------

const b64url = (buf) =>
  btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

async function sessionToken(password) {
  const key = await crypto.subtle.importKey('raw', enc.encode(password), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  return b64url(await crypto.subtle.sign('HMAC', key, enc.encode('mein-befinden-session-v1')));
}

function same(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let r = 0;
  for (let i = 0; i < a.length; i++) r |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return r === 0;
}

async function samePassword(given, expected) {
  // Über Hashes vergleichen: gleiche Länge, keine Rückschlüsse aus der Laufzeit.
  const h = async (s) => b64url(await crypto.subtle.digest('SHA-256', enc.encode(s)));
  return same(await h(given), await h(expected));
}

function readCookie(request, name) {
  const m = (request.headers.get('cookie') || '').match(new RegExp('(?:^|;\\s*)' + name + '=([^;]+)'));
  return m ? m[1] : null;
}

const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
async function pbkdf2(password, saltB64) {
  const salt = Uint8Array.from(atob(saltB64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey('raw', enc.encode(password), 'PBKDF2', false, ['deriveBits']);
  return b64(await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations: 100000 }, key, 256));
}
async function sha(s) {
  return b64url(await crypto.subtle.digest('SHA-256', enc.encode(s)));
}

/** Woran das Passwort geprüft wird: Cloudflare-Geheimnis oder in der App festgelegt (gespeichert als Hash). */
async function passwordState(env) {
  if (env.PASSWORT) return { kind: 'secret', key: env.PASSWORT };
  const rec = env.DATA ? await env.DATA.get('auth:pw', 'json') : null;
  return rec ? { kind: 'kv', key: rec.hash, rec } : null;
}
async function checkPassword(state, given) {
  if (state.kind === 'secret') return samePassword(given, state.key);
  return same(await pbkdf2(given, state.rec.salt), state.rec.hash);
}

async function signedIn(request, env) {
  const c = readCookie(request, COOKIE);
  const st = c ? await passwordState(env) : null;
  return !!(c && st && same(c, await sessionToken(st.key)));
}

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const safeNext = (n) => (typeof n === 'string' && n.startsWith('/') && !n.startsWith('//') ? n : '/');

const CSS = `
:root{color-scheme:light}*{box-sizing:border-box}
body{margin:0;min-height:100vh;display:grid;place-items:center;background:#eef3fc;color:#13254b;
font:16px/1.5 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif;padding:24px 16px}
main{width:min(380px,100%);background:#fff;border:1px solid #e1e8f5;border-radius:20px;padding:28px 22px;
box-shadow:0 10px 32px rgba(29,64,150,.12);display:flex;flex-direction:column;gap:12px}
img{width:64px;height:64px;border-radius:16px}h1{margin:4px 0 0;font-size:1.5rem}p{margin:0;color:#4a5878}
label{font-weight:700;font-size:.9rem}input{font:inherit;padding:12px 14px;border:1px solid #c9d4ea;border-radius:14px;width:100%}
input:focus{outline:2px solid #2b5ff0;outline-offset:1px}
button{font:inherit;font-weight:700;color:#fff;background:#2b5ff0;border:0;border-radius:999px;padding:13px 18px;cursor:pointer}
.err{color:#d23a43;font-weight:600}ol{margin:0;padding-left:1.2rem;color:#13254b}li{margin:.35rem 0}code{background:#eef3fc;padding:1px 6px;border-radius:6px}`;

function page(title, inner, status = 200, headers = {}) {
  return new Response(
    `<!doctype html><html lang="de"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">` +
      `<meta name="theme-color" content="#ffffff"><meta name="apple-mobile-web-app-capable" content="yes"><meta name="apple-mobile-web-app-title" content="Befinden">` +
      `<link rel="apple-touch-icon" href="/icon-180.png"><link rel="manifest" href="/manifest.webmanifest"><title>${esc(title)}</title><style>${CSS}</style></head>` +
      `<body><main>${inner}</main></body></html>`,
    { status, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store', ...SECURITY, ...headers } },
  );
}

function loginPage(next, error) {
  return page(
    'Mein Befinden – Anmelden',
    `<img src="/icon-180.png" alt=""><h1>Mein Befinden</h1><p>Bitte gib dein Passwort ein.</p>
<form method="post" action="/login" style="display:flex;flex-direction:column;gap:10px">
<input type="hidden" name="next" value="${esc(next)}">
<input type="text" name="username" value="Mein Befinden" autocomplete="username" style="display:none" aria-hidden="true" tabindex="-1">
<label for="pw">Passwort</label><input id="pw" type="password" name="password" autocomplete="current-password" required autofocus>
<button type="submit">Anmelden</button></form>${error ? `<p class="err">${esc(error)}</p>` : ''}`,
    error ? 401 : 200,
  );
}

function setupPage(error) {
  return page(
    'Mein Befinden – Passwort festlegen',
    `<img src="/icon-180.png" alt=""><h1>Passwort festlegen</h1>
<p>Einmalig: Gib den Einrichtungs-Code ein, den dir Claude im Chat genannt hat, und wähle dein Passwort.</p>
<form method="post" action="/setup" style="display:flex;flex-direction:column;gap:10px">
<label for="code">Einrichtungs-Code</label><input id="code" name="code" autocomplete="one-time-code" autocapitalize="characters" required>
<input type="text" name="username" value="Mein Befinden" autocomplete="username" style="display:none" aria-hidden="true" tabindex="-1">
<label for="pw">Neues Passwort (mind. 8 Zeichen)</label><input id="pw" type="password" name="password" autocomplete="new-password" minlength="8" required>
<label for="pw2">Passwort wiederholen</label><input id="pw2" type="password" name="password2" autocomplete="new-password" minlength="8" required>
<button type="submit">Speichern &amp; loslegen</button></form>${error ? `<p class="err">${esc(error)}</p>` : ''}`,
    error ? 400 : 200,
  );
}

async function tooManyFails(env, ip) {
  if (!env.DATA || !ip) return false;
  return Number((await env.DATA.get(`fail:${ip}`)) || 0) >= MAX_FAILS;
}
async function countFail(env, ip) {
  if (!env.DATA || !ip) return;
  const n = Number((await env.DATA.get(`fail:${ip}`)) || 0) + 1;
  await env.DATA.put(`fail:${ip}`, String(n), { expirationTtl: 3600 });
}

// ---------- Daten ----------

const DOC_PATH = /^(diary\/meta|entries\/\d{4}-W\d{2})$/;
const json = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', ...SECURITY } });

// Datenbank (Cloudflare D1, SQLite): eine Tabelle mit den Tagebuch-Dokumenten und eine mit
// früheren Fassungen. Cloudflare sichert D1 zusätzlich automatisch (Wiederherstellung bis 30 Tage).
// Ohne D1-Bindung (lokaler Test) dient der KV-Speicher als Ablage.
const KEEP_VERSIONS = 30;
let dbReady = null;
function ensureDb(env) {
  if (!env.DB) return Promise.resolve(false);
  dbReady ??= (async () => {
    await env.DB.batch([
      env.DB.prepare('CREATE TABLE IF NOT EXISTS docs (path TEXT PRIMARY KEY, body TEXT NOT NULL, updated_at TEXT NOT NULL)'),
      env.DB.prepare('CREATE TABLE IF NOT EXISTS doc_versions (id INTEGER PRIMARY KEY AUTOINCREMENT, path TEXT NOT NULL, body TEXT NOT NULL, saved_at TEXT NOT NULL)'),
      env.DB.prepare('CREATE INDEX IF NOT EXISTS doc_versions_path ON doc_versions (path, id)'),
    ]);
    // Einmalig: bisherige Daten aus dem KV-Speicher übernehmen (der KV-Stand bleibt als Kopie liegen).
    const n = await env.DB.prepare('SELECT COUNT(*) AS n FROM docs').first('n');
    if (!n && env.DATA) {
      const old = await listKvDocs(env);
      const now = new Date().toISOString();
      const rows = Object.entries(old).map(([path, body]) =>
        env.DB.prepare('INSERT OR IGNORE INTO docs (path, body, updated_at) VALUES (?, ?, ?)').bind(path, JSON.stringify(body), now),
      );
      if (rows.length) await env.DB.batch(rows);
    }
    return true;
  })().catch((e) => {
    dbReady = null;
    throw e;
  });
  return dbReady;
}

async function listKvDocs(env) {
  const out = {};
  let cursor;
  do {
    const page = await env.DATA.list({ prefix: 'doc:', cursor });
    const values = await Promise.all(page.keys.map((k) => env.DATA.get(k.name, 'json')));
    page.keys.forEach((k, i) => {
      if (values[i] !== null) out[k.name.slice(4)] = values[i];
    });
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return out;
}

async function listDocs(env) {
  if (!(await ensureDb(env))) return listKvDocs(env);
  const { results } = await env.DB.prepare('SELECT path, body FROM docs').all();
  return Object.fromEntries(results.map((r) => [r.path, JSON.parse(r.body)]));
}

async function putDoc(env, path, text) {
  if (!(await ensureDb(env))) return env.DATA.put(`doc:${path}`, text);
  const now = new Date().toISOString();
  await env.DB.batch([
    // alte Fassung aufheben, dann überschreiben, dann nur die letzten Fassungen behalten
    env.DB.prepare('INSERT INTO doc_versions (path, body, saved_at) SELECT path, body, updated_at FROM docs WHERE path = ? AND body <> ?').bind(path, text),
    env.DB.prepare('INSERT INTO docs (path, body, updated_at) VALUES (?, ?, ?) ON CONFLICT(path) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at').bind(path, text, now),
    env.DB.prepare('DELETE FROM doc_versions WHERE path = ? AND id NOT IN (SELECT id FROM doc_versions WHERE path = ? ORDER BY id DESC LIMIT ?)').bind(path, path, KEEP_VERSIONS),
  ]);
}

async function deleteDoc(env, path) {
  if (!(await ensureDb(env))) return env.DATA.delete(`doc:${path}`);
  await env.DB.batch([
    env.DB.prepare('INSERT INTO doc_versions (path, body, saved_at) SELECT path, body, updated_at FROM docs WHERE path = ?').bind(path),
    env.DB.prepare('DELETE FROM docs WHERE path = ?').bind(path),
  ]);
}

async function handleApi(request, env, url) {
  if (!env.DATA) return json({ error: 'Kein Speicher verbunden.' }, 500);
  if (url.pathname === '/api/docs' && request.method === 'GET') return json({ docs: await listDocs(env) });
  if (url.pathname === '/api/push') {
    if (request.method === 'GET') {
      const cfg = { ...PUSH_DEFAULT, ...((await env.DATA.get('push:settings', 'json')) || {}) };
      return json({ publicKey: env.VAPID_PUBLIC || null, devices: (await pushSubs(env)).length, ...cfg });
    }
    if (request.method === 'POST') {
      const body = await request.json().catch(() => ({}));
      if (body.subscription?.endpoint) {
        const id = `push:sub:${(await sha(body.subscription.endpoint)).slice(0, 24)}`;
        await env.DATA.put(id, JSON.stringify({ endpoint: body.subscription.endpoint }));
      }
      const old = (await env.DATA.get('push:settings', 'json')) || {};
      const next = { ...old };
      if (Array.isArray(body.times)) next.times = body.times.filter((t) => /^\d{2}:\d{2}$/.test(t)).slice(0, 6).sort();
      if (typeof body.tz === 'string' && body.tz.length < 64) next.tz = body.tz;
      if (typeof body.enabled === 'boolean') next.enabled = body.enabled;
      await env.DATA.put('push:settings', JSON.stringify(next));
      return json({ ok: true });
    }
  }
  if (url.pathname === '/api/push/test' && request.method === 'POST') {
    if (!env.VAPID_PRIVATE) return json({ error: 'Erinnerungen sind auf dem Server nicht eingerichtet.' }, 500);
    return json({ sent: await sendPushToAll(env) });
  }
  if (url.pathname === '/api/status' && request.method === 'GET') {
    // Für „Daten & Sicherung“: wo und wie viel gespeichert ist.
    if (!(await ensureDb(env))) return json({ storage: 'kv' });
    const docs = await env.DB.prepare('SELECT COUNT(*) AS n, MAX(updated_at) AS last FROM docs').first();
    const versions = await env.DB.prepare('SELECT COUNT(*) AS n FROM doc_versions').first('n');
    return json({ storage: 'd1', docs: docs.n, lastSaved: docs.last, versions });
  }
  if (url.pathname === '/api/health-key' && request.method === 'POST') {
    // Neuer Schlüssel für den Kurzbefehl; nur der Hash wird gespeichert, ein alter Schlüssel wird ungültig.
    const key = b64url(crypto.getRandomValues(new Uint8Array(24)));
    await env.DATA.put('auth:healthkey', await sha(key));
    return json({ key });
  }
  if (url.pathname === '/api/health-inbox') {
    if (request.method === 'GET') {
      const page = await env.DATA.list({ prefix: 'healthin:' });
      const items = await Promise.all(page.keys.map(async (k) => ({ id: k.name, text: await env.DATA.get(k.name) })));
      return json({ items: items.filter((x) => x.text) });
    }
    if (request.method === 'DELETE') {
      const id = url.searchParams.get('id') || '';
      if (id.startsWith('healthin:')) await env.DATA.delete(id);
      return json({ ok: true });
    }
  }
  if (url.pathname === '/api/doc') {
    const path = url.searchParams.get('path') || '';
    if (!DOC_PATH.test(path)) return json({ error: 'Ungültiger Pfad.' }, 400);
    if (request.method === 'PUT') {
      const text = await request.text();
      if (text.length > 5_000_000) return json({ error: 'Zu groß.' }, 413);
      try {
        JSON.parse(text);
      } catch {
        return json({ error: 'Kein gültiges JSON.' }, 400);
      }
      await putDoc(env, path, text);
      return json({ ok: true });
    }
    if (request.method === 'DELETE') {
      await deleteDoc(env, path);
      return json({ ok: true });
    }
  }
  return json({ error: 'Nicht gefunden.' }, 404);
}


// ---------- Erinnerungen (Web Push) ----------
// Das iPhone bekommt eine Mitteilung ohne Inhalt; den Text wählt der Service Worker nach Tageszeit.
// So ist keine Verschlüsselung nötig. Erinnert wird nur, wenn seit einer Weile nichts eingetragen wurde.

const PUSH_DEFAULT = { times: ['09:00', '14:00', '20:30'], tz: 'Europe/Vienna', quietMinutes: 90 };

async function vapidAuth(env, endpoint) {
  const jwk = JSON.parse(env.VAPID_PRIVATE);
  const key = await crypto.subtle.importKey('jwk', jwk, { name: 'ECDSA', namedCurve: 'P-256' }, false, ['sign']);
  const enc = (o) => b64url(new TextEncoder().encode(JSON.stringify(o)));
  const head = enc({ typ: 'JWT', alg: 'ES256' });
  const body = enc({ aud: new URL(endpoint).origin, exp: Math.floor(Date.now() / 1000) + 12 * 3600, sub: env.VAPID_SUBJECT || 'https://example.com' });
  const sig = await crypto.subtle.sign({ name: 'ECDSA', hash: 'SHA-256' }, key, new TextEncoder().encode(`${head}.${body}`));
  return `vapid t=${head}.${body}.${b64url(sig)}, k=${env.VAPID_PUBLIC}`;
}

async function pushSubs(env) {
  const page = await env.DATA.list({ prefix: 'push:sub:' });
  const subs = await Promise.all(page.keys.map(async (k) => ({ id: k.name, sub: await env.DATA.get(k.name, 'json') })));
  return subs.filter((x) => x.sub?.endpoint);
}

async function sendPushToAll(env) {
  let sent = 0;
  for (const { id, sub } of await pushSubs(env)) {
    const res = await fetch(sub.endpoint, {
      method: 'POST',
      headers: { Authorization: await vapidAuth(env, sub.endpoint), TTL: '3600', Urgency: 'normal', 'Content-Length': '0' },
    });
    if (res.status === 404 || res.status === 410) await env.DATA.delete(id);
    else if (res.ok) sent++;
  }
  return sent;
}

/** Uhrzeit und Datum in der Zeitzone des Nutzers. */
function localNow(tz) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
      .formatToParts(new Date())
      .map((p) => [p.type, p.value]),
  );
  return { date: `${parts.year}-${parts.month}-${parts.day}`, minutes: (Number(parts.hour) % 24) * 60 + Number(parts.minute) };
}

/** Zeitpunkt des letzten Eintrags (aus den Wochen-Dokumenten der Datenbank). */
async function lastEntryAt(env) {
  if (!(await ensureDb(env))) return 0;
  const { results } = await env.DB.prepare("SELECT body FROM docs WHERE path LIKE 'entries/%' ORDER BY path DESC LIMIT 2").all();
  let last = 0;
  for (const r of results) {
    const items = Object.values(JSON.parse(r.body).items || {});
    for (const e of items) last = Math.max(last, Date.parse(e.timestamp) || 0);
  }
  return last;
}

async function remind(env) {
  if (!env.VAPID_PRIVATE || !env.DATA) return;
  const cfg = { ...PUSH_DEFAULT, ...((await env.DATA.get('push:settings', 'json')) || {}) };
  if (cfg.enabled === false) return;
  const now = localNow(cfg.tz);
  const due = cfg.times.find((t) => {
    const [h, m] = t.split(':').map(Number);
    const d = now.minutes - (h * 60 + m);
    return d >= 0 && d < 15;
  });
  if (!due) return;
  const mark = `push:sent:${now.date}:${due}`;
  if (await env.DATA.get(mark)) return;
  await env.DATA.put(mark, '1', { expirationTtl: 2 * 86400 });
  if (Date.now() - (await lastEntryAt(env)) < cfg.quietMinutes * 60000) return; // gerade erst eingetragen
  await sendPushToAll(env);
}

// ---------- Einstieg ----------

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil(remind(env));
  },
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = decodeURIComponent(url.pathname);
    const ip = request.headers.get('cf-connecting-ip') || '';

    if (PUBLIC.has(path)) return serveFile(request, path);

    if (path === '/setup') {
      if (await passwordState(env)) return Response.redirect(new URL('/login', url).toString(), 303);
      if (request.method !== 'POST') return setupPage();
      if (await tooManyFails(env, ip)) return page('Zu viele Versuche', '<h1>Zu viele Versuche</h1><p>Bitte versuch es in einer Stunde nochmal.</p>', 429);
      const form = await request.formData();
      const code = String(form.get('code') || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
      const pw = String(form.get('password') || '');
      const expected = await env.DATA.get('auth:setup');
      if (!expected || !same(await sha(code), expected)) {
        await countFail(env, ip);
        return setupPage('Der Einrichtungs-Code stimmt nicht.');
      }
      if (pw.length < 8) return setupPage('Das Passwort braucht mindestens 8 Zeichen.');
      if (pw !== String(form.get('password2') || '')) return setupPage('Die beiden Passwörter sind nicht gleich.');
      const salt = b64(crypto.getRandomValues(new Uint8Array(16)));
      const rec = { salt, hash: await pbkdf2(pw, salt) };
      await env.DATA.put('auth:pw', JSON.stringify(rec));
      await env.DATA.delete('auth:setup');
      return new Response(null, {
        status: 303,
        headers: { location: '/', 'set-cookie': `${COOKIE}=${await sessionToken(rec.hash)}; Path=/; Max-Age=${YEAR}; HttpOnly; Secure; SameSite=Lax`, 'cache-control': 'no-store' },
      });
    }

    const state = await passwordState(env);

    if (path === '/login') {
      if (!state) return Response.redirect(new URL('/setup', url).toString(), 303);
      const next = safeNext(url.searchParams.get('next'));
      if (request.method === 'POST') {
        if (await tooManyFails(env, ip)) return page('Zu viele Versuche', '<h1>Zu viele Versuche</h1><p>Bitte versuch es in einer Stunde nochmal.</p>', 429);
        const form = await request.formData();
        const to = safeNext(form.get('next'));
        if (await checkPassword(state, String(form.get('password') || ''))) {
          return new Response(null, {
            status: 303,
            headers: {
              location: to,
              'set-cookie': `${COOKIE}=${await sessionToken(state.key)}; Path=/; Max-Age=${YEAR}; HttpOnly; Secure; SameSite=Lax`,
              'cache-control': 'no-store',
            },
          });
        }
        await countFail(env, ip);
        return loginPage(to, 'Das Passwort stimmt nicht.');
      }
      if (await signedIn(request, env)) return Response.redirect(new URL(next, url).toString(), 303);
      return loginPage(next);
    }

    if (path === '/logout') {
      return new Response(null, {
        status: 303,
        headers: { location: '/login', 'set-cookie': `${COOKIE}=; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`, 'cache-control': 'no-store' },
      });
    }

    // Apple-Health-Kurzbefehl: eigener Schlüssel statt Anmeldung (Kurzbefehle haben kein Cookie).
    // Wecker ausgeschaltet → Aufstehzeit. Eine iPhone-Automation ruft nur diese Adresse auf
    // (Schlüssel in der Adresse); die Uhrzeit ist der Zeitpunkt des Aufrufs.
    if (path === '/api/wake' && (request.method === 'GET' || request.method === 'POST')) {
      const key = (url.searchParams.get('key') || '').trim();
      const expected = env.DATA ? await env.DATA.get('auth:healthkey') : null;
      if (!key || !expected || !same(await sha(key), expected)) return json({ error: 'Schlüssel fehlt oder stimmt nicht.' }, 401);
      await env.DATA.put(`healthin:${Date.now()}`, JSON.stringify({ wake: new Date().toISOString() }), { expirationTtl: 60 * 60 * 24 * 30 });
      return new Response('Guten Morgen ☀ – Aufstehzeit gespeichert.', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }
    if (path === '/api/health' && request.method === 'POST') {
      const auth = request.headers.get('authorization') || '';
      const key = (auth.replace(/^Bearer\s+/i, '').trim() || url.searchParams.get('key') || '').trim();
      const expected = env.DATA ? await env.DATA.get('auth:healthkey') : null;
      if (!key || !expected || !same(await sha(key), expected)) return json({ error: 'Schlüssel fehlt oder stimmt nicht.' }, 401);
      const text = await request.text();
      if (!text.trim() || text.length > 20000) return json({ error: 'Leer oder zu groß.' }, 400);
      await env.DATA.put(`healthin:${Date.now()}`, text, { expirationTtl: 60 * 60 * 24 * 30 });
      return new Response('Gespeichert ✓ – „Mein Befinden“ übernimmt die Werte beim nächsten Öffnen.', { headers: { 'content-type': 'text/plain; charset=utf-8' } });
    }

    const isApi = path.startsWith('/api/');
    if (!state) return isApi ? json({ error: 'Noch kein Passwort festgelegt.' }, 503) : Response.redirect(new URL('/setup', url).toString(), 303);
    if (!(await signedIn(request, env))) {
      if (isApi) return json({ error: 'Bitte anmelden.' }, 401);
      return Response.redirect(new URL(`/login?next=${encodeURIComponent(path + url.search)}`, url).toString(), 303);
    }
    if (isApi) return handleApi(request, env, url);
    return serveFile(request, path);
  },
};
