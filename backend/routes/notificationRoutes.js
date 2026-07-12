import express from "express";
import { getPublicKey, subscribe, unsubscribe } from "../controllers/notificationController.js";
import { protect } from "../middleware/authMiddleware.js";

const router = express.Router();

router.get("/vapid-public-key", getPublicKey);
router.post("/subscribe", protect, subscribe);
router.delete("/subscribe", protect, unsubscribe);

export default router;
