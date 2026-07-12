import express from "express";
import { body } from "express-validator";
import {
  createRestaurant,
  getRestaurants,
  getRestaurantById,
  getMyRestaurants,
  updateRestaurant,
  deleteRestaurant,
  addMenuItem,
  updateMenuItem,
  deleteMenuItem,
} from "../controllers/restaurantController.js";
import { protect, authorizeRoles } from "../middleware/authMiddleware.js";
import {
  validateCreateRestaurant,
  validateAddMenuItem,
  validateMongoIdParam,
  validateGeoQuery,
  handleValidationErrors,
} from "../middleware/validators.js";

const router = express.Router();

// Menu item fields are all optional on update — only whatever's provided gets validated
const validateUpdateMenuItem = [
  body("name").optional().trim().notEmpty().isLength({ max: 150 }),
  body("price").optional().isFloat({ min: 0 }),
  body("category").optional().isString().isLength({ max: 100 }),
  body("isAvailable").optional().isBoolean(),
  body("prepTimeMinutes").optional().isInt({ min: 1, max: 180 }),
  handleValidationErrors,
];

// Public
router.get("/", validateGeoQuery, getRestaurants);
router.get("/mine/list", protect, authorizeRoles("restaurant", "admin"), getMyRestaurants);
router.get("/:id", validateMongoIdParam("id"), getRestaurantById);

// Restaurant owner only
router.post("/", protect, authorizeRoles("restaurant", "admin"), validateCreateRestaurant, createRestaurant);
router.put(
  "/:id",
  protect,
  authorizeRoles("restaurant", "admin"),
  validateMongoIdParam("id"),
  updateRestaurant
);
router.delete(
  "/:id",
  protect,
  authorizeRoles("restaurant", "admin"),
  validateMongoIdParam("id"),
  deleteRestaurant
);

// Menu management
router.post(
  "/:id/menu",
  protect,
  authorizeRoles("restaurant", "admin"),
  validateMongoIdParam("id"),
  validateAddMenuItem,
  addMenuItem
);
router.put(
  "/:id/menu/:itemId",
  protect,
  authorizeRoles("restaurant", "admin"),
  validateUpdateMenuItem,
  updateMenuItem
);
router.delete("/:id/menu/:itemId", protect, authorizeRoles("restaurant", "admin"), deleteMenuItem);

export default router;
