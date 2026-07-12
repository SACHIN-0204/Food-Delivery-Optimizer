import DeliveryPartner from "../models/DeliveryPartner.js";
import Order from "../models/Order.js";
import Restaurant from "../models/Restaurant.js";
import { haversineDistanceKm, estimateTravelMinutes } from "../utils/geo.js";
import { isGoogleMapsConfigured, getDistanceMatrix, getDirectionsRoute } from "../utils/googleMaps.js";

// Tunables for the scoring function. Lower score = better candidate.
const WEIGHTS = {
  distanceKm: 1.0, // cost per km to reach the restaurant
  loadPenaltyPerOrder: 1.5, // cost per already-active order (keeps assignment balanced)
  sameRestaurantBatchBonus: -2.5, // discount if partner already has a pickup at this restaurant
};

const MAX_CANDIDATE_DISTANCE_KM = 7;
const MAX_CANDIDATES = 15;

/**
 * Finds nearby delivery partners who are either free or have room for another order,
 * using the 2dsphere index on currentLocation for an efficient $near query.
 * This is always a straight-line radius search regardless of routing provider —
 * it's just a cheap prefilter before real distances get computed below.
 * Exported so the batch VRP solver can reuse the same candidate pool logic.
 */
export const getCandidatePartners = async (restaurantCoordinates) => {
  const partners = await DeliveryPartner.find({
    status: { $in: ["available", "assigned", "on_delivery"] },
    currentLocation: {
      $near: {
        $geometry: { type: "Point", coordinates: restaurantCoordinates },
        $maxDistance: MAX_CANDIDATE_DISTANCE_KM * 1000,
      },
    },
  }).limit(MAX_CANDIDATES);

  // Only keep partners who actually have capacity left
  return partners.filter((p) => p.activeOrders.length < p.maxActiveOrders);
};

/**
 * Gets pickup-leg distance/duration for every candidate against the restaurant.
 * Uses ONE Distance Matrix API call for the whole batch when Google Maps is
 * configured (real road distance) — falls back to Haversine per-candidate for
 * any entry that's missing (API not configured, or that specific leg failed).
 */
const getPickupLegs = async (candidates, restaurantCoordinates) => {
  const origins = candidates.map((p) => p.currentLocation.coordinates);
  const matrixResults = await getDistanceMatrix(origins, restaurantCoordinates);

  return candidates.map((partner, i) => {
    const real = matrixResults?.[i];
    if (real) {
      return { partner, distanceKm: real.distanceKm, durationMinutes: real.durationMinutes, source: "google_maps" };
    }
    const distanceKm = haversineDistanceKm(partner.currentLocation.coordinates, restaurantCoordinates);
    return {
      partner,
      distanceKm,
      durationMinutes: estimateTravelMinutes(distanceKm, partner.avgSpeedKmph),
      source: "haversine",
    };
  });
};

/**
 * Scores a candidate partner for a given order. Lower is better.
 * Combines: distance to restaurant, current load (spread work across partners),
 * and a bonus for partners who already have an active pickup at the same restaurant
 * (encourages batching multiple orders into one trip).
 */
const scoreCandidate = (pickupLeg, ordersAtSameRestaurant) => {
  const loadPenalty = pickupLeg.partner.activeOrders.length * WEIGHTS.loadPenaltyPerOrder;

  const hasBatchableOrder = pickupLeg.partner.activeOrders.some((orderId) =>
    ordersAtSameRestaurant.has(orderId.toString())
  );
  const batchBonus = hasBatchableOrder ? WEIGHTS.sameRestaurantBatchBonus : 0;

  return pickupLeg.distanceKm * WEIGHTS.distanceKm + loadPenalty + batchBonus;
};

/**
 * Assigns the best available delivery partner to an order.
 * Returns the updated order, or throws if no partner is available.
 */
export const assignOrderToPartner = async (orderId) => {
  const order = await Order.findById(orderId);
  if (!order) throw new Error("Order not found");
  if (order.status !== "ready_for_pickup") {
    throw new Error(`Order must be "ready_for_pickup" to assign a partner (currently "${order.status}")`);
  }

  const restaurant = await Restaurant.findById(order.restaurant);
  if (!restaurant) throw new Error("Restaurant not found for this order");

  const restaurantCoordinates = restaurant.location.coordinates;
  const candidates = await getCandidatePartners(restaurantCoordinates);

  if (candidates.length === 0) {
    throw new Error("No available delivery partners nearby");
  }

  // Find other active, unpicked-up orders at this same restaurant, to detect batching opportunities
  const siblingOrders = await Order.find({
    restaurant: restaurant._id,
    status: { $in: ["ready_for_pickup", "assigned"] },
    _id: { $ne: order._id },
  }).select("_id");
  const ordersAtSameRestaurant = new Set(siblingOrders.map((o) => o._id.toString()));

  const pickupLegs = await getPickupLegs(candidates, restaurantCoordinates);

  let best = null;
  for (const leg of pickupLegs) {
    const score = scoreCandidate(leg, ordersAtSameRestaurant);
    if (!best || score < best.score) {
      best = { ...leg, score };
    }
  }

  const { partner, distanceKm: pickupDistanceKm, durationMinutes: pickupEtaMinutes } = best;

  // Delivery leg (restaurant -> customer): try a real road route (also gives us
  // a polyline to draw on the map), falling back to a straight-line estimate.
  const customerCoordinates = order.deliveryAddress.location.coordinates;
  const directionsResult = await getDirectionsRoute(restaurantCoordinates, customerCoordinates);

  let deliveryDistanceKm, deliveryEtaMinutes, deliveryRoutePolyline, routeSource;
  if (directionsResult) {
    deliveryDistanceKm = directionsResult.distanceKm;
    deliveryEtaMinutes = directionsResult.durationMinutes;
    deliveryRoutePolyline = directionsResult.encodedPolyline;
    routeSource = "google_maps";
  } else {
    deliveryDistanceKm = haversineDistanceKm(restaurantCoordinates, customerCoordinates);
    deliveryEtaMinutes = estimateTravelMinutes(deliveryDistanceKm, partner.avgSpeedKmph);
    deliveryRoutePolyline = null;
    routeSource = "haversine";
  }

  const totalEtaMinutes = pickupEtaMinutes + deliveryEtaMinutes;

  order.deliveryPartner = partner._id;
  order.status = "assigned";
  order.routeDistanceKm = Math.round((pickupDistanceKm + deliveryDistanceKm) * 100) / 100;
  order.assignmentScore = Math.round(best.score * 100) / 100;
  order.estimatedDeliveryAt = new Date(Date.now() + totalEtaMinutes * 60000);
  order.deliveryRoutePolyline = deliveryRoutePolyline;
  // If either leg used real data, mark it as such — the score itself may still
  // have used Haversine for that one candidate if its matrix entry failed.
  order.routeSource = best.source === "google_maps" || routeSource === "google_maps" ? "google_maps" : "haversine";
  await order.save();

  partner.activeOrders.push(order._id);
  partner.status = partner.activeOrders.length >= partner.maxActiveOrders ? "on_delivery" : "assigned";
  await partner.save();

  return { order, partner, pickupEtaMinutes, deliveryEtaMinutes };
};

/**
 * Batch-assigns all ready_for_pickup orders for a restaurant in one pass.
 * Processes them one at a time so each assignment benefits from the up-to-date
 * partner load and batching state left by the previous assignment.
 */
export const assignAllReadyOrdersForRestaurant = async (restaurantId) => {
  const readyOrders = await Order.find({ restaurant: restaurantId, status: "ready_for_pickup" }).sort({
    createdAt: 1, // oldest first, first-come-first-served
  });

  const results = [];
  for (const order of readyOrders) {
    try {
      const result = await assignOrderToPartner(order._id);
      results.push({ orderId: order._id, success: true, ...result });
    } catch (error) {
      results.push({ orderId: order._id, success: false, message: error.message });
    }
  }
  return results;
};

export { isGoogleMapsConfigured };
