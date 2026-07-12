import { body, param, query, validationResult } from "express-validator";

/**
 * Drop this after any validator chain. Collects express-validator's errors
 * and responds with a consistent 400 shape instead of letting bad input
 * reach a controller (and, from there, potentially the database).
 */
export const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      message: "Validation failed",
      errors: errors.array().map((e) => ({ field: e.path, message: e.msg })),
    });
  }
  next();
};

// Reusable pieces
const coordinatesValidator = (fieldPath) =>
  body(fieldPath)
    .isArray({ min: 2, max: 2 })
    .withMessage(`${fieldPath} must be [lng, lat]`)
    .custom(([lng, lat]) => lng >= -180 && lng <= 180 && lat >= -90 && lat <= 90)
    .withMessage(`${fieldPath} must contain valid coordinates`);

export const validateRegister = [
  body("name").trim().notEmpty().withMessage("Name is required").isLength({ max: 100 }),
  body("email").trim().isEmail().withMessage("Valid email is required").normalizeEmail(),
  body("password").isLength({ min: 6 }).withMessage("Password must be at least 6 characters"),
  body("phone").trim().notEmpty().withMessage("Phone is required").isLength({ min: 6, max: 20 }),
  body("role").optional().isIn(["customer", "restaurant", "delivery_partner", "admin"]),
  handleValidationErrors,
];

export const validateLogin = [
  body("email").trim().isEmail().withMessage("Valid email is required").normalizeEmail(),
  body("password").notEmpty().withMessage("Password is required"),
  handleValidationErrors,
];

export const validateCreateRestaurant = [
  body("name").trim().notEmpty().withMessage("Name is required").isLength({ max: 150 }),
  body("address").trim().notEmpty().withMessage("Address is required"),
  coordinatesValidator("location.coordinates"),
  body("description").optional().isString().isLength({ max: 1000 }),
  body("cuisine").optional().isArray(),
  body("avgPrepTimeMinutes").optional().isInt({ min: 1, max: 180 }),
  handleValidationErrors,
];

export const validateAddMenuItem = [
  body("name").trim().notEmpty().withMessage("Name is required").isLength({ max: 150 }),
  body("price").isFloat({ min: 0 }).withMessage("Price must be a non-negative number"),
  body("category").optional().isString().isLength({ max: 100 }),
  body("prepTimeMinutes").optional().isInt({ min: 1, max: 180 }),
  handleValidationErrors,
];

export const validatePlaceOrder = [
  body("restaurantId").isMongoId().withMessage("Valid restaurantId is required"),
  body("items").isArray({ min: 1 }).withMessage("At least one item is required"),
  body("items.*.menuItemId").isMongoId().withMessage("Each item needs a valid menuItemId"),
  body("items.*.quantity").optional().isInt({ min: 1, max: 50 }),
  body("deliveryAddress.fullAddress").trim().notEmpty().withMessage("Delivery address is required"),
  coordinatesValidator("deliveryAddress.location.coordinates"),
  handleValidationErrors,
];

export const validateOrderStatusUpdate = [
  param("id").isMongoId().withMessage("Invalid order id"),
  body("status")
    .isIn([
      "placed",
      "confirmed",
      "preparing",
      "ready_for_pickup",
      "assigned",
      "picked_up",
      "on_the_way",
      "delivered",
      "cancelled",
    ])
    .withMessage("Invalid status value"),
  handleValidationErrors,
];

export const validateCreatePartnerProfile = [
  body("vehicleType").optional().isIn(["bike", "scooter", "car", "bicycle"]),
  body("maxActiveOrders").optional().isInt({ min: 1, max: 10 }),
  body("avgSpeedKmph").optional().isFloat({ min: 1, max: 150 }),
  body("coordinates").optional().custom((val) => Array.isArray(val) && val.length === 2),
  handleValidationErrors,
];

export const validateUpdateLocation = [
  coordinatesValidator("coordinates"),
  handleValidationErrors,
];

export const validateUpdateStatus = [
  body("status").isIn(["offline", "available"]).withMessage('status must be "offline" or "available"'),
  handleValidationErrors,
];

export const validateMongoIdParam = (name) => [
  param(name).isMongoId().withMessage(`Invalid ${name}`),
  handleValidationErrors,
];

export const validateGeoQuery = [
  query("lat").optional().isFloat({ min: -90, max: 90 }),
  query("lng").optional().isFloat({ min: -180, max: 180 }),
  query("maxDistanceKm").optional().isFloat({ min: 0.1, max: 100 }),
  handleValidationErrors,
];
