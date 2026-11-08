import { useState, useEffect } from 'react';
import { Sparkles, RefreshCw, X } from 'lucide-react';

export default function PWAUpdateNotification() {
  const [waitingWorker, setWaitingWorker] = useState(null);
  const [show, setShow] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined' || !('serviceWorker' in navigator)) return;

    navigator.serviceWorker.getRegistration().then((reg) => {
      if (!reg) return;

      if (reg.waiting) {
        setWaitingWorker(reg.waiting);
        setShow(true);
      }

      reg.addEventListener('updatefound', () => {
        const newWorker = reg.installing;
        if (!newWorker) return;

        newWorker.addEventListener('statechange', () => {
          if (newWorker.state === 'installed' && navigator.serviceWorker.controller) {
            setWaitingWorker(newWorker);
            setShow(true);
          }
        });
      });
    });

    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!refreshing) {
        refreshing = true;
        window.location.reload();
      }
    });
  }, []);

  const handleUpdate = () => {
    if (waitingWorker) {
      waitingWorker.postMessage({ type: 'SKIP_WAITING' });
    } else {
      window.location.reload();
    }
  };

  const handleDismiss = () => {
    setShow(false);
  };

  if (!show) return null;

  return (
    <div className="fixed top-4 right-4 z-[200] max-w-sm w-[calc(100%-2rem)] bg-[#0f1721] border border-teal-500/40 rounded-2xl p-4 shadow-2xl text-xs text-slate-200">
      <div className="flex items-start gap-3">
        <div className="w-8 h-8 rounded-xl bg-teal-500/15 border border-teal-500/30 flex items-center justify-center flex-shrink-0 text-teal-300">
          <Sparkles size={16} />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-white text-sm">HabiZ Update Ready</p>
          <p className="text-slate-400 mt-0.5 leading-relaxed">
            A new version is available. Update now to load the latest features and optimizations.
          </p>
          <div className="flex items-center gap-2 mt-3">
            <button
              onClick={handleUpdate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#178274] hover:bg-[#136c60] text-white font-semibold rounded-xl transition-all cursor-pointer shadow-sm"
            >
              <RefreshCw size={12} />
              Update Now
            </button>
            <button
              onClick={handleDismiss}
              className="px-3 py-1.5 text-slate-400 hover:text-slate-200 font-medium transition-colors cursor-pointer"
            >
              Later
            </button>
          </div>
        </div>
        <button
          onClick={handleDismiss}
          className="text-slate-500 hover:text-slate-300 p-1 cursor-pointer"
          aria-label="Dismiss"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}

