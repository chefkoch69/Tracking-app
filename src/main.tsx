import { StrictMode } from 'react';
import { CloudSyncProvider } from './platform/cloudSync';
import { createRoot } from 'react-dom/client';
import { StoreProvider } from './state/store';
import { App } from './app/App';
import '@fontsource/montserrat/latin-400.css';
import '@fontsource/montserrat/latin-500.css';
import '@fontsource/montserrat/latin-600.css';
import '@fontsource/montserrat/latin-700.css';
import '@fontsource/playfair-display/latin-700.css';
import './styles/index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <StoreProvider>
      <CloudSyncProvider>
        <App />
      </CloudSyncProvider>
    </StoreProvider>
  </StrictMode>,
);

if ('serviceWorker' in navigator && import.meta.env.PROD && import.meta.env.VITE_TARGET !== 'artifact') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js').catch(() => undefined);
  });
}
