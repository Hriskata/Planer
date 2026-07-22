import { get, writable } from 'svelte/store';
import { getVapidPublicKey, subscribePush, unsubscribePush } from './api.js';

// Whether push notifications are currently active on THIS device (a fresh, unrelated
// concept from the auth/theme stores — permission + subscription live in the browser,
// not in our own state, so this mirrors reality rather than owning it).
export const notificationsEnabled = writable(false);

function urlBase64ToUint8Array(base64String) {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

function supported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

// Called once on app start — a previously-granted subscription might have been revoked
// behind our back (browser settings, site data cleared), so this checks reality instead
// of assuming yesterday's state still holds.
export async function syncNotificationState() {
  if (!supported()) return;
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  notificationsEnabled.set(Boolean(existing) && Notification.permission === 'granted');
}

export async function enableNotifications() {
  if (!supported()) {
    throw new Error('Известията не се поддържат от този браузър.');
  }
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') {
    throw new Error('Разрешението за известия беше отказано.');
  }
  const publicKey = await getVapidPublicKey();
  if (!publicKey) {
    throw new Error('Сървърът все още не е конфигуриран за известия.');
  }
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });
  await subscribePush(subscription.toJSON());
  notificationsEnabled.set(true);
}

export async function disableNotifications() {
  if (!supported()) return;
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    await unsubscribePush(subscription.endpoint).catch(() => {}); // best-effort — unsubscribe locally regardless
    await subscription.unsubscribe();
  }
  notificationsEnabled.set(false);
}

export async function toggleNotifications() {
  if (get(notificationsEnabled)) {
    await disableNotifications();
  } else {
    await enableNotifications();
  }
}
