import Order from "../models/Order.js";
import Restaurant from "../models/Restaurant.js";
import { haversineDistanceKm, estimateTravelMinutes } from "../utils/geo.js";
import { isGoogleMapsConfigured, getDirectionsRoute } from "../utils/googleMaps.js";
import { getCandidatePartners } from "./optimizationEngine.js";

// Same weighting philosophy as the per-order optimizer, applied to a whole cluster.
const WEIGHTS = {
  distanceKm: 1.0,
  loadPenaltyPerOrder: 1.5,
};

const MAX_CLUSTER_SIZE = 3; // cap on stops per trip — keeps permutation search bounded and matches typical bike-partner capacity
const MAX_CLUSTER_RADIUS_KM = 3; // orders farther apart than this don't get batched, even if a partner has room

/**
 * Generates every permutation of a small array. Only ever called with up to
 * MAX_CLUSTER_SIZE items (max 3! = 6 permutations) — safe from combinatorial blowup.
 */
function permutations(items) {
  if (items.length <= 1) return [items];
  const result = [];
  for (let i = 0; i < items.length; i++) {
    const rest = [...items.slice(0, i), ...items.slice(i + 1)];
    for (const perm of permutations(rest)) {
      result.push([items[i], ...perm]);
    }
  }
  return result;
}

/**
 * Greedy nearest-neighbor clustering: groups ready orders from the same
 * restaurant into batches that a single partner could reasonably carry in one
 * trip, based on how close their delivery addresses are to each other.
 */
function clusterOrdersByProximity(orders) {
  const unclustered = [...orders];
  const clusters = [];

  while (unclustered.length > 0) {
    const seed = unclustered.shift();
    const cluster = [seed];

    while (cluster.length < MAX_CLUSTER_SIZE && unclustered.length > 0) {
      let nearestIndex = -1;
      let nearestDistance = Infinity;

      unclustered.forEach((candidate, idx) => {
        const candidateCoords = candidate.deliveryAddress.location.coordinates;
        const minDistanceToCluster = Math.min(
          ...cluster.map((member) =>
            haversineDistanceKm(member.deliveryAddress.location.coordinates, candidateCoords)
          )
        );
        if (minDistanceToCluster < nearestDistance) {
          nearestDistance = minDistanceToCluster;
          nearestIndex = idx;
        }
      });

      if (nearestIndex === -1 || nearestDistance > MAX_CLUSTER_RADIUS_KM) break;

      cluster.push(unclustered[nearestIndex]);
      unclustered.splice(nearestIndex, 1);
    }

    clusters.push(cluster);
  }

  return clusters;
}

/**
 * Works out the best order to visit a cluster's delivery stops in, plus the
 * real distance/duration/polyline for that route.
 */
async function computeClusterRoute(restaurantCoordinates, cluster) {
  if (cluster.length === 1) {
    const destination = cluster[0].deliveryAddress.location.coordinates;
    const directionsResult = await getDirectionsRoute(restaurantCoordinates, destination);

    if (directionsResult) {
      return {
        orderSequence: cluster,
        totalDistanceKm: directionsResult.distanceKm,
        totalDurationMinutes: directionsResult.durationMinutes,
        legDurationsMinutes: [directionsResult.durationMinutes],
        polyline: directionsResult.encodedPolyline,
        source: "google_maps",
      };
    }

    const distanceKm = haversineDistanceKm(restaurantCoordinates, destination);
    const durationMinutes = estimateTravelMinutes(distanceKm);
    return {
      orderSequence: cluster,
      totalDistanceKm: distanceKm,
      totalDurationMinutes: durationMinutes,
      legDurationsMinutes: [durationMinutes],
      polyline: null,
      source: "haversine",
    };
  }

  // Multi-stop: destination = last order in the cluster, waypoints = the rest,
  // and we let Google optimize the waypoint order (real road-network TSP).
  if (isGoogleMapsConfigured()) {
    const destinationOrder = cluster[cluster.length - 1];
    const waypointOrders = cluster.slice(0, -1);

    const directionsResult = await getDirectionsRoute(
      restaurantCoordinates,
      destinationOrder.deliveryAddress.location.coordinates,
      {
        waypoints: waypointOrders.map((o) => o.deliveryAddress.location.coordinates),
        optimizeWaypoints: true,
      }
    );

    if (directionsResult) {
      const orderedWaypoints = (directionsResult.waypointOrder ?? waypointOrders.map((_, i) => i)).map(
        (idx) => waypointOrders[idx]
      );
      return {
        orderSequence: [...orderedWaypoints, destinationOrder],
        totalDistanceKm: directionsResult.distanceKm,
        totalDurationMinutes: directionsResult.durationMinutes,
        legDurationsMinutes: directionsResult.legDurationsMinutes,
        polyline: directionsResult.encodedPolyline,
        source: "google_maps",
      };
    }
  }

  // Fallback: brute-force permutation search over Haversine distances.
  // Safe because clusters are capped at MAX_CLUSTER_SIZE (3): at most 6 permutations.
  let best = null;
  for (const sequence of permutations(cluster)) {
    let totalDistanceKm = 0;
    let point = restaurantCoordinates;
    const legDistances = [];
    for (const order of sequence) {
      const legKm = haversineDistanceKm(point, order.deliveryAddress.location.coordinates);
      legDistances.push(legKm);
      totalDistanceKm += legKm;
      point = order.deliveryAddress.location.coordinates;
    }
    if (!best || totalDistanceKm < best.totalDistanceKm) {
      best = { orderSequence: sequence, totalDistanceKm, legDistances };
    }
  }

  return {
    orderSequence: best.orderSequence,
    totalDistanceKm: best.totalDistanceKm,
    totalDurationMinutes: best.legDistances.reduce((sum, km) => sum + estimateTravelMinutes(km), 0),
    legDurationsMinutes: best.legDistances.map((km) => estimateTravelMinutes(km)),
    polyline: null,
    source: "haversine",
  };
}

/**
 * Matches computed clusters to available partners: bigger clusters get
 * matched first, each to whichever available partner minimizes pickup
 * distance + current load. Each partner takes at most one cluster per batch
 * run — a full min-cost bipartite match would be more globally optimal but
 * is overkill at the scale a single restaurant's ready queue operates at.
 */
function matchClustersToPartners(clusters, candidatePartners) {
  const clustersBySize = [...clusters].sort((a, b) => b.length - a.length);
  const availablePartners = [...candidatePartners];
  const matches = [];

  for (const cluster of clustersBySize) {
    let best = null;

    for (const partner of availablePartners) {
      const remainingCapacity = partner.maxActiveOrders - partner.activeOrders.length;
      if (remainingCapacity < cluster.length) continue;

      const distanceKm = haversineDistanceKm(partner.currentLocation.coordinates, cluster.pickupCoordinates);
      const loadPenalty = partner.activeOrders.length * WEIGHTS.loadPenaltyPerOrder;
      const score = distanceKm * WEIGHTS.distanceKm + loadPenalty;

      if (!best || score < best.score) {
        best = { partner, score, pickupDistanceKm: distanceKm };
      }
    }

    if (best) {
      matches.push({ cluster, ...best });
      availablePartners.splice(availablePartners.indexOf(best.partner), 1);
    } else {
      matches.push({ cluster, partner: null, score: null, pickupDistanceKm: null });
    }
  }

  return matches;
}

/**
 * The main entry point: solves a mini vehicle-routing problem for one
 * restaurant's ready-for-pickup orders. Unlike the strictly greedy per-order
 * optimizer, this looks at ALL ready orders at once, groups the ones worth
 * batching together, works out the best multi-stop route for each group, and
 * only then assigns partners.
 */
export const solveBatchForRestaurant = async (restaurantId) => {
  const restaurant = await Restaurant.findById(restaurantId);
  if (!restaurant) throw new Error("Restaurant not found");

  const readyOrders = await Order.find({ restaurant: restaurantId, status: "ready_for_pickup" }).sort({
    createdAt: 1,
  });

  if (readyOrders.length === 0) {
    return { results: [], clusterCount: 0, message: "No ready orders to assign" };
  }

  const restaurantCoordinates = restaurant.location.coordinates;
  const clusters = clusterOrdersByProximity(readyOrders);

  const routedClusters = await Promise.all(
    clusters.map(async (cluster) => {
      const route = await computeClusterRoute(restaurantCoordinates, cluster);
      return Object.assign(cluster, {
        pickupCoordinates: restaurantCoordinates,
        route,
      });
    })
  );

  const candidatePartners = await getCandidatePartners(restaurantCoordinates);
  const matches = matchClustersToPartners(routedClusters, candidatePartners);

  const results = [];
  for (const match of matches) {
    const { cluster, partner, score, pickupDistanceKm } = match;

    if (!partner) {
      for (const order of cluster) {
        results.push({ orderId: order._id, success: false, message: "No available partner with enough capacity" });
      }
      continue;
    }

    const pickupEtaMinutes = estimateTravelMinutes(pickupDistanceKm, partner.avgSpeedKmph);
    let cumulativeMinutes = pickupEtaMinutes;

    for (let i = 0; i < cluster.route.orderSequence.length; i++) {
      const order = cluster.route.orderSequence[i];
      cumulativeMinutes += cluster.route.legDurationsMinutes[i];

      order.deliveryPartner = partner._id;
      order.status = "assigned";
      order.routeDistanceKm = Math.round((pickupDistanceKm + cluster.route.totalDistanceKm) * 100) / 100;
      order.assignmentScore = Math.round(score * 100) / 100;
      order.estimatedDeliveryAt = new Date(Date.now() + cumulativeMinutes * 60000);
      order.deliveryRoutePolyline = cluster.route.polyline;
      order.routeSource = cluster.route.source;
      // eslint-disable-next-line no-await-in-loop
      await order.save();

      results.push({
        orderId: order._id,
        success: true,
        order,
        partner,
        stopNumber: i + 1,
        totalStops: cluster.route.orderSequence.length,
        etaMinutes: cumulativeMinutes,
      });
    }

    partner.activeOrders.push(...cluster.map((o) => o._id));
    partner.status = partner.activeOrders.length >= partner.maxActiveOrders ? "on_delivery" : "assigned";
    await partner.save();
  }

  return { results, clusterCount: routedClusters.length };
};
