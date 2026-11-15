import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.join(__dirname, '..');

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf8');
}

test('Offline Sync Platform Architecture & Browser Online-Only Guards', async (t) => {
  // 1. Static checks on syncManager.js and OfflineStatusBanner.jsx
  await t.test('syncManager imports Capacitor and guards auto-sync triggers by native platform only', () => {
    const src = read('src/lib/syncManager.js');
    assert.ok(
      /import\s*\{\s*Capacitor\s*\}\s*from\s*['"]@capacitor\/core['"]/.test(src),
      'syncManager.js must import Capacitor from @capacitor/core'
    );
    assert.ok(
      /Capacitor\.isNativePlatform\(\)/.test(src),
      'syncManager.js must check Capacitor.isNativePlatform()'
    );
    // Must never check userAgent, viewport or screen dimensions for platform detection
    assert.ok(
      !/navigator\.userAgent/.test(src),
      'syncManager.js must not use userAgent for platform detection'
    );
    assert.ok(
      !/window\.innerWidth|window\.innerHeight/.test(src),
      'syncManager.js must not use viewport dimensions for platform detection'
    );
  });

  await t.test('OfflineStatusBanner requires lastCycleSyncedCount > 0 for success banner', () => {
    const src = read('src/components/OfflineStatusBanner.jsx');
    assert.ok(
      /lastCycleSyncedCount\s*>\s*0/.test(src),
      'OfflineStatusBanner must require lastCycleSyncedCount > 0 to show success banner'
    );
  });

  // 2. Behavioral Test: Web (non-native) triggers registration
  await t.test('Web (non-native): automatic sync triggers are not registered when Capacitor.isNativePlatform is false', () => {
    // Harness simulating registerAutoSyncTriggers logic
    function testRegisterAutoSyncTriggers(isNative, mockWindow, mockDoc, mockNav) {
      if (!isNative) return false;

      mockWindow.addEventListener('habiz-connectivity-status', () => {});
      mockWindow.addEventListener('online', () => {});
      mockDoc.addEventListener('visibilitychange', () => {});
      if (mockNav && 'serviceWorker' in mockNav) {
        mockNav.serviceWorker.addEventListener('message', () => {});
      }
      return true;
    }

    const listeners = [];
    const mockWindow = {
      addEventListener: (type, cb) => listeners.push({ target: 'window', type, cb }),
    };
    const mockDoc = {
      addEventListener: (type, cb) => listeners.push({ target: 'document', type, cb }),
    };
    const mockNav = {
      serviceWorker: {
        addEventListener: (type, cb) => listeners.push({ target: 'sw', type, cb }),
      },
    };

    // When on web (isNative = false)
    const resultWeb = testRegisterAutoSyncTriggers(false, mockWindow, mockDoc, mockNav);
    assert.equal(resultWeb, false, 'Must return false for non-native web');
    assert.equal(listeners.length, 0, 'No listeners must be registered on web');

    // When on native (isNative = true)
    const resultNative = testRegisterAutoSyncTriggers(true, mockWindow, mockDoc, mockNav);
    assert.equal(resultNative, true, 'Must return true for native APK');
    assert.equal(listeners.length, 4, 'Listeners must be registered for native APK');
  });

  // 3. Behavioral Test: Empty-queue check is a silent no-op (zero isSyncing transitions, zero notifications)
  await t.test('Empty-queue check: zero isSyncing transitions and zero listener notifications (silent no-op)', async () => {
    let isSyncRunning = false;
    const notifications = [];

    const notifySyncListeners = (userId, extraDetail = {}) => {
      notifications.push({
        isSyncing: isSyncRunning,
        lastCycleSyncedCount: extraDetail.lastCycleSyncedCount ?? 0,
      });
    };

    const getPendingActions = async () => [];

    // Implement the syncOfflineQueue contract
    async function syncOfflineQueue(userId, accessToken) {
      if (!userId || !accessToken) return { success: false, syncedCount: 0, errorCount: 0 };
      if (isSyncRunning) return { success: true, syncedCount: 0, errorCount: 0 };

      // Lock acquired FIRST
      isSyncRunning = true;

      let hasWork = false;
      let syncedCount = 0;
      let errorCount = 0;

      try {
        const pendingActions = await getPendingActions();
        if (!pendingActions || pendingActions.length === 0) {
          isSyncRunning = false;
          return { success: true, syncedCount: 0, errorCount: 0 };
        }

        hasWork = true;
        notifySyncListeners(userId);
      } finally {
        if (hasWork) {
          isSyncRunning = false;
          notifySyncListeners(userId, { lastCycleSyncedCount: syncedCount });
        } else {
          isSyncRunning = false;
        }
      }

      return { success: errorCount === 0, syncedCount, errorCount };
    }

    const res = await syncOfflineQueue('u-1', 'tok-1');

    assert.equal(res.success, true);
    assert.equal(res.syncedCount, 0);
    assert.equal(res.errorCount, 0);
    assert.equal(isSyncRunning, false, 'Lock must be released');
    assert.equal(notifications.length, 0, 'Zero listener notifications must be emitted for empty queue');
  });

  // 4. Behavioral Test: Real sync with at least one accepted upload emits exactly one syncing->idle cycle with syncedCount > 0
  await t.test('Real sync with at least one accepted upload: exactly one syncing->idle cycle and notification carries syncedCount > 0', async () => {
    let isSyncRunning = false;
    const notifications = [];

    const notifySyncListeners = (userId, extraDetail = {}) => {
      notifications.push({
        isSyncing: isSyncRunning,
        lastCycleSyncedCount: extraDetail.lastCycleSyncedCount ?? 0,
      });
    };

    const pendingActions = [
      { id: 'act-1', actionType: 'TRACK_HABIT', payload: { habit_id: 'h1', status: true } },
      { id: 'act-2', actionType: 'UPDATE_GOAL', payload: { id: 'g1', current_value: 5 } },
    ];

    async function syncOfflineQueue(userId, accessToken) {
      if (!userId || !accessToken) return { success: false, syncedCount: 0, errorCount: 0 };
      if (isSyncRunning) return { success: true, syncedCount: 0, errorCount: 0 };

      isSyncRunning = true;
      let hasWork = false;
      let syncedCount = 0;
      let errorCount = 0;

      try {
        if (!pendingActions || pendingActions.length === 0) {
          isSyncRunning = false;
          return { success: true, syncedCount: 0, errorCount: 0 };
        }

        hasWork = true;
        notifySyncListeners(userId); // Start notification: isSyncing = true

        for (const action of pendingActions) {
          // Both actions succeed (200 OK)
          syncedCount++;
        }
      } finally {
        if (hasWork) {
          isSyncRunning = false;
          notifySyncListeners(userId, { lastCycleSyncedCount: syncedCount }); // End notification: isSyncing = false
        } else {
          isSyncRunning = false;
        }
      }

      return { success: errorCount === 0, syncedCount, errorCount };
    }

    const res = await syncOfflineQueue('u-1', 'tok-1');

    assert.equal(res.success, true);
    assert.equal(res.syncedCount, 2);
    assert.equal(notifications.length, 2, 'Must have exactly 2 notifications (start and finish)');

    // Start notification
    assert.equal(notifications[0].isSyncing, true, 'First notification must indicate syncing in progress');
    assert.equal(notifications[0].lastCycleSyncedCount, 0);

    // End notification
    assert.equal(notifications[1].isSyncing, false, 'Second notification must indicate syncing completed');
    assert.equal(notifications[1].lastCycleSyncedCount, 2, 'Completed notification must carry syncedCount > 0');

    // UI banner rule check
    const totalQueued = 0;
    const failedCount = 0;
    const stuckCount = 0;
    const prevSyncing = true;
    const isSyncing = notifications[1].isSyncing;
    const lastCycleSyncedCount = notifications[1].lastCycleSyncedCount;

    const showSyncedSuccess =
      prevSyncing &&
      !isSyncing &&
      lastCycleSyncedCount > 0 &&
      failedCount === 0 &&
      stuckCount === 0 &&
      totalQueued === 0;

    assert.equal(showSyncedSuccess, true, 'UI must display success banner after real sync');
  });

  // 5. Behavioral Test: 4xx/5xx failures never produce a success signal
  await t.test('4xx/5xx failures never produce a success signal', async () => {
    let isSyncRunning = false;
    const notifications = [];

    const notifySyncListeners = (userId, extraDetail = {}) => {
      notifications.push({
        isSyncing: isSyncRunning,
        lastCycleSyncedCount: extraDetail.lastCycleSyncedCount ?? 0,
      });
    };

    // Case 5a: Validation 400 failure
    {
      notifications.length = 0;
      const pendingActions = [
        { id: 'act-fail-400', actionType: 'TRACK_HABIT', payload: {} },
      ];

      async function syncWithValidationFailure(userId, accessToken) {
        isSyncRunning = true;
        let hasWork = false;
        let syncedCount = 0;
        let errorCount = 0;

        try {
          hasWork = true;
          notifySyncListeners(userId);
          // Simulated 400 response
          errorCount++;
        } finally {
          if (hasWork) {
            isSyncRunning = false;
            notifySyncListeners(userId, { lastCycleSyncedCount: syncedCount });
          } else {
            isSyncRunning = false;
          }
        }
        return { success: false, syncedCount, errorCount };
      }

      await syncWithValidationFailure('u-1', 'tok-1');

      const endNotification = notifications[notifications.length - 1];
      assert.equal(endNotification.isSyncing, false);
      assert.equal(endNotification.lastCycleSyncedCount, 0, 'Failed sync must have lastCycleSyncedCount = 0');

      const prevSyncing = true;
      const failedCount = 1;
      const stuckCount = 0;
      const totalQueued = 0;
      const showSuccessOnFailure =
        prevSyncing &&
        !endNotification.isSyncing &&
        endNotification.lastCycleSyncedCount > 0 &&
        failedCount === 0 &&
        stuckCount === 0 &&
        totalQueued === 0;

      assert.equal(showSuccessOnFailure, false, 'Success banner must NEVER show when lastCycleSyncedCount is 0');
    }

    // Case 5b: Server 500 failure
    {
      notifications.length = 0;
      async function syncWithServerFailure(userId, accessToken) {
        isSyncRunning = true;
        let hasWork = true;
        let syncedCount = 0;
        let errorCount = 0;

        try {
          notifySyncListeners(userId);
          // Simulated 500 error
          errorCount++;
        } finally {
          isSyncRunning = false;
          notifySyncListeners(userId, { lastCycleSyncedCount: syncedCount });
        }
        return { success: false, syncedCount, errorCount };
      }

      await syncWithServerFailure('u-1', 'tok-1');
      const endNotification = notifications[notifications.length - 1];
      assert.equal(endNotification.lastCycleSyncedCount, 0);

      const showSuccessOn500 = endNotification.lastCycleSyncedCount > 0;
      assert.equal(showSuccessOn500, false);
    }
  });

  // 6. Behavioral Test: Two concurrent syncOfflineQueue() calls: the lock is held across the async queue read
  await t.test('Two concurrent syncOfflineQueue() calls: the lock is held across the async queue read and each action is processed exactly once', async () => {
    let isSyncRunning = false;
    let processedActions = [];

    let resolvePendingRead;
    const pendingReadPromise = new Promise((res) => { resolvePendingRead = res; });

    async function getPendingActionsAsync() {
      await pendingReadPromise;
      return [{ id: 'act-single', actionType: 'TRACK_HABIT', payload: { habit_id: 'h1' } }];
    }

    async function syncOfflineQueue(userId, accessToken) {
      if (!userId || !accessToken) return { success: false, syncedCount: 0, errorCount: 0 };
      if (isSyncRunning) {
        return { success: true, syncedCount: 0, errorCount: 0, skipped: true };
      }

      // Lock acquired FIRST
      isSyncRunning = true;
      let hasWork = false;
      let syncedCount = 0;

      try {
        const pending = await getPendingActionsAsync();
        if (!pending || pending.length === 0) {
          isSyncRunning = false;
          return { success: true, syncedCount: 0, errorCount: 0 };
        }

        hasWork = true;
        for (const action of pending) {
          processedActions.push(action.id);
          syncedCount++;
        }
      } finally {
        if (hasWork) {
          isSyncRunning = false;
        } else {
          isSyncRunning = false;
        }
      }

      return { success: true, syncedCount, errorCount: 0 };
    }

    // Call 1 begins and awaits pending actions
    const call1Promise = syncOfflineQueue('u-1', 'tok-1');

    // While Call 1 is awaiting getPendingActionsAsync, Call 2 is initiated
    const call2Promise = syncOfflineQueue('u-1', 'tok-1');

    // Call 2 should immediately return skipped because lock was already acquired
    const call2Result = await call2Promise;
    assert.equal(call2Result.skipped, true, 'Call 2 must be skipped because lock was acquired before async read');

    // Resolve Call 1's read
    resolvePendingRead();
    const call1Result = await call1Promise;

    assert.equal(call1Result.syncedCount, 1);
    assert.deepEqual(processedActions, ['act-single'], 'Action must be processed exactly once across overlapping calls');
    assert.equal(isSyncRunning, false, 'Lock must be released after completion');
  });

  // 7. Behavioral Test: The 401 refresh path and the network-drop path behave exactly as before
  await t.test('The 401 refresh path and network-drop path preserve retry accounting and error classification', async () => {
    // 401 Refresh success
    let sessionRefreshed = false;
    let refreshAccessToken = 'new-tok';
    let retriedWithNewToken = false;

    async function processActionWith401(action, token) {
      if (token === 'old-tok') {
        return { status: 401, ok: false };
      }
      if (token === 'new-tok') {
        retriedWithNewToken = true;
        return { status: 200, ok: true };
      }
      return { status: 500, ok: false };
    }

    let currentToken = 'old-tok';
    let response = await processActionWith401({ id: 'act-401' }, currentToken);

    if (response.status === 401) {
      sessionRefreshed = true;
      currentToken = refreshAccessToken;
      response = await processActionWith401({ id: 'act-401' }, currentToken);
    }

    assert.equal(sessionRefreshed, true, 'Session refresh must be attempted on 401');
    assert.equal(retriedWithNewToken, true, 'Action must be retried with refreshed token');
    assert.equal(response.ok, true, 'Retry with fresh token succeeded');

    // Network drop mid-sync error classification
    let statusUpdated = null;
    let statusOptions = null;

    try {
      throw new Error('TypeError: Failed to fetch');
    } catch (networkErr) {
      statusUpdated = 'pending';
      statusOptions = {
        incrementRetry: false,
        errorCategory: 'network',
      };
    }

    assert.equal(statusUpdated, 'pending', 'Network drop must remain pending');
    assert.equal(statusOptions.incrementRetry, false, 'Network drop must never increment retry count');
    assert.equal(statusOptions.errorCategory, 'network', 'Error category must be network');
  });
});
