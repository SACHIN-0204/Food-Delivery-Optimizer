import jwt from "jsonwebtoken";
import User from "../models/User.js";
import Restaurant from "../models/Restaurant.js";
import DeliveryPartner from "../models/DeliveryPartner.js";

/**
 * Verifies the JWT sent by the client on connection (via socket.handshake.auth.token)
 * and attaches the resolved user to the socket. Falls back to an anonymous/guest
 * socket if no valid token is provided, since some flows (e.g. a guest tracking
 * page via a shared link) may not require auth.
 */
const authenticateSocket = async (socket) => {
  const token = socket.handshake.auth?.token;
  if (!token) return null;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const user = await User.findById(decoded.id).select("-password");
    return user;
  } catch {
    return null;
  }
};

export const registerSocketHandlers = (io) => {
  io.on("connection", async (socket) => {
    const user = await authenticateSocket(socket);
    socket.user = user;
    console.log(`Socket connected: ${socket.id}${user ? ` (user ${user._id}, role ${user.role})` : " (guest)"}`);

    // Auto-join rooms relevant to this user's role, so dashboards update without
    // the client having to know internal IDs up front.
    if (user?.role === "restaurant") {
      const restaurants = await Restaurant.find({ owner: user._id }).select("_id");
      restaurants.forEach((r) => socket.join(`restaurant_${r._id}`));
    }
    if (user?.role === "delivery_partner") {
      const partner = await DeliveryPartner.findOne({ user: user._id }).select("_id");
      if (partner) socket.join(`partner_${partner._id}`);
    }

    // A customer (or guest with a shared link) joins a specific order's room to
    // receive status changes and live partner location for that order only.
    socket.on("join_order_room", (orderId) => {
      socket.join(`order_${orderId}`);
    });

    socket.on("leave_order_room", (orderId) => {
      socket.leave(`order_${orderId}`);
    });

    /**
     * Delivery partner's app sends frequent location pings over the socket
     * (lower overhead than a REST call on every GPS tick). We update the DB
     * and fan the new position out to every order room this partner is
     * currently servicing, so all their customers see the live marker move.
     */
    socket.on("partner_location_update", async ({ coordinates }) => {
      if (!user || user.role !== "delivery_partner") return;
      if (!Array.isArray(coordinates) || coordinates.length !== 2) return;

      const partner = await DeliveryPartner.findOneAndUpdate(
        { user: user._id },
        { currentLocation: { type: "Point", coordinates } },
        { new: true }
      );
      if (!partner) return;

      partner.activeOrders.forEach((orderId) => {
        io.to(`order_${orderId}`).emit("partner_location_updated", {
          orderId,
          coordinates,
          timestamp: new Date().toISOString(),
        });
      });
    });

    socket.on("disconnect", () => {
      console.log(`Socket disconnected: ${socket.id}`);
    });
  });
};
