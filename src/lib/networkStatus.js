/**
 * HabiZ Real Network Connectivity & Health Verifier
 *
 * Verifies actual backend reachability via lightweight /api/health pings
 * rather than relying solely on navigator.onLine (which often reports false
 * positives behind captive portals, dead routers, or offline proxies).
 */

let currentOnlineState = typeof navigator !== 'undefined' ? navigator.onLine : true;
let connectionDetail = typeof navigator !== 'undefined' && !navigator.onLine ? 'device_offline' : 'online';
let isCheckingHealth = false;
let checkTimer = null;
const listeners = new Set();

/**
 * Pings the lightweight /api/health?lite=1 endpoint with a strict timeout.
 * Separates device offline vs server unavailable.
 * @param {number} timeoutMs
 * @returns {Promise<boolean>}
 */
export async function verifyServerReachability(timeoutMs = 3500) {
  if (typeof navigator !== 'undefined' && !navigator.onLine) {
    connectionDetail = 'device_offline';
    setOnlineState(false);
    return false;
  }

  isCheckingHealth = true;
  notifyListeners();

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(`/api/health?lite=1&_t=${Date.now()}`, {
      method: 'GET',
      cache: 'no-store',
      headers: { 'Accept': 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timer);

    const reachable = res.ok && res.status === 200;
    connectionDetail = reachable ? 'online' : 'server_unavailable';
    setOnlineState(reachable);
    return reachable;
  } catch {
    clearTimeout(timer);
    connectionDetail = 'server_unavailable';
    setOnlineState(false);
    return false;
  } finally {
    isCheckingHealth = false;
    notifyListeners();
  }
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
        detail: { isOnline: newState, timestamp: Date.now() },
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
    setOnlineState(false);
  });

  window.addEventListener('online', () => {
    // When browser announces connection, verify actual server reachability
    verifyServerReachability(3000);
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      verifyServerReachability(3000);
    }
  });

  // Background heartbeat every 60s while online, 20s if offline
  const scheduleHeartbeat = () => {
    if (checkTimer) clearTimeout(checkTimer);
    const interval = currentOnlineState ? 60000 : 20000;
    checkTimer = setTimeout(async () => {
      await verifyServerReachability(3500);
      scheduleHeartbeat();
    }, interval);
  };

  scheduleHeartbeat();
}

