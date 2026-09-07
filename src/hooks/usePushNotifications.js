import { useState, useEffect, useCallback } from 'react';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
}

export function usePushNotifications(session) {
  const [permission, setPermission] = useState(
    'Notification' in window ? Notification.permission : 'denied'
  );
  const [swRegistration, setSwRegistration] = useState(null);
  const [subscribed, setSubscribed] = useState(false);
  const [swReady, setSwReady] = useState(false);

  // Register service worker on mount
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js')
      .then(reg => {
        setSwRegistration(reg);
        setSwReady(true);

        // Check if already subscribed
        reg.pushManager.getSubscription().then(sub => {
          setSubscribed(!!sub);
        });
      })
      .catch(err => console.warn('[SW] Registration failed:', err));
  }, []);

  const requestPermissionAndSubscribe = useCallback(async () => {
    if (!swRegistration || !session) return false;

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== 'granted') return false;

      // Subscribe to push
      const sub = await swRegistration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });

      // Save subscription to backend
      const res = await fetch('/api/push-subscribe', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ subscription: sub.toJSON() }),
      });

      if (res.ok) {
        setSubscribed(true);
        return true;
      }
      return false;
    } catch (err) {
      console.error('[Push] Subscribe error:', err);
      return false;
    }
  }, [swRegistration, session]);

  const unsubscribe = useCallback(async () => {
    if (!swRegistration || !session) return;
    const sub = await swRegistration.pushManager.getSubscription();
    if (!sub) return;

    await sub.unsubscribe();
    await fetch('/api/push-subscribe', {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ endpoint: sub.endpoint }),
    });
    setSubscribed(false);
  }, [swRegistration, session]);

  // Schedule local (client-side) notifications via SW message
  const scheduleLocalReminders = useCallback((reminders) => {
    if (!swRegistration?.active) return;
    swRegistration.active.postMessage({
      type: 'SCHEDULE_LOCAL_REMINDERS',
      reminders,
    });
  }, [swRegistration]);

  return {
    permission,
    subscribed,
    swReady,
    requestPermissionAndSubscribe,
    unsubscribe,
    scheduleLocalReminders,
  };
}
