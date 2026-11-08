/**
 * HabiZ Offline Storage & Synchronization Database (IndexedDB)
 *
 * Provides transactional local persistence for:
 * 1. Application data caching (habits, tracking, goals, learning hub, reminders, stats)
 *    keyed per authenticated userId to guarantee strict multi-tenant separation.
 * 2. Idempotent Offline Synchronization Queue (deduplicated actions, status tracking,
 *    and replay capabilities upon network recovery).
 */

const DB_NAME = 'habiz_offline_db';
const DB_VERSION = 1;

const STORES = {
  CACHED_DATA: 'cached_data',
  SYNC_QUEUE: 'sync_queue',
};

let dbPromise = null;

function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'habiz-op-' + Date.now().toString(36) + '-' + Math.random().toString(36).substring(2, 9);
}

/**
 * Initializes and upgrades the IndexedDB database.
 * @returns {Promise<IDBDatabase>}
 */
export function openOfflineDb() {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return Promise.resolve(null);
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onupgradeneeded = (event) => {
      const db = request.result;

      // 1. Cached Application Data Store
      if (!db.objectStoreNames.contains(STORES.CACHED_DATA)) {
        const cacheStore = db.createObjectStore(STORES.CACHED_DATA, { keyPath: 'cacheKey' });
        cacheStore.createIndex('userId', 'userId', { unique: false });
        cacheStore.createIndex('dataType', 'dataType', { unique: false });
      }

      // 2. Offline Action Synchronization Queue
      if (!db.objectStoreNames.contains(STORES.SYNC_QUEUE)) {
        const queueStore = db.createObjectStore(STORES.SYNC_QUEUE, { keyPath: 'id' });
        queueStore.createIndex('userId', 'userId', { unique: false });
        queueStore.createIndex('status', 'status', { unique: false });
        queueStore.createIndex('idempotencyKey', 'idempotencyKey', { unique: false });
        queueStore.createIndex('createdAt', 'createdAt', { unique: false });
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      console.warn('[OfflineDb] Failed to open IndexedDB:', request.error);
      resolve(null);
    };
  });

  return dbPromise;
}

/**
 * Builds a standardized key for caching user-specific data.
 */
function makeCacheKey(userId, dataType, extraKey = '') {
  const cleanUser = String(userId || 'anonymous').trim();
  const cleanType = String(dataType || 'default').trim();
  const cleanExtra = String(extraKey || '').trim();
  return cleanExtra ? `${cleanUser}:${cleanType}:${cleanExtra}` : `${cleanUser}:${cleanType}`;
}

/**
 * Saves fresh server data into IndexedDB for offline viewing.
 */
export async function saveCachedData(userId, dataType, data, extraKey = '') {
  if (!userId || !data) return;
  const db = await openOfflineDb();
  if (!db) return;

  const cacheKey = makeCacheKey(userId, dataType, extraKey);
  const record = {
    cacheKey,
    userId: String(userId),
    dataType: String(dataType),
    data,
    cachedAt: new Date().toISOString(),
  };

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORES.CACHED_DATA, 'readwrite');
      const store = tx.objectStore(STORES.CACHED_DATA);
      store.put(record);
      tx.oncomplete = () => resolve(true);
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/**
 * Retrieves cached data for a user if offline.
 */
export async function getCachedData(userId, dataType, extraKey = '') {
  if (!userId) return null;
  const db = await openOfflineDb();
  if (!db) return null;

  const cacheKey = makeCacheKey(userId, dataType, extraKey);

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORES.CACHED_DATA, 'readonly');
      const store = tx.objectStore(STORES.CACHED_DATA);
      const req = store.get(cacheKey);
      req.onsuccess = () => resolve(req.result ? req.result.data : null);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Computes an idempotency key to coalesce duplicate operations while offline.
 */
function computeIdempotencyKey(userId, actionType, payload) {
  const u = String(userId || '');
  const t = String(actionType || '');
  if (t === 'TRACK_HABIT') {
    return `${u}:TRACK_HABIT:${payload.habit_id}:${payload.completion_date || payload.date}`;
  }
  if (t === 'UPDATE_GOAL') {
    return `${u}:UPDATE_GOAL:${payload.id || payload.goal_id}`;
  }
  if (t === 'TOGGLE_TASK') {
    return `${u}:TOGGLE_TASK:${payload.journey_id}:${payload.step_index}:${payload.task_index}`;
  }
  return `${u}:${t}:${JSON.stringify(payload)}`;
}

/**
 * Enqueues an offline user operation.
 * If an identical pending operation exists (e.g. user toggling the same habit),
 * it coalesces into the latest payload to avoid duplicate/conflicting records.
 */
export async function enqueueOfflineAction(userId, actionType, payload) {
  if (!userId || !actionType || !payload) return null;
  const db = await openOfflineDb();
  if (!db) return null;

  const idempotencyKey = computeIdempotencyKey(userId, actionType, payload);
  const now = new Date().toISOString();

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORES.SYNC_QUEUE, 'readwrite');
      const store = tx.objectStore(STORES.SYNC_QUEUE);
      const index = store.index('idempotencyKey');
      const req = index.getAll(idempotencyKey);

      req.onsuccess = () => {
        const matches = req.result || [];
        const existingPending = matches.find((m) => m.status === 'pending');

        if (existingPending) {
          // Coalesce into existing pending action
          existingPending.payload = { ...existingPending.payload, ...payload };
          existingPending.updatedAt = now;
          store.put(existingPending);
          tx.oncomplete = () => {
            dispatchQueueEvent();
            resolve(existingPending.id);
          };
        } else {
          // Insert new operation
          const newAction = {
            id: generateUUID(),
            userId: String(userId),
            actionType,
            payload,
            idempotencyKey,
            status: 'pending',
            retries: 0,
            lastError: null,
            createdAt: now,
            updatedAt: now,
          };
          store.put(newAction);
          tx.oncomplete = () => {
            dispatchQueueEvent();
            resolve(newAction.id);
          };
        }
      };

      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

/**
 * Retrieves all pending actions for a user, sorted oldest first.
 */
export async function getPendingActions(userId) {
  if (!userId) return [];
  const db = await openOfflineDb();
  if (!db) return [];

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORES.SYNC_QUEUE, 'readonly');
      const store = tx.objectStore(STORES.SYNC_QUEUE);
      const index = store.index('userId');
      const req = index.getAll(String(userId));

      req.onsuccess = () => {
        const items = (req.result || [])
          .filter((item) => item.status === 'pending' || item.status === 'failed')
          .sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
        resolve(items);
      };
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

/**
 * Updates status of a queue action ('syncing', 'completed', 'failed', 'pending').
 */
export async function updateActionStatus(id, status, error = null) {
  if (!id) return;
  const db = await openOfflineDb();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORES.SYNC_QUEUE, 'readwrite');
      const store = tx.objectStore(STORES.SYNC_QUEUE);
      const req = store.get(id);

      req.onsuccess = () => {
        const item = req.result;
        if (!item) return resolve(false);

        item.status = status;
        item.updatedAt = new Date().toISOString();
        if (error) {
          item.lastError = String(error);
          item.retries = (item.retries || 0) + 1;
        }
        store.put(item);
        tx.oncomplete = () => {
          dispatchQueueEvent();
          resolve(true);
        };
      };
      req.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/**
 * Permanently removes a confirmed synchronized action from the queue.
 */
export async function deleteAction(id) {
  if (!id) return;
  const db = await openOfflineDb();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORES.SYNC_QUEUE, 'readwrite');
      const store = tx.objectStore(STORES.SYNC_QUEUE);
      store.delete(id);
      tx.oncomplete = () => {
        dispatchQueueEvent();
        resolve(true);
      };
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

/**
 * Returns queue counts for active user.
 */
export async function getQueueStats(userId) {
  if (!userId) return { pending: 0, syncing: 0, failed: 0 };
  const db = await openOfflineDb();
  if (!db) return { pending: 0, syncing: 0, failed: 0 };

  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORES.SYNC_QUEUE, 'readonly');
      const store = tx.objectStore(STORES.SYNC_QUEUE);
      const index = store.index('userId');
      const req = index.getAll(String(userId));

      req.onsuccess = () => {
        const items = req.result || [];
        let pending = 0;
        let syncing = 0;
        let failed = 0;
        for (const item of items) {
          if (item.status === 'pending') pending++;
          else if (item.status === 'syncing') syncing++;
          else if (item.status === 'failed') failed++;
        }
        resolve({ pending, syncing, failed, total: pending + syncing + failed });
      };
      req.onerror = () => resolve({ pending: 0, syncing: 0, failed: 0, total: 0 });
    } catch {
      resolve({ pending: 0, syncing: 0, failed: 0, total: 0 });
    }
  });
}

/**
 * Purges ALL cached data and queue records for a specific user upon logout.
 * Ensures zero data bleeding across user accounts on shared devices.
 */
export async function clearUserCache(userId) {
  if (!userId) return;
  const db = await openOfflineDb();
  if (!db) return;

  return new Promise((resolve) => {
    try {
      const tx = db.transaction([STORES.CACHED_DATA, STORES.SYNC_QUEUE], 'readwrite');
      const cacheStore = tx.objectStore(STORES.CACHED_DATA);
      const queueStore = tx.objectStore(STORES.SYNC_QUEUE);

      const cacheIndex = cacheStore.index('userId');
      const cacheReq = cacheIndex.openCursor(IDBKeyRange.only(String(userId)));
      cacheReq.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          cacheStore.delete(cursor.primaryKey);
          cursor.continue();
        }
      };

      const queueIndex = queueStore.index('userId');
      const queueReq = queueIndex.openCursor(IDBKeyRange.only(String(userId)));
      queueReq.onsuccess = (e) => {
        const cursor = e.target.result;
        if (cursor) {
          queueStore.delete(cursor.primaryKey);
          cursor.continue();
        }
      };

      tx.oncomplete = () => {
        dispatchQueueEvent();
        resolve(true);
      };
      tx.onerror = () => resolve(false);
    } catch {
      resolve(false);
    }
  });
}

function dispatchQueueEvent() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('habiz-offline-queue-changed'));
  }
}

