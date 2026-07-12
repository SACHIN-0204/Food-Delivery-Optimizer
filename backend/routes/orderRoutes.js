import express from "express";
import {
  placeOrder,
  getMyOrders,
  getRestaurantOrders,
  getOrderById,
  updateOrderStatus,
} from "../controllers/orderController.js";
import { protect, authorizeRoles } from "../middleware/authMiddleware.js";
import { validatePlaceOrder, validateOrderStatusUpdate, validateMongoIdParam } from "../middleware/validators.js";

const router = express.Router();

router.post("/", protect, authorizeRoles("customer", "admin"), validatePlaceOrder, placeOrder);
router.get("/my", protect, authorizeRoles("customer", "admin"), getMyOrders);
router.get(
  "/restaurant/:restaurantId",
  protect,
  authorizeRoles("restaurant", "admin"),
  validateMongoIdParam("restaurantId"),
  getRestaurantOrders
);
router.get("/:id", protect, validateMongoIdParam("id"), getOrderById);
router.put("/:id/status", protect, validateOrderStatusUpdate, updateOrderStatus);

export default router;
