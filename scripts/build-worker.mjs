// Packt die gebaute App (dist/) in EIN Cloudflare-Worker-Skript: alle Dateien eingebettet und
// mit Anmeldung und Datenspeicher aus scripts/worker-template.js. So reicht zum Veröffentlichen
// ein API-Token (ohne separaten Datei-Upload).
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

const template = readFileSync('scripts/worker-template.js', 'utf8');
const worker = `// Automatisch erzeugt von scripts/build-worker.mjs – nicht von Hand ändern.\nconst FILES = ${JSON.stringify(files)};\n${template}`;
mkdirSync('dist-worker', { recursive: true });
writeFileSync('dist-worker/worker.js', worker);
console.log(`dist-worker/worker.js – ${Object.keys(files).length} Dateien, ${(worker.length / 1024).toFixed(0)} KB`);
