import DeliveryPartner from "../models/DeliveryPartner.js";
import { assignOrderToPartner } from "../services/optimizationEngine.js";
import { solveBatchForRestaurant } from "../services/vrpBatchSolver.js";

// @route POST /api/delivery/partners
// @access delivery_partner role — create their partner profile once
export const createPartnerProfile = async (req, res) => {
  try {
    const existing = await DeliveryPartner.findOne({ user: req.user._id });
    if (existing) {
      return res.status(400).json({ message: "Partner profile already exists" });
    }

    const { vehicleType, maxActiveOrders, avgSpeedKmph, coordinates } = req.body;

    const partner = await DeliveryPartner.create({
      user: req.user._id,
      vehicleType,
      maxActiveOrders,
      avgSpeedKmph,
      currentLocation: coordinates ? { type: "Point", coordinates } : undefined,
      status: "offline",
    });

    return res.status(201).json(partner);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route GET /api/delivery/me
// @access delivery_partner — used by the partner app to check for an existing
// profile after login, and to load their current active orders with full detail
export const getMyPartnerProfile = async (req, res) => {
  try {
    const partner = await DeliveryPartner.findOne({ user: req.user._id }).populate({
      path: "activeOrders",
      populate: [
        { path: "restaurant", select: "name address location" },
        { path: "customer", select: "name phone" },
      ],
    });

    if (!partner) {
      return res.status(404).json({ message: "No partner profile found" });
    }

    return res.json(partner);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route PUT /api/delivery/location
// @access delivery_partner — sent frequently as they move (also broadcast over Socket.IO in practice)
export const updateLocation = async (req, res) => {
  try {
    const { coordinates } = req.body; // [lng, lat]
    if (!coordinates || coordinates.length !== 2) {
      return res.status(400).json({ message: "coordinates [lng, lat] required" });
    }

    const partner = await DeliveryPartner.findOneAndUpdate(
      { user: req.user._id },
      { currentLocation: { type: "Point", coordinates } },
      { new: true }
    );

    if (!partner) {
      return res.status(404).json({ message: "Partner profile not found" });
    }

    // Broadcast to anyone tracking this partner's active orders
    const io = req.app.get("io");
    partner.activeOrders.forEach((orderId) => {
      io?.to(`order_${orderId}`).emit("partner_location_updated", { coordinates });
    });

    return res.json(partner);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route PUT /api/delivery/status
// @access delivery_partner — go online/offline
export const updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!["offline", "available"].includes(status)) {
      return res.status(400).json({ message: 'status must be "offline" or "available"' });
    }

    const partner = await DeliveryPartner.findOne({ user: req.user._id });
    if (!partner) {
      return res.status(404).json({ message: "Partner profile not found" });
    }

    if (partner.activeOrders.length > 0 && status === "offline") {
      return res.status(400).json({ message: "Cannot go offline with active deliveries in progress" });
    }

    partner.status = status;
    await partner.save();
    return res.json(partner);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route GET /api/delivery/nearby?lat=&lng=&maxDistanceKm=
// @access restaurant/admin — mostly useful for debugging/visualizing the optimizer
export const getNearbyPartners = async (req, res) => {
  try {
    const { lat, lng, maxDistanceKm } = req.query;
    if (!lat || !lng) {
      return res.status(400).json({ message: "lat and lng are required" });
    }

    const partners = await DeliveryPartner.find({
      status: { $in: ["available", "assigned"] },
      currentLocation: {
        $near: {
          $geometry: { type: "Point", coordinates: [parseFloat(lng), parseFloat(lat)] },
          $maxDistance: (maxDistanceKm ? parseFloat(maxDistanceKm) : 7) * 1000,
        },
      },
    }).populate("user", "name phone");

    return res.json(partners);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route POST /api/delivery/assign/:orderId
// @access restaurant/admin — trigger the optimizer for a single order
export const triggerAssignment = async (req, res) => {
  try {
    const { order, partner, pickupEtaMinutes, deliveryEtaMinutes } = await assignOrderToPartner(
      req.params.orderId
    );

    req.app.get("io")?.to(`order_${order._id}`).emit("order_status_updated", {
      orderId: order._id,
      status: order.status,
      deliveryPartnerId: partner._id,
    });

    return res.json({ order, partner, pickupEtaMinutes, deliveryEtaMinutes });
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

// @route POST /api/delivery/assign-all/:restaurantId
// @access restaurant/admin — solves a mini vehicle-routing problem across every
// ready order at once (clusters nearby orders, optimizes multi-stop routes,
// then matches clusters to partners), rather than assigning order-by-order
export const triggerBatchAssignment = async (req, res) => {
  try {
    const { results, clusterCount, message } = await solveBatchForRestaurant(req.params.restaurantId);

    const io = req.app.get("io");
    results.forEach((result) => {
      if (!result.success) return;
      io?.to(`order_${result.order._id}`).emit("order_status_updated", {
        orderId: result.order._id,
        status: result.order.status,
        deliveryPartnerId: result.partner._id,
      });
    });

    return res.json({ results, clusterCount, message });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
