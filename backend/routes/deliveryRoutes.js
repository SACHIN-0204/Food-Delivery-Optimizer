import express from "express";
import {
  createPartnerProfile,
  getMyPartnerProfile,
  updateLocation,
  updateStatus,
  getNearbyPartners,
  triggerAssignment,
  triggerBatchAssignment,
} from "../controllers/deliveryController.js";
import { protect, authorizeRoles } from "../middleware/authMiddleware.js";
import { optimizerLimiter } from "../middleware/rateLimiters.js";
import {
  validateCreatePartnerProfile,
  validateUpdateLocation,
  validateUpdateStatus,
  validateMongoIdParam,
  validateGeoQuery,
} from "../middleware/validators.js";

const router = express.Router();

// Delivery partner self-service
router.post(
  "/partners",
  protect,
  authorizeRoles("delivery_partner", "admin"),
  validateCreatePartnerProfile,
  createPartnerProfile
);
router.get("/me", protect, authorizeRoles("delivery_partner", "admin"), getMyPartnerProfile);
router.put(
  "/location",
  protect,
  authorizeRoles("delivery_partner", "admin"),
  validateUpdateLocation,
  updateLocation
);
router.put("/status", protect, authorizeRoles("delivery_partner", "admin"), validateUpdateStatus, updateStatus);

// Restaurant/admin — optimizer triggers + debugging. Rate-limited separately
// since these trigger geo queries and (optionally) external Google Maps calls.
router.get("/nearby", protect, authorizeRoles("restaurant", "admin"), validateGeoQuery, getNearbyPartners);
router.post(
  "/assign/:orderId",
  protect,
  authorizeRoles("restaurant", "admin"),
  optimizerLimiter,
  validateMongoIdParam("orderId"),
  triggerAssignment
);
router.post(
  "/assign-all/:restaurantId",
  protect,
  authorizeRoles("restaurant", "admin"),
  optimizerLimiter,
  validateMongoIdParam("restaurantId"),
  triggerBatchAssignment
);

export default router;
