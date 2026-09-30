import { useState, useEffect, useCallback } from 'react';

const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY;

function urlBase64ToUint8Array(base64String) {
  if (!base64String || typeof base64String !== 'string') return null;
  try {
    const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
    const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const rawData = atob(base64);
    const outputArray = new Uint8Array(rawData.length);
    for (let i = 0; i < rawData.length; ++i) outputArray[i] = rawData.charCodeAt(i);
    return outputArray;
  } catch {
    return null;
  }
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
        if (reg.pushManager) {
          reg.pushManager.getSubscription().then(sub => {
            setSubscribed(!!sub);
          }).catch(() => {});
        }
      })
      .catch(err => console.warn('[SW] Registration failed:', err));
  }, []);

  const requestPermissionAndSubscribe = useCallback(async () => {
    if (!('Notification' in window)) return false;

    try {
      const result = await Notification.requestPermission();
      setPermission(result);
      if (result !== 'granted') return false;

      const reg = swRegistration || (await navigator.serviceWorker?.ready);
      if (!reg || !session) return result === 'granted';

      // If VAPID key is configured, subscribe to PushManager
      const appServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);
      if (appServerKey && reg.pushManager) {
        try {
          const sub = await reg.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: appServerKey,
          });

          const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
          await fetch('/api/push-subscribe', {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${session.access_token}`,
              'x-timezone': tz,
            },
            body: JSON.stringify({ subscription: sub.toJSON(), timezone: tz }),
          });

          setSubscribed(true);
        } catch (subErr) {
          console.warn('[Push] PushManager subscribe failed, falling back to local notifications:', subErr);
        }
      }

      return true;
    } catch (err) {
      console.error('[Push] Subscribe error:', err);
      return false;
    }
  }, [swRegistration, session]);

  const unsubscribe = useCallback(async () => {
    if (!swRegistration || !session) return;
    try {
      const sub = await swRegistration.pushManager?.getSubscription();
      if (sub) {
        await sub.unsubscribe();
        await fetch('/api/push-subscribe', {
          method: 'DELETE',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ endpoint: sub.endpoint }),
        }).catch(() => {});
      }
    } catch {}
    setSubscribed(false);
  }, [swRegistration, session]);

  // Schedule local reminders via SW message fallback
  const scheduleLocalReminders = useCallback((reminders) => {
    if (!('serviceWorker' in navigator)) return;
    navigator.serviceWorker.ready.then((reg) => {
      const target = reg.active || navigator.serviceWorker.controller;
      if (target) {
        target.postMessage({
          type: 'SCHEDULE_LOCAL_REMINDERS',
          reminders,
        });
      }
    }).catch(() => {});
  }, []);

  return {
    permission,
    subscribed,
    swReady,
    requestPermissionAndSubscribe,
    unsubscribe,
    scheduleLocalReminders,
  };
}
