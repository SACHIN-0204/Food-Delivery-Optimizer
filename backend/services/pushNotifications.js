import webpush from "web-push";
import PushSubscription from "../models/PushSubscription.js";

const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@example.com";

export const isPushConfigured = () => Boolean(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY);

if (isPushConfigured()) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

export const getVapidPublicKey = () => VAPID_PUBLIC_KEY || null;

/**
 * Sends a push notification to every device a user has subscribed on.
 * No-ops silently if push isn't configured or the user has no subscriptions —
 * this is a "nice to have" channel alongside Socket.IO, never a hard dependency.
 * Automatically removes subscriptions that have expired or been revoked
 * (Web Push returns 404/410 for those) so the subscriptions collection
 * doesn't accumulate dead entries over time.
 */
export const notifyUser = async (userId, { title, body, url }) => {
  if (!isPushConfigured()) return;

  const subscriptions = await PushSubscription.find({ user: userId });
  if (subscriptions.length === 0) return;

  const payload = JSON.stringify({ title, body, url: url || "/" });

  await Promise.all(
    subscriptions.map(async (sub) => {
      try {
        await webpush.sendNotification(
          { endpoint: sub.endpoint, keys: sub.keys },
          payload
        );
      } catch (error) {
        if (error.statusCode === 404 || error.statusCode === 410) {
          await PushSubscription.deleteOne({ _id: sub._id });
        } else {
          console.warn(`Push notification failed for subscription ${sub._id}: ${error.message}`);
        }
      }
    })
  );
};
