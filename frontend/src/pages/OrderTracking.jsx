import { useParams } from "react-router-dom";
import { useState } from "react";
import { MapContainer, TileLayer, Marker, Popup, Polyline } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { useOrderTracking } from "../hooks/useOrderTracking.js";
import { decodePolyline } from "../utils/polyline.js";
import { payForOrder } from "../utils/razorpayCheckout.js";
import { useAuth } from "../context/AuthContext.jsx";

// Leaflet's default marker icons don't resolve correctly under Vite's bundler,
// so we point them at the CDN copies instead of shipping local assets.
const makeIcon = (color) =>
  new L.Icon({
    iconUrl: `https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-${color}.png`,
    shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
    iconSize: [25, 41],
    iconAnchor: [12, 41],
    popupAnchor: [1, -34],
  });

const restaurantIcon = makeIcon("blue");
const customerIcon = makeIcon("green");
const partnerIcon = makeIcon("red");

const STATUS_LABELS = {
  placed: "Order placed",
  confirmed: "Confirmed by restaurant",
  preparing: "Being prepared",
  ready_for_pickup: "Ready for pickup",
  assigned: "Delivery partner assigned",
  picked_up: "Picked up",
  on_the_way: "On the way",
  delivered: "Delivered",
  cancelled: "Cancelled",
};

// [lng, lat] -> [lat, lng], since GeoJSON and Leaflet disagree on axis order
const toLatLng = ([lng, lat]) => [lat, lng];

export default function OrderTracking() {
  const { orderId } = useParams();
  const { order, status, partnerLocation, error } = useOrderTracking(orderId);
  const { user } = useAuth();
  const [paying, setPaying] = useState(false);
  const [paymentMessage, setPaymentMessage] = useState(null);

  const retryPayment = async () => {
    setPaying(true);
    setPaymentMessage(null);
    const result = await payForOrder(orderId, user);
    if (result.ok) {
      setPaymentMessage("Payment successful!");
    } else {
      setPaymentMessage(result.reason);
    }
    setPaying(false);
  };

  if (error) {
    return <div className="p-6 text-red-600">Failed to load order: {error}</div>;
  }
  if (!order) {
    return <div className="p-6 text-gray-500">Loading order…</div>;
  }

  const restaurantLatLng = toLatLng(order.restaurant.location.coordinates);
  const customerLatLng = toLatLng(order.deliveryAddress.location.coordinates);
  const partnerLatLng = partnerLocation ? toLatLng(partnerLocation) : null;
  const roadRoutePath = order.deliveryRoutePolyline ? decodePolyline(order.deliveryRoutePolyline) : null;

  const center = partnerLatLng || restaurantLatLng;

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="p-4 bg-white shadow-sm">
        <h1 className="text-xl font-semibold text-gray-800">Order #{order._id.slice(-6)}</h1>
        <p className="text-brand-600 font-medium mt-1">
          {STATUS_LABELS[status] || status}
        </p>
        {order.estimatedDeliveryAt && status !== "delivered" && (
          <p className="text-sm text-gray-500">
            ETA: {new Date(order.estimatedDeliveryAt).toLocaleTimeString()}
            {order.routeSource === "google_maps" && (
              <span className="ml-2 text-xs text-blue-600">· real road route</span>
            )}
          </p>
        )}

        {order.paymentMethod === "razorpay" && status !== "cancelled" && (
          <div className="mt-2 flex items-center gap-2">
            {order.paymentStatus === "paid" ? (
              <span className="text-xs px-2 py-1 rounded-full bg-green-100 text-green-700">Paid online</span>
            ) : (
              <>
                <span className="text-xs px-2 py-1 rounded-full bg-yellow-100 text-yellow-700">
                  Payment {order.paymentStatus === "failed" ? "failed" : "pending"}
                </span>
                <button
                  onClick={retryPayment}
                  disabled={paying}
                  className="text-xs px-3 py-1 rounded-md bg-brand-500 text-white hover:bg-brand-600 transition disabled:opacity-50"
                >
                  {paying ? "Opening checkout…" : "Pay now"}
                </button>
              </>
            )}
          </div>
        )}
        {paymentMessage && <p className="text-xs text-gray-500 mt-1">{paymentMessage}</p>}
      </div>

      <div className="h-[500px] w-full">
        <MapContainer center={center} zoom={14} className="h-full w-full">
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          <Marker position={restaurantLatLng} icon={restaurantIcon}>
            <Popup>{order.restaurant.name}</Popup>
          </Marker>

          <Marker position={customerLatLng} icon={customerIcon}>
            <Popup>Delivery address</Popup>
          </Marker>

          {/* Actual road route from the restaurant to the customer, captured once at
              assignment time via the Directions API. Static reference line — doesn't
              move with the partner, unlike the dashed live-tracking line below. */}
          {roadRoutePath && roadRoutePath.length > 0 && (
            <Polyline positions={roadRoutePath} color="#2563eb" weight={4} opacity={0.7} />
          )}

          {partnerLatLng && (
            <>
              <Marker position={partnerLatLng} icon={partnerIcon}>
                <Popup>Your delivery partner</Popup>
              </Marker>
              <Polyline positions={[partnerLatLng, customerLatLng]} color="#ea580c" dashArray="6 8" />
            </>
          )}
        </MapContainer>
      </div>

      <div className="p-4 bg-white mt-2 shadow-sm">
        <h2 className="font-medium text-gray-700 mb-2">Items</h2>
        <ul className="text-sm text-gray-600 space-y-1">
          {order.items.map((item, i) => (
            <li key={i}>
              {item.quantity} × {item.name} — ₹{item.price * item.quantity}
            </li>
          ))}
        </ul>
        <div className="mt-3 pt-3 border-t text-sm text-gray-700 flex justify-between font-medium">
          <span>Total</span>
          <span>₹{order.total}</span>
        </div>
      </div>
    </div>
  );
}
