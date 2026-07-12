import api from "../services/api.js";

// Converts the VAPID public key (base64url, as the backend sends it) into the
// Uint8Array format PushManager.subscribe() expects.
function urlBase64ToUint8Array(base64String) {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

export const isPushSupported = () =>
  "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;

/**
 * Registers the service worker, asks the browser for notification permission,
 * subscribes to push, and sends the subscription to the backend.
 * Returns { ok: false, reason } for any expected "can't do this" case —
 * unsupported browser, permission denied, push not configured server-side —
 * so callers can just show a message instead of handling exceptions.
 */
export const enablePushNotifications = async () => {
  if (!isPushSupported()) return { ok: false, reason: "Push notifications aren't supported in this browser." };

  const permission = await Notification.requestPermission();
  if (permission !== "granted") {
    return { ok: false, reason: "Notification permission was not granted." };
  }

  let publicKey;
  try {
    const { data } = await api.get("/notifications/vapid-public-key");
    publicKey = data.publicKey;
  } catch {
    return { ok: false, reason: "Push notifications aren't configured on this server." };
  }

  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  const subscription = await registration.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(publicKey),
  });

  const subscriptionJson = subscription.toJSON();
  await api.post("/notifications/subscribe", {
    endpoint: subscriptionJson.endpoint,
    keys: subscriptionJson.keys,
  });

  return { ok: true };
};

export const disablePushNotifications = async () => {
  if (!isPushSupported()) return;

  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  if (!subscription) return;

  const endpoint = subscription.endpoint;
  await subscription.unsubscribe();
  await api.delete("/notifications/subscribe", { data: { endpoint } });
};

/** Checks whether this browser already has an active push subscription. */
export const isPushEnabled = async () => {
  if (!isPushSupported()) return false;
  const registration = await navigator.serviceWorker.getRegistration();
  const subscription = await registration?.pushManager.getSubscription();
  return Boolean(subscription);
};
