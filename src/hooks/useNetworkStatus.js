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
    return await verifyServerReachability(3000);
  }, []);

  return {
    isOnline: status.isOnline,
    isChecking: status.isChecking,
    checkNow,
  };
}

