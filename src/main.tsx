import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import { seedIfEmpty } from './lib/db';

// The service worker (app-shell cache) only runs in production builds.
if (import.meta.env.PROD && 'serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => {
      /* offline shell caching is best-effort */
    });
  });
}

seedIfEmpty()
  .catch(() => {
    /* fall through — the app still runs with an empty database */
  })
  .finally(() => {
    createRoot(document.getElementById('root')!).render(
      <StrictMode>
        <App />
      </StrictMode>
    );
  });
