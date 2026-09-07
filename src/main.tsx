import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App.tsx';
import { handleGoogleRedirect } from './lib/googleAuth';

handleGoogleRedirect();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);

// ── Service Worker Registration ─────────────────────────────────────────────
// Registered AFTER React renders so it never blocks the initial paint.
// The SW file lives at /sw.js (public folder) so it has root scope — it can
// intercept fetch events for the entire app including /api/* routes.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register('/sw.js', { scope: '/' })
      .then((reg) => {
        console.log('[SW] Registered, scope:', reg.scope);

        // Check for updates on every page load
        reg.update().catch(() => {});
      })
      .catch((err) => {
        console.warn('[SW] Registration failed:', err);
      });
  });
}
