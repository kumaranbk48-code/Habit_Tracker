import { useState, useEffect } from 'react';
import { Download, X } from 'lucide-react';

export default function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [show, setShow] = useState(false);
  const [installed, setInstalled] = useState(false);

  useEffect(() => {
    // Don't show if already dismissed or in standalone mode (already installed)
    const dismissed = localStorage.getItem('pwa-banner-dismissed');
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;

    if (dismissed || isStandalone) return;

    const handler = (e) => {
      e.preventDefault(); // Stop the browser's default mini-infobar
      setDeferredPrompt(e);
      setShow(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => setInstalled(true));

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setInstalled(true);
      setShow(false);
    }
    setDeferredPrompt(null);
  };

  const handleDismiss = () => {
    setShow(false);
    localStorage.setItem('pwa-banner-dismissed', '1');
  };

  if (!show || installed) return null;

  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[150] w-[calc(100%-2rem)] max-w-sm toast-enter">
      <div className="bg-white dark:bg-[#1a2129] border border-[#e2e8ec] dark:border-[#2a343d] rounded-2xl shadow-2xl p-4 flex items-center gap-3">
        <div className="w-10 h-10 bg-[#3d7a75] rounded-xl flex items-center justify-center flex-shrink-0">
          <Download size={18} className="text-white" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-gray-900 dark:text-gray-100 text-sm">Install HabitTracker</p>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Add to home screen for offline access</p>
        </div>
        <button
          onClick={handleInstall}
          className="flex-shrink-0 bg-[#3d7a75] hover:bg-[#2f5f5b] text-white text-xs font-semibold px-3 py-2 rounded-lg transition-colors install-pulse"
        >
          Install
        </button>
        <button
          onClick={handleDismiss}
          className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
