import api from "../services/api.js";

let scriptLoadPromise = null;

/** Loads Razorpay's checkout script exactly once, no matter how many times this is called. */
function loadRazorpayScript() {
  if (window.Razorpay) return Promise.resolve();
  if (scriptLoadPromise) return scriptLoadPromise;

  scriptLoadPromise = new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://checkout.razorpay.com/v1/checkout.js";
    script.onload = resolve;
    script.onerror = () => reject(new Error("Failed to load Razorpay checkout script"));
    document.body.appendChild(script);
  });

  return scriptLoadPromise;
}

/**
 * Full payment round trip for one order: asks the backend to create a
 * Razorpay order, opens the checkout widget, and — if the customer completes
 * payment — verifies the signature with the backend before resolving.
 *
 * Resolves with { ok: true } on a verified payment, or { ok: false, reason }
 * for every other outcome (server-side payments not configured, checkout
 * cancelled, verification failed) — callers don't need a try/catch for the
 * "customer just closed the checkout modal" case, which isn't really an error.
 */
export async function payForOrder(orderId, customer) {
  let paymentOrder;
  try {
    const { data } = await api.post(`/payments/create-order/${orderId}`);
    paymentOrder = data;
  } catch (err) {
    return { ok: false, reason: err.response?.data?.message || "Could not start payment." };
  }

  try {
    await loadRazorpayScript();
  } catch (err) {
    return { ok: false, reason: err.message };
  }

  return new Promise((resolve) => {
    const razorpay = new window.Razorpay({
      key: paymentOrder.keyId,
      amount: paymentOrder.amount,
      currency: paymentOrder.currency,
      order_id: paymentOrder.razorpayOrderId,
      name: "Food Delivery Optimizer",
      description: `Order #${orderId.slice(-6)}`,
      prefill: { name: customer?.name, email: customer?.email },
      theme: { color: "#f97316" },
      handler: async (response) => {
        try {
          await api.post("/payments/verify", {
            orderId,
            razorpayOrderId: response.razorpay_order_id,
            razorpayPaymentId: response.razorpay_payment_id,
            razorpaySignature: response.razorpay_signature,
          });
          resolve({ ok: true });
        } catch (err) {
          resolve({ ok: false, reason: err.response?.data?.message || "Payment verification failed." });
        }
      },
      modal: {
        ondismiss: () => resolve({ ok: false, reason: "Payment was cancelled." }),
      },
    });

    razorpay.open();
  });
}
