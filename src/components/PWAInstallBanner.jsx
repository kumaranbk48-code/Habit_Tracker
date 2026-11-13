import { useState, useEffect } from 'react';
import { Download, ShieldCheck, X } from 'lucide-react';
import { Capacitor } from '@capacitor/core';

export default function PWAInstallBanner() {
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [show, setShow] = useState(false);
  const [installed, setInstalled] = useState(false);

  const isNative = typeof Capacitor !== 'undefined' && typeof Capacitor.isNativePlatform === 'function'
    ? Capacitor.isNativePlatform()
    : false;
  const isAndroidWeb = !isNative && typeof navigator !== 'undefined' && /android/i.test(navigator.userAgent || '');

  useEffect(() => {
    if (isNative) return;

    // Don't show if already dismissed or in standalone mode (already installed)
    const dismissed = localStorage.getItem('pwa-banner-dismissed');
    const isStandalone = window.matchMedia('(display-mode: standalone)').matches
      || window.navigator.standalone === true;

    if (dismissed || isStandalone) return;

    if (isAndroidWeb) {
      // On Android web browser, show APK installer banner after initial 2s delay
      const timer = setTimeout(() => setShow(true), 2000);
      return () => clearTimeout(timer);
    }

    const handler = (e) => {
      e.preventDefault(); // Stop the browser's default mini-infobar
      setDeferredPrompt(e);
      setShow(true);
    };

    window.addEventListener('beforeinstallprompt', handler);
    window.addEventListener('appinstalled', () => setInstalled(true));

    return () => window.removeEventListener('beforeinstallprompt', handler);
  }, [isNative, isAndroidWeb]);

  const handleInstall = async () => {
    if (isAndroidWeb) {
      // Direct APK download on Android mobile browser
      window.location.href = '/downloads/HabiZ.apk';
      setShow(false);
      return;
    }

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

  if (!show || installed || isNative) return null;

  return (
    <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-[150] w-[calc(100%-2rem)] max-w-sm toast-enter">
      <div className="bg-white dark:bg-[#1a2129] border border-[#e2e8ec] dark:border-[#2a343d] rounded-2xl shadow-2xl p-4 flex flex-col gap-2">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-[#3d7a75] rounded-xl flex items-center justify-center flex-shrink-0">
            <Download size={18} className="text-white" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-900 dark:text-white text-sm">
              {isAndroidWeb ? 'Install HabiZ Android App' : 'Install HabiZ'}
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 truncate">
              {isAndroidWeb ? 'Full offline habits, exact alarms & sync' : 'Add to home screen for offline access'}
            </p>
          </div>
          <button
            onClick={handleInstall}
            className="flex-shrink-0 bg-[#178274] hover:bg-[#136c60] text-white text-xs font-bold px-3.5 py-2 rounded-xl transition-all shadow-md shadow-teal-950/40 cursor-pointer"
          >
            {isAndroidWeb ? 'Download' : 'Install'}
          </button>
          <button
            onClick={handleDismiss}
            aria-label="Dismiss banner"
            className="flex-shrink-0 p-1 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 cursor-pointer"
          >
            <X size={14} />
          </button>
        </div>
        {isAndroidWeb && (
          <div className="flex items-center gap-1.5 text-[10px] text-teal-400/80 pt-0.5 pl-1">
            <ShieldCheck size={12} className="flex-shrink-0" />
            <span>Official release • Verified by Google Play Protect</span>
          </div>
        )}
      </div>
    </div>
  );
}
