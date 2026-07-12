import PushSubscription from "../models/PushSubscription.js";
import { isPushConfigured, getVapidPublicKey } from "../services/pushNotifications.js";

// @route GET /api/notifications/vapid-public-key
// Public — the frontend needs this to call pushManager.subscribe()
export const getPublicKey = (req, res) => {
  if (!isPushConfigured()) {
    return res.status(503).json({ message: "Push notifications aren't configured on this server" });
  }
  return res.json({ publicKey: getVapidPublicKey() });
};

// @route POST /api/notifications/subscribe
// @access any authenticated user
export const subscribe = async (req, res) => {
  try {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ message: "A valid push subscription object is required" });
    }

    // Upsert: the same browser/device re-subscribing shouldn't create duplicates
    await PushSubscription.findOneAndUpdate(
      { endpoint },
      { user: req.user._id, endpoint, keys },
      { upsert: true, new: true }
    );

    return res.status(201).json({ message: "Subscribed to push notifications" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route DELETE /api/notifications/subscribe
// @access any authenticated user — called when they disable notifications
export const unsubscribe = async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) {
      return res.status(400).json({ message: "endpoint is required" });
    }
    await PushSubscription.deleteOne({ endpoint, user: req.user._id });
    return res.json({ message: "Unsubscribed" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
