// Packt die gebaute App (dist/) in EIN Cloudflare-Worker-Skript: alle Dateien eingebettet,
// ausgeliefert mit passendem Inhaltstyp. So reicht zum Veröffentlichen ein API-Token
// (ohne separaten Datei-Upload).
import { mkdirSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const root = 'dist';
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
};
const TEXT = new Set(['.html', '.js', '.css', '.webmanifest', '.json', '.svg', '.txt']);

function walk(dir) {
  return readdirSync(dir).flatMap((n) => {
    const p = join(dir, n);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

const files = {};
for (const p of walk(root)) {
  const rel = '/' + relative(root, p).split('\\').join('/');
  const ext = rel.slice(rel.lastIndexOf('.'));
  const type = TYPES[ext];
  if (!type) continue;
  const buf = readFileSync(p);
  files[rel] = TEXT.has(ext) ? { type, text: buf.toString('utf8') } : { type, b64: buf.toString('base64') };
}

const worker = `// Automatisch erzeugt von scripts/build-worker.mjs – nicht von Hand ändern.
const FILES = ${JSON.stringify(files)};
const decoded = new Map();
function body(path, f) {
  if (f.text !== undefined) return f.text;
  if (!decoded.has(path)) decoded.set(path, Uint8Array.from(atob(f.b64), (c) => c.charCodeAt(0)));
  return decoded.get(path);
}
export default {
  async fetch(request) {
    const url = new URL(request.url);
    let path = decodeURIComponent(url.pathname);
    if (path.endsWith('/')) path += 'index.html';
    let f = FILES[path];
    if (!f && !path.includes('.', path.lastIndexOf('/'))) {
      path = '/index.html';
      f = FILES[path];
    }
    if (!f) return new Response('Nicht gefunden', { status: 404, headers: { 'content-type': 'text/plain; charset=utf-8' } });
    const fresh = path === '/index.html' || path === '/sw.js' || path === '/manifest.webmanifest';
    return new Response(request.method === 'HEAD' ? null : body(path, f), {
      headers: {
        'content-type': f.type,
        'cache-control': fresh ? 'no-cache' : 'public, max-age=31536000, immutable',
        'x-content-type-options': 'nosniff',
        'referrer-policy': 'no-referrer',
      },
    });
  },
};
`;
mkdirSync('dist-worker', { recursive: true });
writeFileSync('dist-worker/worker.js', worker);
console.log(`dist-worker/worker.js – ${Object.keys(files).length} Dateien, ${(worker.length / 1024).toFixed(0)} KB`);
