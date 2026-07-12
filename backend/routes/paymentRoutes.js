import express from "express";
import { createPaymentOrder, verifyPayment } from "../controllers/paymentController.js";
import { protect, authorizeRoles } from "../middleware/authMiddleware.js";
import { validateMongoIdParam } from "../middleware/validators.js";

const router = express.Router();

router.post(
  "/create-order/:orderId",
  protect,
  authorizeRoles("customer", "admin"),
  validateMongoIdParam("orderId"),
  createPaymentOrder
);

router.post("/verify", protect, authorizeRoles("customer", "admin"), verifyPayment);

// Note: the Razorpay webhook route is NOT defined here. It needs raw (unparsed)
// request bytes to verify Razorpay's signature, which means it has to be
// mounted in server.js BEFORE the global express.json() middleware runs —
// by the time a request reaches this router, the body is already parsed and
// the raw bytes are gone. See server.js for the actual webhook route.

export default router;
