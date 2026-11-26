import { useState, useEffect, useCallback } from 'react';
import { getOnlineStatus, subscribeConnectivity, verifyServerReachability } from '../lib/networkStatus';

/**
 * React hook providing reactive real network connectivity status.
 */
export function useNetworkStatus() {
  const [status, setStatus] = useState(() => ({
    isOnline: getOnlineStatus(),
    isChecking: false,
  }));

  useEffect(() => {
    return subscribeConnectivity((updated) => {
      setStatus(updated);
    });
  }, []);

  const checkNow = useCallback(async () => {
    return await verifyServerReachability(6000);
  }, []);

  return {
    isOnline: status.isOnline,
    isChecking: status.isChecking,
    checkNow,
  };
}

/**
 * Refetches current page data when offline-sync / stats-updated events fire
 * or when connectivity transitions back online.
 */
export function useRefreshOnConnectivity(
  refreshFn,
  { enabled = true, ignoreSource = null, delayMs = 200 } = {}
) {
  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return undefined;
    let timer = null;
    const schedule = (e) => {
      if (ignoreSource && e?.detail?.source === ignoreSource) return;
      clearTimeout(timer);
      timer = setTimeout(() => {
        refreshFn();
      }, delayMs);
    };
    const handleConnectivity = (e) => {
      if (e?.detail?.isOnline) schedule(e);
    };
    window.addEventListener('habittracker-stats-updated', schedule);
    window.addEventListener('habiz-connectivity-status', handleConnectivity);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('habittracker-stats-updated', schedule);
      window.removeEventListener('habiz-connectivity-status', handleConnectivity);
    };
  }, [enabled, refreshFn, ignoreSource, delayMs]);
}
