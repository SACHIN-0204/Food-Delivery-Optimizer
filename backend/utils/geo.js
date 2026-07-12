const EARTH_RADIUS_KM = 6371;

const toRad = (deg) => (deg * Math.PI) / 180;

/**
 * Haversine distance between two [lng, lat] points, in kilometers.
 * Good enough for greedy assignment scoring without hitting an external Directions API
 * on every candidate. Swap in Google Directions API for turn-by-turn accurate routing
 * once you need real road distance instead of straight-line distance.
 */
export const haversineDistanceKm = ([lng1, lat1], [lng2, lat2]) => {
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return EARTH_RADIUS_KM * c;
};

/**
 * Estimate travel time in minutes given distance and average speed (km/h).
 * Adds a small fixed buffer for traffic lights/turns/stops.
 */
export const estimateTravelMinutes = (distanceKm, avgSpeedKmph = 25, bufferMinutes = 3) => {
  const travelMinutes = (distanceKm / avgSpeedKmph) * 60;
  return Math.ceil(travelMinutes + bufferMinutes);
};
