import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { handleGoogleRedirect } from './lib/googleAuth';

// ── Global API URL Adapter (Transparently maps /api to VITE_API_URL or VITE_API_BASE_URL when set) ──
const API_BASE_URL = (import.meta.env.VITE_API_URL || import.meta.env.VITE_API_BASE_URL || '').replace(/\/$/, '');
if (API_BASE_URL && typeof window !== 'undefined') {
  const originalFetch = window.fetch;
  window.fetch = function (input, init) {
    if (typeof input === 'string' && input.startsWith('/api/')) {
      input = `${API_BASE_URL}${input}`;
    } else if (input instanceof Request && input.url.startsWith('/api/')) {
      input = new Request(`${API_BASE_URL}${input.url}`, input);
    }
    return originalFetch.call(this, input, init);
  };
}

// ── Global Error & Promise Rejection Handlers (E9) ──────────────────────────
if (typeof window !== 'undefined') {
  window.addEventListener('unhandledrejection', (event) => {
    console.error('[Global] Unhandled promise rejection:', event.reason);
  });

  const CHUNK_RELOAD_KEY = 'habiz_stale_chunk_reload';
  window.addEventListener('error', (event) => {
    console.error('[Global] Uncaught error:', event.error || event.message);
    const msg = event.message || event.error?.message || '';
    const isStaleChunk = /Failed to fetch dynamically imported module|Importing a module script failed/i.test(msg);
    if (isStaleChunk) {
      const alreadyReloaded = sessionStorage.getItem(CHUNK_RELOAD_KEY);
      if (!alreadyReloaded) {
        sessionStorage.setItem(CHUNK_RELOAD_KEY, '1');
        window.location.reload();
      }
    }
  });
}

handleGoogleRedirect();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// ── Service Worker Registration ─────────────────────────────────────────────
// Disabled in native Capacitor environments where assets are loaded locally from the APK
const isCapacitor = typeof window !== 'undefined' && 
  (window.location.protocol === 'capacitor:' || (window as unknown as { Capacitor?: unknown }).Capacitor !== undefined);

if ('serviceWorker' in navigator && !isCapacitor) {
  if (import.meta.env.DEV) {
    navigator.serviceWorker.getRegistrations().then((registrations) => {
      for (const registration of registrations) {
        registration.unregister().then((success) => {
          if (success) console.log('[SW] Unregistered development service worker');
        });
      }
    });
    if ('caches' in window) {
      caches.keys().then((keys) => {
        for (const key of keys) {
          caches.delete(key);
        }
      });
    }
  } else {
    window.addEventListener('load', () => {
      navigator.serviceWorker
        .register('/sw.js', { scope: '/' })
        .then((reg) => {
          console.log('[SW] Registered, scope:', reg.scope);
          reg.update().catch(() => {});
        })
        .catch((err) => {
          console.warn('[SW] Registration failed:', err);
        });
    });
  }
}
