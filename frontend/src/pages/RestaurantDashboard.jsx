import { useEffect, useState } from "react";
import { getSocket } from "../services/socket.js";
import api from "../services/api.js";

const STATUS_STYLES = {
  placed: "bg-yellow-100 text-yellow-700",
  confirmed: "bg-blue-100 text-blue-700",
  preparing: "bg-orange-100 text-orange-700",
  ready_for_pickup: "bg-purple-100 text-purple-700",
  assigned: "bg-indigo-100 text-indigo-700",
  on_the_way: "bg-teal-100 text-teal-700",
  delivered: "bg-green-100 text-green-700",
  cancelled: "bg-red-100 text-red-700",
};

// The next status a restaurant owner can push this order to, from the current one.
const NEXT_ACTION = {
  placed: { label: "Confirm", next: "confirmed" },
  confirmed: { label: "Start preparing", next: "preparing" },
  preparing: { label: "Mark ready for pickup", next: "ready_for_pickup" },
};

function OrdersPanel({ restaurantId }) {
  const [orders, setOrders] = useState([]);

  useEffect(() => {
    if (!restaurantId) return;

    api.get(`/orders/restaurant/${restaurantId}`).then(({ data }) => setOrders(data));

    const socket = getSocket();

    // Auto-joined server-side on connect for restaurant-role users, but this
    // keeps it explicit in case the socket connected before the room existed.
    const onNewOrder = (order) => {
      if (order.restaurant === restaurantId || order.restaurant?._id === restaurantId) {
        setOrders((prev) => [order, ...prev]);
      }
    };
    const onStatusUpdate = ({ orderId, status }) => {
      setOrders((prev) => prev.map((o) => (o._id === orderId ? { ...o, status } : o)));
    };

    socket.on("new_order", onNewOrder);
    socket.on("order_status_updated", onStatusUpdate);

    return () => {
      socket.off("new_order", onNewOrder);
      socket.off("order_status_updated", onStatusUpdate);
    };
  }, [restaurantId]);

  const advanceStatus = async (orderId, nextStatus) => {
    await api.put(`/orders/${orderId}/status`, { status: nextStatus });
    setOrders((prev) => prev.map((o) => (o._id === orderId ? { ...o, status: nextStatus } : o)));
  };

  return (
    <div>
      {orders.length === 0 && <p className="text-gray-500">No orders yet.</p>}

      <div className="space-y-3">
        {orders.map((order) => {
          const action = NEXT_ACTION[order.status];
          return (
            <div key={order._id} className="bg-white rounded-lg shadow-sm p-4 flex items-center justify-between">
              <div>
                <p className="font-medium text-gray-800">Order #{order._id.slice(-6)}</p>
                <p className="text-sm text-gray-500">
                  {order.items?.length ?? 0} item(s) · ₹{order.total}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span className={`text-xs px-2 py-1 rounded-full ${STATUS_STYLES[order.status] || "bg-gray-100 text-gray-600"}`}>
                  {order.status}
                </span>
                {action && (
                  <button
                    onClick={() => advanceStatus(order._id, action.next)}
                    className="text-sm px-3 py-1.5 rounded-md bg-brand-500 text-white hover:bg-brand-600 transition"
                  >
                    {action.label}
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MenuPanel({ restaurantId }) {
  const [menu, setMenu] = useState([]);
  const [form, setForm] = useState({ name: "", price: "", category: "", prepTimeMinutes: 15 });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const loadMenu = () => {
    api.get(`/restaurants/${restaurantId}`).then(({ data }) => setMenu(data.menu));
  };

  useEffect(() => {
    if (restaurantId) loadMenu();
  }, [restaurantId]);

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const addItem = async (e) => {
    e.preventDefault();
    setError(null);

    if (!form.name || !form.price) {
      setError("Name and price are required.");
      return;
    }

    setSubmitting(true);
    try {
      await api.post(`/restaurants/${restaurantId}/menu`, {
        name: form.name,
        price: Number(form.price),
        category: form.category,
        prepTimeMinutes: Number(form.prepTimeMinutes) || 15,
      });
      setForm({ name: "", price: "", category: "", prepTimeMinutes: 15 });
      loadMenu();
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const toggleAvailability = async (item) => {
    await api.put(`/restaurants/${restaurantId}/menu/${item._id}`, { isAvailable: !item.isAvailable });
    loadMenu();
  };

  const removeItem = async (itemId) => {
    await api.delete(`/restaurants/${restaurantId}/menu/${itemId}`);
    loadMenu();
  };

  return (
    <div className="space-y-6">
      <form onSubmit={addItem} className="bg-white rounded-lg shadow-sm p-4 grid gap-3 sm:grid-cols-4">
        <input
          value={form.name}
          onChange={update("name")}
          placeholder="Item name"
          className="border rounded-md px-3 py-2 text-sm sm:col-span-2"
        />
        <input
          type="number"
          value={form.price}
          onChange={update("price")}
          placeholder="Price (₹)"
          className="border rounded-md px-3 py-2 text-sm"
        />
        <input
          value={form.category}
          onChange={update("category")}
          placeholder="Category"
          className="border rounded-md px-3 py-2 text-sm"
        />
        <button
          type="submit"
          disabled={submitting}
          className="sm:col-span-4 py-2 rounded-md bg-brand-500 text-white text-sm hover:bg-brand-600 transition disabled:opacity-50"
        >
          {submitting ? "Adding…" : "Add menu item"}
        </button>
        {error && <p className="sm:col-span-4 text-sm text-red-600">{error}</p>}
      </form>

      <div className="bg-white rounded-lg shadow-sm divide-y">
        {menu.length === 0 && <p className="p-4 text-gray-500">No menu items yet — add your first one above.</p>}
        {menu.map((item) => (
          <div key={item._id} className="p-4 flex items-center justify-between">
            <div>
              <p className="font-medium text-gray-800">{item.name}</p>
              <p className="text-sm text-gray-500">
                ₹{item.price} {item.category && `· ${item.category}`}
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={() => toggleAvailability(item)}
                className={`text-xs px-2 py-1 rounded-full ${
                  item.isAvailable ? "bg-green-100 text-green-700" : "bg-gray-100 text-gray-500"
                }`}
              >
                {item.isAvailable ? "Available" : "Unavailable"}
              </button>
              <button onClick={() => removeItem(item._id)} className="text-xs text-red-500 hover:underline">
                Remove
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function RestaurantDashboard({ restaurantId }) {
  const [tab, setTab] = useState("orders");

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-4">Restaurant Dashboard</h1>

      <div className="flex gap-2 mb-4">
        {["orders", "menu"].map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-md text-sm font-medium capitalize transition ${
              tab === t ? "bg-brand-500 text-white" : "bg-white text-gray-600 hover:bg-gray-100"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "orders" ? <OrdersPanel restaurantId={restaurantId} /> : <MenuPanel restaurantId={restaurantId} />}
    </div>
  );
}
