import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { MapContainer, TileLayer, Marker, Popup } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import api from "../services/api.js";

const restaurantIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-blue.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

const DEFAULT_CENTER = [22.7196, 75.8577]; // Indore, India — fallback if geolocation is denied

export default function RestaurantBrowse() {
  const [center, setCenter] = useState(DEFAULT_CENTER);
  const [restaurants, setRestaurants] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    navigator.geolocation?.getCurrentPosition(
      (pos) => setCenter([pos.coords.latitude, pos.coords.longitude]),
      () => {} // silently fall back to default center if denied
    );
  }, []);

  useEffect(() => {
    setLoading(true);
    api
      .get("/restaurants", {
        params: { lat: center[0], lng: center[1], maxDistanceKm: 10 },
      })
      .then(({ data }) => setRestaurants(data))
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, [center]);

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-4 bg-white shadow-sm">
        <h1 className="text-xl font-semibold text-gray-800">Restaurants near you</h1>
      </div>

      <div className="h-72 w-full">
        <MapContainer center={center} zoom={13} className="h-full w-full">
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          {restaurants.map((r) => (
            <Marker
              key={r._id}
              position={[r.location.coordinates[1], r.location.coordinates[0]]}
              icon={restaurantIcon}
            >
              <Popup>
                <Link to={`/restaurants/${r._id}`} className="text-brand-600 font-medium">
                  {r.name}
                </Link>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>

      <div className="p-4">
        {loading && <p className="text-gray-500">Loading restaurants…</p>}
        {error && <p className="text-red-600">{error}</p>}
        {!loading && restaurants.length === 0 && (
          <p className="text-gray-500">No restaurants found within 10km. Try seeding some test data.</p>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {restaurants.map((r) => (
            <Link
              key={r._id}
              to={`/restaurants/${r._id}`}
              className="bg-white rounded-lg shadow-sm p-4 hover:shadow-md transition"
            >
              <p className="font-medium text-gray-800">{r.name}</p>
              <p className="text-sm text-gray-500">{r.cuisine?.join(", ")}</p>
              <p className="text-xs text-gray-400 mt-1">{r.address}</p>
            </Link>
          ))}
        </div>
      </div>
    </div>
  );
}
