import { useState, useEffect } from 'react';
import { WifiOff, RefreshCw, CheckCircle2, AlertTriangle, CloudOff } from 'lucide-react';
import { useNetworkStatus } from '../hooks/useNetworkStatus';
import { useSyncManager } from '../hooks/useSyncManager';
import { motion, AnimatePresence } from 'framer-motion';

export default function OfflineStatusBanner() {
  const { isOnline, isChecking, checkNow } = useNetworkStatus();
  const { isSyncing, totalQueued, failedCount, triggerSync } = useSyncManager();
  const [showSyncedSuccess, setShowSyncedSuccess] = useState(false);
  const [prevSyncing, setPrevSyncing] = useState(false);

  // Trigger sync automatically when transitioning to online
  useEffect(() => {
    if (isOnline && totalQueued > 0 && !isSyncing) {
      triggerSync();
    }
  }, [isOnline, totalQueued, isSyncing, triggerSync]);

  // Track completion transition to display temporary success check
  useEffect(() => {
    if (prevSyncing && !isSyncing && failedCount === 0 && totalQueued === 0) {
      setShowSyncedSuccess(true);
      const timer = setTimeout(() => setShowSyncedSuccess(false), 3500);
      return () => clearTimeout(timer);
    }
    setPrevSyncing(isSyncing);
  }, [isSyncing, prevSyncing, failedCount, totalQueued]);

  // If online, not syncing, not failed, and not showing success, stay hidden
  if (isOnline && !isSyncing && failedCount === 0 && !showSyncedSuccess) {
    return null;
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: -10 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -10 }}
        className="w-full mb-3"
      >
        {!isOnline ? (
          <div className="bg-[#121c24] border border-amber-500/30 text-amber-200/90 rounded-xl px-3.5 py-2 flex flex-wrap items-center justify-between gap-2 shadow-sm text-xs">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-amber-400 animate-pulse" />
              <WifiOff size={14} className="text-amber-400 flex-shrink-0" />
              <span className="font-semibold text-amber-300">Offline Mode:</span>
              <span className="text-slate-300">
                Changes are saved locally and will auto-sync when reconnected.
              </span>
              {totalQueued > 0 && (
                <span className="ml-1 px-1.5 py-0.2 bg-amber-500/20 text-amber-300 rounded font-bold text-[10px]">
                  {totalQueued} pending
                </span>
              )}
            </div>
            <button
              onClick={checkNow}
              disabled={isChecking}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/15 hover:bg-amber-500/25 text-amber-200 border border-amber-500/30 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer disabled:opacity-50"
            >
              <RefreshCw size={11} className={isChecking ? 'animate-spin' : ''} />
              {isChecking ? 'Checking...' : 'Check Connection'}
            </button>
          </div>
        ) : isSyncing ? (
          <div className="bg-[#0f2120] border border-teal-500/30 text-teal-200 rounded-xl px-3.5 py-2 flex items-center justify-between gap-2 shadow-sm text-xs">
            <div className="flex items-center gap-2">
              <RefreshCw size={14} className="text-teal-400 animate-spin flex-shrink-0" />
              <span className="font-semibold text-teal-300">Syncing with cloud...</span>
              <span className="text-slate-300">
                Uploading {totalQueued} offline update{totalQueued > 1 ? 's' : ''}.
              </span>
            </div>
          </div>
        ) : failedCount > 0 ? (
          <div className="bg-[#241416] border border-rose-500/30 text-rose-200 rounded-xl px-3.5 py-2 flex items-center justify-between gap-2 shadow-sm text-xs">
            <div className="flex items-center gap-2">
              <AlertTriangle size={14} className="text-rose-400 flex-shrink-0" />
              <span className="font-semibold text-rose-300">Sync Issue:</span>
              <span className="text-slate-300">
                {failedCount} item{failedCount > 1 ? 's' : ''} encountered a validation error.
              </span>
            </div>
            <button
              onClick={triggerSync}
              className="inline-flex items-center gap-1 px-2.5 py-1 bg-rose-500/20 hover:bg-rose-500/30 text-rose-200 border border-rose-500/30 rounded-lg text-[11px] font-semibold transition-colors cursor-pointer"
            >
              Retry Sync
            </button>
          </div>
        ) : showSyncedSuccess ? (
          <div className="bg-[#0e211a] border border-emerald-500/30 text-emerald-200 rounded-xl px-3.5 py-2 flex items-center gap-2 shadow-sm text-xs">
            <CheckCircle2 size={14} className="text-emerald-400 flex-shrink-0" />
            <span className="font-semibold text-emerald-300">All changes synced!</span>
            <span className="text-slate-300">Your cloud backup is up to date.</span>
          </div>
        ) : null}
      </motion.div>
    </AnimatePresence>
  );
}

