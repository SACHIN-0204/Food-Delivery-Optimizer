import Order from "../models/Order.js";
import DeliveryPartner from "../models/DeliveryPartner.js";
import Restaurant from "../models/Restaurant.js";
import User from "../models/User.js";

// @route GET /api/admin/orders?status=&restaurantId=
export const getAllOrders = async (req, res) => {
  try {
    const { status, restaurantId } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (restaurantId) filter.restaurant = restaurantId;

    const orders = await Order.find(filter)
      .sort({ createdAt: -1 })
      .limit(200)
      .populate("customer", "name phone")
      .populate("restaurant", "name")
      .populate({ path: "deliveryPartner", populate: { path: "user", select: "name phone" } });

    return res.json(orders);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route GET /api/admin/partners
export const getAllPartners = async (req, res) => {
  try {
    const partners = await DeliveryPartner.find({})
      .populate("user", "name phone")
      .populate("activeOrders", "status total");
    return res.json(partners);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route GET /api/admin/restaurants
export const getAllRestaurants = async (req, res) => {
  try {
    const restaurants = await Restaurant.find({}).populate("owner", "name email").select("-menu");
    return res.json(restaurants);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route GET /api/admin/stats
// High-level counters for a dashboard header, plus a rough view of optimizer health
export const getStats = async (req, res) => {
  try {
    const [
      totalOrders,
      activeOrders,
      deliveredOrders,
      cancelledOrders,
      totalPartners,
      availablePartners,
      totalRestaurants,
      totalCustomers,
      unassignedReadyOrders,
    ] = await Promise.all([
      Order.countDocuments({}),
      Order.countDocuments({ status: { $in: ["placed", "confirmed", "preparing", "ready_for_pickup", "assigned", "picked_up", "on_the_way"] } }),
      Order.countDocuments({ status: "delivered" }),
      Order.countDocuments({ status: "cancelled" }),
      DeliveryPartner.countDocuments({}),
      DeliveryPartner.countDocuments({ status: "available" }),
      Restaurant.countDocuments({}),
      User.countDocuments({ role: "customer" }),
      Order.countDocuments({ status: "ready_for_pickup" }), // waiting on the optimizer
    ]);

    // Average assignment score across recently assigned orders — a rough signal
    // of how "good" (low distance/load) recent optimizer decisions have been
    const scoreAgg = await Order.aggregate([
      { $match: { assignmentScore: { $ne: null } } },
      { $sort: { createdAt: -1 } },
      { $limit: 50 },
      { $group: { _id: null, avgScore: { $avg: "$assignmentScore" }, avgRouteDistanceKm: { $avg: "$routeDistanceKm" } } },
    ]);

    return res.json({
      totalOrders,
      activeOrders,
      deliveredOrders,
      cancelledOrders,
      totalPartners,
      availablePartners,
      totalRestaurants,
      totalCustomers,
      unassignedReadyOrders,
      avgAssignmentScore: scoreAgg[0]?.avgScore ?? null,
      avgRouteDistanceKm: scoreAgg[0]?.avgRouteDistanceKm ?? null,
    });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
