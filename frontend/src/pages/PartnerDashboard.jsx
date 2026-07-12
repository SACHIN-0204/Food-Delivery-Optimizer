import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api.js";
import { getSocket } from "../services/socket.js";

// What a partner can do next for an order they're carrying. Earlier stages
// (placed -> ready_for_pickup) belong to the restaurant, not the partner.
const NEXT_ACTION = {
  assigned: { label: "Picked up", next: "picked_up" },
  picked_up: { label: "On the way", next: "on_the_way" },
  on_the_way: { label: "Delivered", next: "delivered" },
};

const STATUS_STYLES = {
  assigned: "bg-indigo-100 text-indigo-700",
  picked_up: "bg-purple-100 text-purple-700",
  on_the_way: "bg-teal-100 text-teal-700",
  delivered: "bg-green-100 text-green-700",
};

export default function PartnerDashboard() {
  const navigate = useNavigate();
  const [partner, setPartner] = useState(null);
  const [error, setError] = useState(null);
  const [locationSharing, setLocationSharing] = useState(false);
  const [lastCoordinates, setLastCoordinates] = useState(null);
  const watchIdRef = useRef(null);

  const loadProfile = () => {
    api
      .get("/delivery/me")
      .then(({ data }) => setPartner(data))
      .catch((err) => {
        if (err.response?.status === 404) {
          navigate("/partner/onboarding");
        } else {
          setError(err.message);
        }
      });
  };

  useEffect(() => {
    loadProfile();

    const socket = getSocket();
    const onStatusUpdate = () => loadProfile(); // simplest way to keep activeOrders in sync
    socket.on("order_status_updated", onStatusUpdate);
    return () => socket.off("order_status_updated", onStatusUpdate);
  }, []);

  // Starts/stops streaming the device's GPS position over the socket
  // (low latency, used for the customer-facing live map).
  const toggleLocationSharing = () => {
    if (locationSharing) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
      setLocationSharing(false);
      return;
    }

    if (!navigator.geolocation) {
      setError("Geolocation isn't available in this browser.");
      return;
    }

    watchIdRef.current = navigator.geolocation.watchPosition(
      (pos) => {
        const coordinates = [pos.coords.longitude, pos.coords.latitude];
        setLastCoordinates(coordinates);
        getSocket().emit("partner_location_update", { coordinates });
      },
      (err) => setError(`Location error: ${err.message}`),
      { enableHighAccuracy: true, maximumAge: 5000, timeout: 10000 }
    );
    setLocationSharing(true);
  };

  const goOnline = async () => {
    setError(null);
    try {
      await api.put("/delivery/status", { status: "available" });
      loadProfile();
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    }
  };

  const goOffline = async () => {
    setError(null);
    try {
      await api.put("/delivery/status", { status: "offline" });
      loadProfile();
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    }
  };

  const advanceOrder = async (orderId, nextStatus) => {
    await api.put(`/orders/${orderId}/status`, { status: nextStatus });
    loadProfile();
  };

  if (!partner) {
    return <div className="p-6 text-gray-500">Loading your profile…</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-800">Delivery Partner</h1>
        <span
          className={`text-xs px-3 py-1 rounded-full font-medium ${
            partner.status === "offline" ? "bg-gray-200 text-gray-600" : "bg-green-100 text-green-700"
          }`}
        >
          {partner.status}
        </span>
      </div>

      <div className="bg-white rounded-lg shadow-sm p-4 mb-6 flex flex-wrap items-center gap-3">
        {partner.status === "offline" ? (
          <button onClick={goOnline} className="px-4 py-2 rounded-lg bg-brand-500 text-white hover:bg-brand-600 transition">
            Go online
          </button>
        ) : (
          <button onClick={goOffline} className="px-4 py-2 rounded-lg border border-gray-300 text-gray-700 hover:bg-gray-50 transition">
            Go offline
          </button>
        )}

        <button
          onClick={toggleLocationSharing}
          className={`px-4 py-2 rounded-lg transition ${
            locationSharing ? "bg-teal-500 text-white hover:bg-teal-600" : "border border-gray-300 text-gray-700 hover:bg-gray-50"
          }`}
        >
          {locationSharing ? "Sharing location…" : "Share live location"}
        </button>

        {lastCoordinates && (
          <span className="text-xs text-gray-400">
            Last ping: {lastCoordinates[1].toFixed(4)}, {lastCoordinates[0].toFixed(4)}
          </span>
        )}
      </div>

      {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

      <h2 className="font-medium text-gray-700 mb-3">
        Active deliveries ({partner.activeOrders?.length ?? 0} / {partner.maxActiveOrders})
      </h2>

      {(!partner.activeOrders || partner.activeOrders.length === 0) && (
        <p className="text-gray-500">No active deliveries right now. Go online to start receiving assignments.</p>
      )}

      <div className="space-y-3">
        {partner.activeOrders?.map((order) => {
          const action = NEXT_ACTION[order.status];
          return (
            <div key={order._id} className="bg-white rounded-lg shadow-sm p-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-800">Order #{order._id.slice(-6)}</p>
                  <p className="text-sm text-gray-500">{order.restaurant?.name}</p>
                  <p className="text-xs text-gray-400">{order.deliveryAddress?.fullAddress}</p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-1 rounded-full ${STATUS_STYLES[order.status] || "bg-gray-100 text-gray-600"}`}>
                    {order.status}
                  </span>
                  {action && (
                    <button
                      onClick={() => advanceOrder(order._id, action.next)}
                      className="text-sm px-3 py-1.5 rounded-md bg-brand-500 text-white hover:bg-brand-600 transition"
                    >
                      {action.label}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
