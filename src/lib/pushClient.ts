// ── Web Push (client side) ───────────────────────────────────────────
// Registers the service worker, requests push permission, subscribes
// the browser, and stores the resulting PushSubscription in Supabase
// so the backend can target this device later via api/send-push.
export const VAPID_PUBLIC_KEY = import.meta.env.VITE_VAPID_PUBLIC_KEY || '';

import supabase from './supabase';

function urlBase64ToUint8Array(base64String: string): BufferSource {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) {
    outputArray[i] = rawData.charCodeAt(i);
  }
  return outputArray.buffer as ArrayBuffer;
}

/** Register the service worker. Safe to call multiple times; no-ops if
 *  the browser doesn't support service workers at all. */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
    return await navigator.serviceWorker.register('/sw.js');
  } catch (err) {
    console.warn('[push] service worker registration failed:', err);
    return null;
  }
}

/** Request push permission, subscribe this browser, and persist the
 *  subscription against `userId` in Supabase. Call once a user is
 *  signed in. Graceful no-op everywhere the browser doesn't support
 *  push, or the user denies permission — the app works fine without it,
 *  it just falls back to the existing tab-open notifications. */
export async function subscribeToPush(userId: string): Promise<void> {
  try {
    if (typeof window === 'undefined') return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (typeof Notification === 'undefined') return;

    if (Notification.permission === 'default') {
      const result = await Notification.requestPermission();
      if (result !== 'granted') return;
    }
    if (Notification.permission !== 'granted') return;

    const registration = await registerServiceWorker();
    if (!registration) return;

    let subscription = await registration.pushManager.getSubscription();
    if (!subscription) {
      subscription = await registration.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
    }

    const json = subscription.toJSON() as { endpoint?: string; keys?: { p256dh?: string; auth?: string } };
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return;

    // Upsert by endpoint — the same device re-subscribing shouldn't create
    // duplicate rows, and if the endpoint moved to a different user
    // (shared device, new login), the row now points at the right one.
    const { error } = await supabase.from('push_subscriptions').upsert(
      {
        user_id: userId,
        endpoint: json.endpoint,
        p256dh: json.keys.p256dh,
        auth: json.keys.auth,
      },
      { onConflict: 'endpoint' },
    );
    if (error) console.warn('[push] failed to save subscription:', error.message);
  } catch (err) {
    console.warn('[push] subscribeToPush failed (falling back to tab-open notifications):', err);
  }
}
