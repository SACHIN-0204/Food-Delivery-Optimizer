import Order from "../models/Order.js";
import {
  isRazorpayConfigured,
  createRazorpayOrder,
  verifyCheckoutSignature,
  verifyWebhookSignature,
  getPublicKeyId,
} from "../utils/razorpay.js";
import { notifyUser } from "../services/pushNotifications.js";

// @route POST /api/payments/create-order/:orderId
// @access customer — the one who placed this order
export const createPaymentOrder = async (req, res) => {
  try {
    if (!isRazorpayConfigured()) {
      return res.status(503).json({
        message: "Online payments aren't configured on this server. Use Cash on Delivery instead.",
      });
    }

    const order = await Order.findById(req.params.orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    if (order.customer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized for this order" });
    }
    if (order.paymentStatus === "paid") {
      return res.status(400).json({ message: "This order is already paid" });
    }

    const razorpayOrder = await createRazorpayOrder(order.total, order._id.toString());
    if (!razorpayOrder) {
      return res.status(502).json({ message: "Could not create payment order. Please try again." });
    }

    order.paymentMethod = "razorpay";
    order.razorpayOrderId = razorpayOrder.id;
    await order.save();

    return res.json({
      razorpayOrderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      keyId: getPublicKeyId(),
      orderId: order._id,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route POST /api/payments/verify
// @access customer — called by the frontend right after Razorpay's checkout succeeds
export const verifyPayment = async (req, res) => {
  try {
    const { orderId, razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

    const order = await Order.findById(orderId);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }
    if (order.customer.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized for this order" });
    }
    if (order.razorpayOrderId !== razorpayOrderId) {
      return res.status(400).json({ message: "Order/payment mismatch" });
    }

    const isValid = verifyCheckoutSignature({ razorpayOrderId, razorpayPaymentId, razorpaySignature });
    if (!isValid) {
      order.paymentStatus = "failed";
      await order.save();
      return res.status(400).json({ message: "Payment signature verification failed" });
    }

    order.paymentStatus = "paid";
    order.razorpayPaymentId = razorpayPaymentId;
    await order.save();

    req.app.get("io")?.to(`order_${order._id}`).emit("order_status_updated", {
      orderId: order._id,
      status: order.status,
      paymentStatus: "paid",
    });

    return res.json({ message: "Payment verified", order });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

/**
 * @route POST /api/payments/webhook
 * @access public (Razorpay calls this directly) — authenticated via the
 * webhook signature instead of a JWT, since Razorpay's servers can't log in.
 *
 * Belt-and-suspenders alongside verifyPayment: if the frontend's verify call
 * never happens (browser closed mid-checkout, network drop), this webhook
 * still reconciles the order once Razorpay's servers confirm the charge.
 *
 * IMPORTANT: this route is mounted in server.js with express.raw(), not
 * express.json() — signature verification needs the exact original bytes,
 * so req.body arrives here as a Buffer, not a parsed object.
 */
export const razorpayWebhook = async (req, res) => {
  const signature = req.headers["x-razorpay-signature"];
  const rawBody = req.body; // Buffer, thanks to express.raw() in server.js
  const isValid = verifyWebhookSignature(rawBody, signature);

  if (!isValid) {
    return res.status(400).json({ message: "Invalid webhook signature" });
  }

  let payload;
  try {
    payload = JSON.parse(rawBody.toString("utf8"));
  } catch {
    return res.status(400).json({ message: "Malformed webhook payload" });
  }

  const event = payload.event;
  const paymentEntity = payload.payload?.payment?.entity;

  if (event === "payment.captured" && paymentEntity) {
    const order = await Order.findOne({ razorpayOrderId: paymentEntity.order_id });
    if (order && order.paymentStatus !== "paid") {
      order.paymentStatus = "paid";
      order.razorpayPaymentId = paymentEntity.id;
      await order.save();
      notifyUser(order.customer, {
        title: "Payment received",
        body: `Your payment for order #${order._id.toString().slice(-6)} was confirmed.`,
      }).catch(() => {});
    }
  }

  if (event === "payment.failed" && paymentEntity) {
    const order = await Order.findOne({ razorpayOrderId: paymentEntity.order_id });
    if (order && order.paymentStatus !== "paid") {
      order.paymentStatus = "failed";
      await order.save();
    }
  }

  return res.json({ received: true });
};
