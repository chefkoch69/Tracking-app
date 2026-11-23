import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Läuft in Node; ohne @types/node typisiert über globalThis.
const env = (globalThis as { process?: { env: Record<string, string | undefined> } }).process?.env ?? {};
const isArtifact = env.VITE_TARGET === 'artifact';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    // Für die Artifact-Seite alles (auch Schriften) in die eine Datei einbetten.
    assetsInlineLimit: isArtifact ? 100_000_000 : 4096,
  },
});
