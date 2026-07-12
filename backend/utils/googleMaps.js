const GOOGLE_MAPS_API_KEY = process.env.GOOGLE_MAPS_API_KEY;

export const isGoogleMapsConfigured = () => Boolean(GOOGLE_MAPS_API_KEY);

// Google's APIs take "lat,lng" strings; our data model stores GeoJSON [lng, lat] everywhere else.
const toLatLngString = ([lng, lat]) => `${lat},${lng}`;

/**
 * Gets real road distance + duration from each of several origins to a single
 * destination in ONE API call. This is the efficient way to score many
 * candidate delivery partners against a restaurant — one Distance Matrix call
 * instead of N separate Directions calls.
 *
 * Returns an array aligned with `origins`, each entry either
 * { distanceKm, durationMinutes } or null if that particular leg failed
 * (e.g. no road route found), so the optimizer can fall back to Haversine
 * for just that candidate rather than discarding the whole batch.
 *
 * Returns null (not an array) if the API call itself failed or isn't configured,
 * signaling the caller should fall back to Haversine for everyone.
 */
export const getDistanceMatrix = async (origins, destination) => {
  if (!isGoogleMapsConfigured() || origins.length === 0) return null;

  const params = new URLSearchParams({
    origins: origins.map(toLatLngString).join("|"),
    destinations: toLatLngString(destination),
    key: GOOGLE_MAPS_API_KEY,
    units: "metric",
  });

  try {
    const res = await fetch(`https://maps.googleapis.com/maps/api/distancematrix/json?${params}`);
    const data = await res.json();

    if (data.status !== "OK") {
      console.warn(`Distance Matrix API error: ${data.status} — falling back to Haversine`);
      return null;
    }

    return data.rows.map((row) => {
      const element = row.elements?.[0];
      if (!element || element.status !== "OK") return null;
      return {
        distanceKm: element.distance.value / 1000,
        durationMinutes: Math.ceil(element.duration.value / 60),
      };
    });
  } catch (error) {
    console.warn(`Distance Matrix API request failed: ${error.message} — falling back to Haversine`);
    return null;
  }
};

/**
 * Gets a full road route (distance, duration, and an encoded polyline for
 * drawing the actual path on a map) between two points, optionally passing
 * through intermediate waypoints.
 *
 * When `waypoints` is provided with `optimizeWaypoints: true`, Google reorders
 * the waypoints (not the final destination) into the shortest sequence itself —
 * this is what lets us hand it a multi-stop delivery run and get a genuinely
 * optimized visiting order back, instead of solving that ourselves.
 *
 * Returns null on any failure so the caller can fall back to Haversine + a
 * nearest-neighbor stop order.
 */
export const getDirectionsRoute = async (origin, destination, options = {}) => {
  if (!isGoogleMapsConfigured()) return null;

  const { waypoints = [], optimizeWaypoints = false } = options;

  const params = new URLSearchParams({
    origin: toLatLngString(origin),
    destination: toLatLngString(destination),
    key: GOOGLE_MAPS_API_KEY,
  });

  if (waypoints.length > 0) {
    const waypointsParam = waypoints.map(toLatLngString).join("|");
    params.set("waypoints", optimizeWaypoints ? `optimize:true|${waypointsParam}` : waypointsParam);
  }

  try {
    const res = await fetch(`https://maps.googleapis.com/maps/api/directions/json?${params}`);
    const data = await res.json();

    if (data.status !== "OK" || !data.routes?.[0]) {
      console.warn(`Directions API error: ${data.status} — falling back to a straight line`);
      return null;
    }

    const route = data.routes[0];
    const legDistancesKm = route.legs.map((leg) => leg.distance.value / 1000);
    const legDurationsMinutes = route.legs.map((leg) => Math.ceil(leg.duration.value / 60));

    return {
      distanceKm: legDistancesKm.reduce((a, b) => a + b, 0),
      durationMinutes: legDurationsMinutes.reduce((a, b) => a + b, 0),
      encodedPolyline: route.overview_polyline.points,
      legDistancesKm, // per-leg breakdown, in visiting order: origin->wp1, wp1->wp2, ..., ->destination
      legDurationsMinutes,
      // Google's optimized order for the waypoints array we sent (indices into `waypoints`),
      // NOT including origin/destination since those are fixed. Absent if we didn't ask to optimize.
      waypointOrder: route.waypoint_order ?? null,
    };
  } catch (error) {
    console.warn(`Directions API request failed: ${error.message} — falling back to a straight line`);
    return null;
  }
};
