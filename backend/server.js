import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import helmet from "helmet";
import http from "http";
import { Server } from "socket.io";

import connectDB from "./config/db.js";
import { registerSocketHandlers } from "./sockets/index.js";
import { generalLimiter } from "./middleware/rateLimiters.js";
import { notFound, errorHandler } from "./middleware/errorHandler.js";
import { razorpayWebhook } from "./controllers/paymentController.js";

import authRoutes from "./routes/authRoutes.js";
import restaurantRoutes from "./routes/restaurantRoutes.js";
import orderRoutes from "./routes/orderRoutes.js";
import deliveryRoutes from "./routes/deliveryRoutes.js";
import adminRoutes from "./routes/adminRoutes.js";
import paymentRoutes from "./routes/paymentRoutes.js";
import notificationRoutes from "./routes/notificationRoutes.js";

dotenv.config();
connectDB();

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: process.env.CLIENT_URL || "*", methods: ["GET", "POST"] },
});

// Security headers. CORP/COEP relaxed since this API is consumed cross-origin
// by the frontend on a different port/domain, and images (maps, avatars) may
// be loaded from third-party CDNs by the client.
app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" },
  })
);
app.use(cors({ origin: process.env.CLIENT_URL || "*" }));

// IMPORTANT: the Razorpay webhook needs the raw, unparsed request body to
// verify its signature — so it's mounted here with express.raw(), BEFORE the
// global express.json() below. Once express.json() runs, the raw bytes are
// gone and this route would never see them. Order of middleware matters.
app.post("/api/payments/webhook", express.raw({ type: "application/json" }), razorpayWebhook);

app.use(express.json({ limit: "1mb" })); // caps request body size — a cheap defense against oversized payloads
app.use(generalLimiter);

// Make io accessible in route handlers via req.app.get("io")
app.set("io", io);

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api/auth", authRoutes);
app.use("/api/restaurants", restaurantRoutes);
app.use("/api/orders", orderRoutes);
app.use("/api/delivery", deliveryRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/payments", paymentRoutes);
app.use("/api/notifications", notificationRoutes);

// Must come after all routes: catches unmatched paths, then any error thrown
// or passed to next() by a route handler.
app.use(notFound);
app.use(errorHandler);

registerSocketHandlers(io);

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
