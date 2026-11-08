/**
 * HabiZ Background Offline Synchronization Manager
 *
 * Implements a single-flight, idempotent synchronization engine that replays
 * offline transactional operations when network connectivity is verified.
 */

import {
  getPendingActions,
  updateActionStatus,
  deleteAction,
  getQueueStats,
} from './offlineDb';
import { getOnlineStatus, verifyServerReachability } from './networkStatus';

let isSyncRunning = false;
let lastSyncTimestamp = null;
const syncListeners = new Set();

/**
 * Executes a single queued action against the backend API.
 */
async function processAction(action, accessToken) {
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${accessToken}`,
    'X-Client-Idempotency-Key': action.idempotencyKey || action.id,
  };

  const { actionType, payload } = action;

  if (actionType === 'TRACK_HABIT') {
    const res = await fetch('/api/tracking', {
      method: 'POST',
      headers,
      body: JSON.stringify({
        habit_id: payload.habit_id,
        completion_date: payload.completion_date || payload.date,
        status: payload.status,
        quantity_completed: payload.quantity_completed ?? 0,
      }),
    });
    return res;
  }

  if (actionType === 'UPDATE_GOAL') {
    const res = await fetch('/api/goals', {
      method: 'PUT',
      headers,
      body: JSON.stringify({
        id: payload.id || payload.goal_id,
        current_value: payload.current_value,
        status: payload.status,
      }),
    });
    return res;
  }

  if (actionType === 'CREATE_REMINDER') {
    const res = await fetch('/api/reminders', {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });
    return res;
  }

  if (actionType === 'TOGGLE_TASK') {
    const res = await fetch('/api/learning?action=toggle_task', {
      method: 'PUT',
      headers,
      body: JSON.stringify(payload),
    });
    return res;
  }

  // Unknown action fallback
  return new Response(JSON.stringify({ error: `Unknown action type: ${actionType}` }), {
    status: 400,
    headers: { 'Content-Type': 'application/json' },
  });
}

/**
 * Triggers synchronization of all pending actions for the active session.
 * @param {string} userId
 * @param {string} accessToken
 * @returns {Promise<{ success: boolean, syncedCount: number, errorCount: number }>}
 */
export async function syncOfflineQueue(userId, accessToken) {
  if (!userId || !accessToken) {
    return { success: false, syncedCount: 0, errorCount: 0 };
  }

  if (isSyncRunning) {
    console.log('[SyncManager] Sync already in flight. Skipping duplicate trigger.');
    return { success: true, syncedCount: 0, errorCount: 0 };
  }

  // Ensure network is genuinely reachable before attempting sync
  if (!getOnlineStatus()) {
    const reachable = await verifyServerReachability(2500);
    if (!reachable) {
      console.log('[SyncManager] Cannot sync: offline.');
      return { success: false, syncedCount: 0, errorCount: 0 };
    }
  }

  isSyncRunning = true;
  notifySyncListeners(userId);

  let syncedCount = 0;
  let errorCount = 0;

  try {
    const pendingActions = await getPendingActions(userId);
    if (!pendingActions || pendingActions.length === 0) {
      isSyncRunning = false;
      notifySyncListeners(userId);
      return { success: true, syncedCount: 0, errorCount: 0 };
    }

    console.log(`[SyncManager] Replaying ${pendingActions.length} pending offline actions...`);

    for (const action of pendingActions) {
      await updateActionStatus(action.id, 'syncing');

      try {
        const response = await processAction(action, accessToken);

        if (response.ok) {
          // 2xx Success: server accepted the transaction
          await deleteAction(action.id);
          syncedCount++;

          // Emit domain events for UI components to refresh
          if (typeof window !== 'undefined') {
            if (action.actionType === 'TRACK_HABIT') {
              window.dispatchEvent(
                new CustomEvent('habittracker-stats-updated', { detail: { source: 'offline-sync' } })
              );
              if (action.payload.status) {
                window.dispatchEvent(
                  new CustomEvent('habittracker-entity-completed', {
                    detail: {
                      targetType: 'habit',
                      entityId: action.payload.habit_id,
                      date: action.payload.completion_date,
                    },
                  })
                );
              }
            } else if (action.actionType === 'UPDATE_GOAL') {
              window.dispatchEvent(
                new CustomEvent('habittracker-stats-updated', { detail: { source: 'offline-sync-goal' } })
              );
            }
          }
        } else if (response.status >= 400 && response.status < 500) {
          // 4xx Client/Validation Error: server permanently rejected the request
          const errData = await response.json().catch(() => ({}));
          const errMsg = errData.error || `Server rejected with ${response.status}`;
          console.warn(`[SyncManager] Action ${action.id} failed validation:`, errMsg);
          await updateActionStatus(action.id, 'failed', errMsg);
          errorCount++;
        } else {
          // 5xx Server Error or temporary error: keep pending to retry later
          console.warn(`[SyncManager] Server error ${response.status}. Retrying later.`);
          await updateActionStatus(action.id, 'pending', `HTTP ${response.status}`);
          errorCount++;
          break; // Stop further requests if server is unhealthy
        }
      } catch (networkErr) {
        // Network dropped mid-sync: revert to pending and pause
        console.warn('[SyncManager] Network dropped during action sync:', networkErr);
        await updateActionStatus(action.id, 'pending', 'Network disconnected');
        break;
      }
    }

    lastSyncTimestamp = new Date();
  } finally {
    isSyncRunning = false;
    notifySyncListeners(userId);
  }

  return { success: errorCount === 0, syncedCount, errorCount };
}

async function notifySyncListeners(userId) {
  const stats = await getQueueStats(userId);
  const detail = {
    isSyncing: isSyncRunning,
    pendingCount: stats.pending,
    syncingCount: stats.syncing,
    failedCount: stats.failed,
    totalQueued: stats.total,
    lastSyncTimestamp,
  };

  for (const listener of syncListeners) {
    try {
      listener(detail);
    } catch (e) {
      console.warn('[SyncManager] Listener error:', e);
    }
  }

  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('habiz-sync-status', { detail }));
  }
}

/**
 * Subscribes to synchronization lifecycle updates.
 */
export function subscribeSyncStatus(userId, callback) {
  syncListeners.add(callback);
  notifySyncListeners(userId);
  return () => syncListeners.delete(callback);
}

/**
 * Global background sync listener: auto-syncs when reconnecting.
 */
if (typeof window !== 'undefined') {
  window.addEventListener('habiz-connectivity-status', (e) => {
    if (e.detail?.isOnline) {
      // Trigger background sync if session available in local storage
      try {
        const stored = Object.keys(localStorage).find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
        if (stored) {
          const sessionData = JSON.parse(localStorage.getItem(stored) || '{}');
          if (sessionData?.access_token && sessionData?.user?.id) {
            syncOfflineQueue(sessionData.user.id, sessionData.access_token);
          }
        }
      } catch {}
    }
  });

  // Listen to service worker TRIGGER_BACKGROUND_SYNC message
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'TRIGGER_BACKGROUND_SYNC') {
        try {
          const stored = Object.keys(localStorage).find((k) => k.startsWith('sb-') && k.endsWith('-auth-token'));
          if (stored) {
            const sessionData = JSON.parse(localStorage.getItem(stored) || '{}');
            if (sessionData?.access_token && sessionData?.user?.id) {
              syncOfflineQueue(sessionData.user.id, sessionData.access_token);
            }
          }
        } catch {}
      }
    });
  }
}

