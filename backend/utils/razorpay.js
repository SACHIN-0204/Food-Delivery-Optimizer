import crypto from "crypto";
import Razorpay from "razorpay";

const RAZORPAY_KEY_ID = process.env.RAZORPAY_KEY_ID;
const RAZORPAY_KEY_SECRET = process.env.RAZORPAY_KEY_SECRET;
const RAZORPAY_WEBHOOK_SECRET = process.env.RAZORPAY_WEBHOOK_SECRET;

export const isRazorpayConfigured = () => Boolean(RAZORPAY_KEY_ID && RAZORPAY_KEY_SECRET);

let client = null;
const getClient = () => {
  if (!isRazorpayConfigured()) return null;
  if (!client) {
    client = new Razorpay({ key_id: RAZORPAY_KEY_ID, key_secret: RAZORPAY_KEY_SECRET });
  }
  return client;
};

/**
 * Creates a Razorpay order for the given amount (in rupees — converted to
 * paise here since that's what Razorpay's API expects). Returns null if
 * Razorpay isn't configured or the API call fails, so the caller can respond
 * with a clear "payments aren't set up" message instead of a stack trace.
 */
export const createRazorpayOrder = async (amountRupees, receiptId) => {
  const razorpay = getClient();
  if (!razorpay) return null;

  try {
    const order = await razorpay.orders.create({
      amount: Math.round(amountRupees * 100), // paise
      currency: "INR",
      receipt: receiptId,
    });
    return order;
  } catch (error) {
    console.error(`Razorpay order creation failed: ${error.message}`);
    return null;
  }
};

/**
 * Verifies the signature Razorpay's checkout script returns after a
 * successful payment. This is the step that actually proves the payment is
 * legitimate — never trust "payment succeeded" from the client without this.
 */
export const verifyCheckoutSignature = ({ razorpayOrderId, razorpayPaymentId, razorpaySignature }) => {
  if (!isRazorpayConfigured()) return false;

  const expectedSignature = crypto
    .createHmac("sha256", RAZORPAY_KEY_SECRET)
    .update(`${razorpayOrderId}|${razorpayPaymentId}`)
    .digest("hex");

  return expectedSignature === razorpaySignature;
};

/**
 * Verifies a webhook payload's signature (different secret from the
 * checkout flow — configured separately in the Razorpay dashboard).
 */
export const verifyWebhookSignature = (rawBody, signature) => {
  if (!RAZORPAY_WEBHOOK_SECRET) return false;

  const expectedSignature = crypto
    .createHmac("sha256", RAZORPAY_WEBHOOK_SECRET)
    .update(rawBody)
    .digest("hex");

  return expectedSignature === signature;
};

export const getPublicKeyId = () => RAZORPAY_KEY_ID || null;
