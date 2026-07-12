import { useEffect, useState } from "react";
import { useParams, useNavigate } from "react-router-dom";
import api from "../services/api.js";
import AddressPicker from "../components/AddressPicker.jsx";
import { payForOrder } from "../utils/razorpayCheckout.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function RestaurantMenu() {
  const { restaurantId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [restaurant, setRestaurant] = useState(null);
  const [cart, setCart] = useState({}); // menuItemId -> quantity
  const [deliveryCoordinates, setDeliveryCoordinates] = useState(null);
  const [fullAddress, setFullAddress] = useState("");
  const [paymentMethod, setPaymentMethod] = useState("cod");
  const [placing, setPlacing] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get(`/restaurants/${restaurantId}`).then(({ data }) => setRestaurant(data));
  }, [restaurantId]);

  const updateQty = (itemId, delta) => {
    setCart((prev) => {
      const next = Math.max(0, (prev[itemId] || 0) + delta);
      const updated = { ...prev, [itemId]: next };
      if (next === 0) delete updated[itemId];
      return updated;
    });
  };

  const cartItems = restaurant?.menu.filter((item) => cart[item._id]) || [];
  const itemsTotal = cartItems.reduce((sum, item) => sum + item.price * cart[item._id], 0);

  const placeOrder = async () => {
    setError(null);

    if (cartItems.length === 0) {
      setError("Add at least one item to your cart.");
      return;
    }
    if (!deliveryCoordinates) {
      setError("Set your delivery location on the map.");
      return;
    }
    if (!fullAddress.trim()) {
      setError("Enter a delivery address label (e.g. flat/street).");
      return;
    }

    setPlacing(true);
    try {
      const { data: order } = await api.post("/orders", {
        restaurantId,
        items: cartItems.map((item) => ({ menuItemId: item._id, quantity: cart[item._id] })),
        deliveryAddress: {
          fullAddress,
          location: { type: "Point", coordinates: deliveryCoordinates },
        },
        paymentMethod,
      });

      if (paymentMethod === "razorpay") {
        const result = await payForOrder(order._id, user);
        if (!result.ok) {
          // Order still exists (paymentStatus stays "pending") — the customer can
          // retry payment from the order tracking page, so this isn't a dead end.
          setError(`${result.reason} You can retry payment from the order page, or the restaurant can be asked to switch it to Cash on Delivery.`);
          navigate(`/orders/${order._id}`);
          return;
        }
      }

      navigate(`/orders/${order._id}`);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setPlacing(false);
    }
  };

  if (!restaurant) {
    return <div className="p-6 text-gray-500">Loading menu…</div>;
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      <div className="p-4 bg-white shadow-sm">
        <h1 className="text-xl font-semibold text-gray-800">{restaurant.name}</h1>
        <p className="text-sm text-gray-500">{restaurant.cuisine?.join(", ")}</p>
      </div>

      <div className="p-4 space-y-3">
        {restaurant.menu.map((item) => (
          <div key={item._id} className="bg-white rounded-lg shadow-sm p-4 flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-800">{item.name}</p>
              <p className="text-sm text-gray-500">₹{item.price}</p>
              {!item.isAvailable && <p className="text-xs text-red-500">Currently unavailable</p>}
            </div>

            {item.isAvailable && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => updateQty(item._id, -1)}
                  className="w-7 h-7 rounded-full border text-gray-600 hover:bg-gray-100"
                >
                  −
                </button>
                <span className="w-5 text-center">{cart[item._id] || 0}</span>
                <button
                  onClick={() => updateQty(item._id, 1)}
                  className="w-7 h-7 rounded-full border text-gray-600 hover:bg-gray-100"
                >
                  +
                </button>
              </div>
            )}
          </div>
        ))}
      </div>

      {cartItems.length > 0 && (
        <div className="p-4 bg-white mt-2 space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700">Delivery address label</label>
            <input
              value={fullAddress}
              onChange={(e) => setFullAddress(e.target.value)}
              placeholder="e.g. 12 MG Road, Flat 4B"
              className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
            />
          </div>

          <AddressPicker onChange={setDeliveryCoordinates} />

          <div>
            <label className="text-sm font-medium text-gray-700">Payment method</label>
            <div className="mt-1 flex gap-3">
              <button
                type="button"
                onClick={() => setPaymentMethod("cod")}
                className={`flex-1 py-2 rounded-md text-sm border transition ${
                  paymentMethod === "cod"
                    ? "bg-brand-500 text-white border-brand-500"
                    : "text-gray-600 border-gray-300 hover:bg-gray-50"
                }`}
              >
                Cash on Delivery
              </button>
              <button
                type="button"
                onClick={() => setPaymentMethod("razorpay")}
                className={`flex-1 py-2 rounded-md text-sm border transition ${
                  paymentMethod === "razorpay"
                    ? "bg-brand-500 text-white border-brand-500"
                    : "text-gray-600 border-gray-300 hover:bg-gray-50"
                }`}
              >
                Pay online
              </button>
            </div>
          </div>

          {error && <p className="text-sm text-red-600">{error}</p>}
        </div>
      )}

      {cartItems.length > 0 && (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t p-4 flex items-center justify-between">
          <div>
            <p className="text-sm text-gray-500">{cartItems.length} item(s)</p>
            <p className="font-semibold text-gray-800">₹{itemsTotal}</p>
          </div>
          <button
            onClick={placeOrder}
            disabled={placing}
            className="px-5 py-2.5 rounded-lg bg-brand-500 text-white hover:bg-brand-600 transition disabled:opacity-50"
          >
            {placing ? "Placing order…" : paymentMethod === "razorpay" ? "Place order & pay" : "Place order (COD)"}
          </button>
        </div>
      )}
    </div>
  );
}
