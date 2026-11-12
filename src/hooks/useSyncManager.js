import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { subscribeSyncStatus, syncOfflineQueue, retryStuckSyncQueue } from '../lib/syncManager';
import { getQueueStats } from '../lib/offlineDb';

/**
 * React hook for observing sync queue status and triggering manual or automatic sync.
 */
export function useSyncManager() {
  const { user, session } = useAuth();
  const [syncState, setSyncState] = useState({
    isSyncing: false,
    pendingCount: 0,
    syncingCount: 0,
    failedCount: 0,
    stuckCount: 0,
    totalQueued: 0,
    lastSyncTimestamp: null,
  });

  useEffect(() => {
    if (!user?.id) return;

    // Refresh immediately
    getQueueStats(user.id).then((stats) => {
      setSyncState((prev) => ({
        ...prev,
        pendingCount: stats.pending,
        syncingCount: stats.syncing,
        failedCount: stats.failed,
        stuckCount: stats.stuck || 0,
        totalQueued: stats.total,
      }));
    });

    const unsubscribe = subscribeSyncStatus(user.id, (updated) => {
      setSyncState(updated);
    });

    const handleQueueChange = () => {
      getQueueStats(user.id).then((stats) => {
        setSyncState((prev) => ({
          ...prev,
          pendingCount: stats.pending,
          syncingCount: stats.syncing,
          failedCount: stats.failed,
          stuckCount: stats.stuck || 0,
          totalQueued: stats.total,
        }));
      });
    };

    window.addEventListener('habiz-offline-queue-changed', handleQueueChange);

    return () => {
      unsubscribe();
      window.removeEventListener('habiz-offline-queue-changed', handleQueueChange);
    };
  }, [user?.id]);

  const triggerSync = useCallback(async () => {
    if (!user?.id || !session?.access_token) return;
    return await syncOfflineQueue(user.id, session.access_token);
  }, [user?.id, session?.access_token]);

  const retryStuck = useCallback(async () => {
    if (!user?.id || !session?.access_token) return;
    return await retryStuckSyncQueue(user.id, session.access_token);
  }, [user?.id, session?.access_token]);

  return {
    ...syncState,
    triggerSync,
    retryStuck,
  };
}

