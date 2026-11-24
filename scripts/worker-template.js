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

async function listDocs(env) {
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

async function handleApi(request, env, url) {
  if (!env.DATA) return json({ error: 'Kein Speicher verbunden.' }, 500);
  if (url.pathname === '/api/docs' && request.method === 'GET') return json({ docs: await listDocs(env) });
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
      await env.DATA.put(`doc:${path}`, text);
      return json({ ok: true });
    }
    if (request.method === 'DELETE') {
      await env.DATA.delete(`doc:${path}`);
      return json({ ok: true });
    }
  }
  return json({ error: 'Nicht gefunden.' }, 404);
}

// ---------- Einstieg ----------

export default {
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
