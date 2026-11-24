// Fügt den Vite-Build zu EINER Seite zusammen (CSS und JS inline),
// damit sie als claude.ai-Artifact veröffentlicht werden kann.
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = 'dist-artifact/build/assets';
const files = readdirSync(dir);
const css = files.filter((f) => f.endsWith('.css')).map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');
const js = files.filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(dir, f), 'utf8')).join('\n');

const page = `<title>Mein Befinden</title>
<meta name="claude:viewport-fit-sides" content="cover">
<meta name="description" content="Dein Gesundheitstagebuch: Beschwerden, Essen und Medikamente schnell eintragen, Muster erkennen, Arzttermin vorbereiten.">
<style>${css}</style>
<div id="root"></div>
<script type="module">${js.replace(/<\/script/gi, '<\\/script')}</script>
`;
writeFileSync('dist-artifact/tracker.html', page);
console.log(`dist-artifact/tracker.html – ${(page.length / 1024).toFixed(0)} KB`);
