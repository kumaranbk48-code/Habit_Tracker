import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, LogOut, RefreshCw, X } from 'lucide-react';
import { getQueueStats } from '../lib/offlineDb';
import { syncOfflineQueue } from '../lib/syncManager';

export default function SignOutConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  userId,
  accessToken,
  triggerElement,
}) {
  const dialogRef = useRef(null);
  const [stats, setStats] = useState({ pending: 0, syncing: 0, failed: 0, stuck: 0, total: 0 });
  const [queueError, setQueueError] = useState(false);
  const [isSyncingNow, setIsSyncingNow] = useState(false);
  const [isSigningOut, setIsSigningOut] = useState(false);

  // Load queue stats on open
  useEffect(() => {
    if (!isOpen || !userId) return;
    let mounted = true;
    setQueueError(false);

    getQueueStats(userId)
      .then((s) => {
        if (!mounted) return;
        if (!s || typeof s.total !== 'number') {
          setQueueError(true);
        } else {
          setStats(s);
        }
      })
      .catch(() => {
        if (mounted) setQueueError(true);
      });

    return () => {
      mounted = false;
    };
  }, [isOpen, userId]);

  // Focus trap & focus return
  useEffect(() => {
    if (!isOpen) return;

    const previousFocus = triggerElement || document.activeElement;
    const dialog = dialogRef.current;
    if (!dialog) return;

    // Focus first interactive element
    const focusable = dialog.querySelectorAll('button:not([disabled]), [tabindex="0"]');
    if (focusable.length > 0) {
      focusable[0].focus();
    }

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }

      if (e.key === 'Tab') {
        const focusableNodes = Array.from(dialog.querySelectorAll('button:not([disabled]), [tabindex="0"]'));
        if (focusableNodes.length === 0) return;

        const first = focusableNodes[0];
        const last = focusableNodes[focusableNodes.length - 1];

        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      if (previousFocus && typeof previousFocus.focus === 'function') {
        previousFocus.focus();
      }
    };
  }, [isOpen, onClose, triggerElement]);

  if (!isOpen) return null;

  const totalUnsynced = stats.pending + stats.syncing + stats.failed + stats.stuck;
  const hasUnsynced = totalUnsynced > 0 || queueError;

  const handleSyncAndSignOut = async () => {
    if (!userId || !accessToken) {
      handleFinalSignOut();
      return;
    }
    setIsSyncingNow(true);
    try {
      await syncOfflineQueue(userId, accessToken);
      // Recheck stats
      const freshStats = await getQueueStats(userId).catch(() => null);
      if (freshStats) setStats(freshStats);
    } catch (e) {
      console.warn('[SignOut] In-flight sync attempt failed:', e);
    } finally {
      setIsSyncingNow(false);
      handleFinalSignOut();
    }
  };

  const handleFinalSignOut = async () => {
    setIsSigningOut(true);
    try {
      await onConfirm();
    } finally {
      setIsSigningOut(false);
      onClose();
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
      onClick={(e) => {
        if (e.target === e.currentTarget && !isSigningOut) onClose();
      }}
      role="presentation"
    >
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="signout-dialog-title"
        aria-describedby="signout-dialog-desc"
        className="w-full max-w-[400px] bg-white dark:bg-[#151d24] border border-[#e2e8ec] dark:border-[#2a343d] rounded-2xl p-5 sm:p-6 shadow-2xl relative animate-in fade-in zoom-in-95 duration-150"
        style={{ width: 'min(92vw, 400px)' }}
      >
        <button
          onClick={onClose}
          disabled={isSigningOut}
          aria-label="Close dialog"
          className="absolute top-4 right-4 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer p-1 rounded-lg"
        >
          <X size={18} />
        </button>

        <div className="flex items-center gap-3 mb-3">
          <div className={`p-2.5 rounded-xl ${hasUnsynced ? 'bg-amber-500/15 text-amber-400' : 'bg-slate-100 dark:bg-slate-800 text-slate-400'}`}>
            {hasUnsynced ? <AlertTriangle size={22} /> : <LogOut size={22} />}
          </div>
          <div>
            <h2 id="signout-dialog-title" className="text-base font-bold text-slate-900 dark:text-white">
              {hasUnsynced ? 'Unsynced Offline Changes' : 'Confirm Sign Out'}
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              {hasUnsynced ? 'Data loss warning' : 'HabiZ Session'}
            </p>
          </div>
        </div>

        <div id="signout-dialog-desc" className="text-xs text-slate-600 dark:text-slate-300 mb-5 leading-relaxed">
          {queueError ? (
            <p className="bg-amber-500/10 border border-amber-500/20 text-amber-300 rounded-lg p-2.5">
              ⚠️ Unable to verify local offline queue status. Any pending changes on this device might not have reached the cloud and could be lost upon sign out.
            </p>
          ) : hasUnsynced ? (
            <div>
              <p className="mb-2">
                You have <span className="font-semibold text-amber-400">{totalUnsynced} offline change{totalUnsynced > 1 ? 's' : ''}</span> waiting to sync to your cloud account:
              </p>
              <ul className="list-disc list-inside space-y-0.5 text-[11px] text-slate-400 mb-2">
                {stats.pending > 0 && <li>{stats.pending} pending sync</li>}
                {stats.syncing > 0 && <li>{stats.syncing} currently syncing</li>}
                {stats.stuck > 0 && <li>{stats.stuck} stuck / paused</li>}
                {stats.failed > 0 && <li>{stats.failed} with validation error</li>}
              </ul>
              <p className="text-slate-400 text-[11px]">
                Signing out clears local device storage for multi-tenant privacy. Unsynced changes will be lost permanently.
              </p>
            </div>
          ) : (
            <p>
              Are you sure you want to sign out of your account? Your synchronized data is safe in the cloud.
            </p>
          )}
        </div>

        {/* Buttons: stacked under 420px, minimum 48px tap targets */}
        <div className="flex flex-col sm:flex-row gap-2.5 sm:gap-3">
          {hasUnsynced && (
            <button
              onClick={handleSyncAndSignOut}
              disabled={isSyncingNow || isSigningOut}
              className="w-full min-h-[48px] px-4 py-2.5 bg-teal-600 hover:bg-teal-500 text-white rounded-xl font-semibold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={14} className={isSyncingNow ? 'animate-spin' : ''} />
              {isSyncingNow ? 'Syncing...' : 'Sync & Sign Out'}
            </button>
          )}

          <button
            onClick={handleFinalSignOut}
            disabled={isSyncingNow || isSigningOut}
            className={`w-full min-h-[48px] px-4 py-2.5 rounded-xl font-semibold text-xs transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 ${
              hasUnsynced
                ? 'bg-rose-500/15 hover:bg-rose-500/25 text-rose-300 border border-rose-500/30'
                : 'bg-rose-600 hover:bg-rose-500 text-white'
            }`}
          >
            {isSigningOut ? 'Signing Out...' : hasUnsynced ? 'Sign Out Anyway' : 'Sign Out'}
          </button>

          <button
            onClick={onClose}
            disabled={isSigningOut}
            className="w-full min-h-[48px] px-4 py-2.5 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-300 rounded-xl font-semibold text-xs transition-colors flex items-center justify-center cursor-pointer"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
