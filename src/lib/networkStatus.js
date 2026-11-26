/**
 * HabiZ Real Network Connectivity & Health Verifier
 *
 * Verifies actual backend reachability via lightweight /api/health pings
 * rather than relying solely on navigator.onLine (which often reports false
 * positives behind captive portals, dead routers, or offline proxies).
 */

export const DEFAULT_HEALTH_TIMEOUT_MS = 6000;
export const DEFAULT_RETRY_DELAY_MS = 1000;

let currentOnlineState = typeof navigator !== 'undefined' ? navigator.onLine : true;
let connectionDetail = typeof navigator !== 'undefined' && !navigator.onLine ? 'device_offline' : 'online';
let isCheckingHealth = false;
let checkTimer = null;
let inFlightCheck = null;
const listeners = new Set();

function sleep(ms) {
  if (!ms || ms <= 0) return Promise.resolve();
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pingHealthOnce(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  if (typeof timer?.unref === 'function') timer.unref();

  try {
    const res = await fetch(`/api/health?lite=1&_t=${Date.now()}`, {
      method: 'GET',
      cache: 'no-store',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    return { responded: true, status: res.status };
  } catch (err) {
    clearTimeout(timer);
    return { responded: false, error: err };
  }
}

/**
 * Pings the lightweight /api/health?lite=1 endpoint with a strict timeout.
 * Retries once on network failure before declaring offline, and treats any HTTP
 * response (including 5xx) as proof the network itself works.
 * @param {number|{timeoutMs?: number, retryDelayMs?: number}} [timeoutOrOptions]
 * @returns {Promise<boolean>}
 */
export async function verifyServerReachability(timeoutOrOptions = DEFAULT_HEALTH_TIMEOUT_MS) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    connectionDetail = 'device_offline';
    setOnlineState(false);
    return false;
  }

  if (inFlightCheck) {
    return inFlightCheck;
  }

  const timeoutMs =
    typeof timeoutOrOptions === 'number'
      ? timeoutOrOptions
      : (timeoutOrOptions?.timeoutMs ?? DEFAULT_HEALTH_TIMEOUT_MS);
  const retryDelayMs =
    typeof timeoutOrOptions === 'object' && timeoutOrOptions !== null
      ? (timeoutOrOptions.retryDelayMs ?? DEFAULT_RETRY_DELAY_MS)
      : DEFAULT_RETRY_DELAY_MS;

  inFlightCheck = (async () => {
    isCheckingHealth = true;
    notifyListeners();

    try {
      let result = await pingHealthOnce(timeoutMs);

      if (!result.responded) {
        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          connectionDetail = 'device_offline';
          setOnlineState(false);
          return false;
        }

        await sleep(retryDelayMs);

        if (typeof navigator !== 'undefined' && !navigator.onLine) {
          connectionDetail = 'device_offline';
          setOnlineState(false);
          return false;
        }

        result = await pingHealthOnce(timeoutMs);
      }

      if (result.responded) {
        // Any HTTP response proves connectivity; 5xx sets detail without blocking sync
        connectionDetail = result.status >= 500 ? 'server_unavailable' : 'online';
        setOnlineState(true);
        return true;
      }

      connectionDetail =
        typeof navigator !== 'undefined' && !navigator.onLine
          ? 'device_offline'
          : 'server_unavailable';
      setOnlineState(false);
      return false;
    } finally {
      isCheckingHealth = false;
      inFlightCheck = null;
      notifyListeners();
    }
  })();

  return inFlightCheck;
}

/**
 * Returns specific connection diagnostic state:
 * 'online' | 'device_offline' | 'server_unavailable'
 */
export function getConnectionDetail() {
  return connectionDetail;
}

function setOnlineState(newState) {
  const changed = currentOnlineState !== newState;
  currentOnlineState = newState;

  if (changed && typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent('habiz-connectivity-status', {
        detail: { isOnline: newState, timestamp: Date.now(), detail: connectionDetail },
      })
    );
  }
  notifyListeners();
}

function notifyListeners() {
  for (const listener of listeners) {
    try {
      listener({ isOnline: currentOnlineState, isChecking: isCheckingHealth });
    } catch (e) {
      console.warn('[NetworkStatus] Listener error:', e);
    }
  }
}

/**
 * Returns current verified online status.
 */
export function getOnlineStatus() {
  return currentOnlineState;
}

/**
 * Subscribes a listener to connectivity updates.
 * @param {Function} callback
 * @returns {Function} Unsubscribe function
 */
export function subscribeConnectivity(callback) {
  listeners.add(callback);
  callback({ isOnline: currentOnlineState, isChecking: isCheckingHealth });
  return () => listeners.delete(callback);
}

// ── Event Setup ──────────────────────────────────────────────────────────────
if (typeof window !== 'undefined') {
  window.addEventListener('offline', () => {
    connectionDetail = 'device_offline';
    setOnlineState(false);
  });

  window.addEventListener('online', () => {
    // When browser announces connection, verify actual server reachability
    verifyServerReachability(DEFAULT_HEALTH_TIMEOUT_MS);
  });

  if (typeof document !== 'undefined' && typeof document.addEventListener === 'function') {
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') {
        verifyServerReachability(DEFAULT_HEALTH_TIMEOUT_MS);
      }
    });
  }

  // Verify reachability right at app startup after initial module graph setup
  queueMicrotask(() => {
    verifyServerReachability(DEFAULT_HEALTH_TIMEOUT_MS);
  });

  // Background heartbeat every 60s while online, 20s if offline
  const scheduleHeartbeat = () => {
    if (checkTimer) clearTimeout(checkTimer);
    const interval = currentOnlineState ? 60000 : 20000;
    checkTimer = setTimeout(async () => {
      await verifyServerReachability(DEFAULT_HEALTH_TIMEOUT_MS);
      scheduleHeartbeat();
    }, interval);
    if (typeof checkTimer?.unref === 'function') checkTimer.unref();
  };

  scheduleHeartbeat();
}
