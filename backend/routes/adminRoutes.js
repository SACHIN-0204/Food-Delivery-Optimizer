import express from "express";
import { getAllOrders, getAllPartners, getAllRestaurants, getStats } from "../controllers/adminController.js";
import { protect, authorizeRoles } from "../middleware/authMiddleware.js";

const router = express.Router();

router.use(protect, authorizeRoles("admin"));

router.get("/stats", getStats);
router.get("/orders", getAllOrders);
router.get("/partners", getAllPartners);
router.get("/restaurants", getAllRestaurants);

export default router;
