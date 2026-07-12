import express from "express";
import { registerUser, loginUser, getMe } from "../controllers/authController.js";
import { protect } from "../middleware/authMiddleware.js";
import { authLimiter } from "../middleware/rateLimiters.js";
import { validateRegister, validateLogin } from "../middleware/validators.js";

const router = express.Router();

router.post("/register", authLimiter, validateRegister, registerUser);
router.post("/login", authLimiter, validateLogin, loginUser);
router.get("/me", protect, getMe);

export default router;
