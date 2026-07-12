import { useEffect, useState } from "react";
import api from "../services/api.js";

function StatCard({ label, value }) {
  return (
    <div className="bg-white rounded-lg shadow-sm p-4">
      <p className="text-xs text-gray-500 uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-semibold text-gray-800 mt-1">{value ?? "—"}</p>
    </div>
  );
}

const TABS = ["Orders", "Partners", "Restaurants"];

export default function AdminDashboard() {
  const [stats, setStats] = useState(null);
  const [activeTab, setActiveTab] = useState("Orders");
  const [orders, setOrders] = useState([]);
  const [partners, setPartners] = useState([]);
  const [restaurants, setRestaurants] = useState([]);
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get("/admin/stats").then(({ data }) => setStats(data)).catch((e) => setError(e.message));
  }, []);

  useEffect(() => {
    setError(null);
    if (activeTab === "Orders") {
      api.get("/admin/orders").then(({ data }) => setOrders(data)).catch((e) => setError(e.message));
    } else if (activeTab === "Partners") {
      api.get("/admin/partners").then(({ data }) => setPartners(data)).catch((e) => setError(e.message));
    } else if (activeTab === "Restaurants") {
      api.get("/admin/restaurants").then(({ data }) => setRestaurants(data)).catch((e) => setError(e.message));
    }
  }, [activeTab]);

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <h1 className="text-2xl font-bold text-gray-800 mb-4">Admin Dashboard</h1>

      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
          <StatCard label="Active orders" value={stats.activeOrders} />
          <StatCard label="Delivered" value={stats.deliveredOrders} />
          <StatCard label="Waiting on optimizer" value={stats.unassignedReadyOrders} />
          <StatCard label="Available partners" value={`${stats.availablePartners} / ${stats.totalPartners}`} />
          <StatCard label="Restaurants" value={stats.totalRestaurants} />
          <StatCard label="Customers" value={stats.totalCustomers} />
          <StatCard
            label="Avg assignment score"
            value={stats.avgAssignmentScore != null ? stats.avgAssignmentScore.toFixed(2) : "—"}
          />
          <StatCard
            label="Avg route distance"
            value={stats.avgRouteDistanceKm != null ? `${stats.avgRouteDistanceKm.toFixed(1)} km` : "—"}
          />
        </div>
      )}

      <div className="flex gap-2 mb-4">
        {TABS.map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 rounded-md text-sm font-medium transition ${
              activeTab === tab ? "bg-brand-500 text-white" : "bg-white text-gray-600 hover:bg-gray-100"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {error && <p className="text-red-600 mb-3">{error}</p>}

      {activeTab === "Orders" && (
        <div className="bg-white rounded-lg shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 text-gray-600 text-left">
              <tr>
                <th className="p-3">Order</th>
                <th className="p-3">Restaurant</th>
                <th className="p-3">Customer</th>
                <th className="p-3">Status</th>
                <th className="p-3">Partner</th>
                <th className="p-3">Score</th>
                <th className="p-3">Distance</th>
                <th className="p-3">Route source</th>
                <th className="p-3">Payment</th>
                <th className="p-3">Total</th>
              </tr>
            </thead>
            <tbody>
              {orders.map((o) => (
                <tr key={o._id} className="border-t">
                  <td className="p-3 font-mono text-xs">{o._id.slice(-6)}</td>
                  <td className="p-3">{o.restaurant?.name}</td>
                  <td className="p-3">{o.customer?.name}</td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs">{o.status}</span>
                  </td>
                  <td className="p-3">{o.deliveryPartner?.user?.name || "—"}</td>
                  <td className="p-3">{o.assignmentScore ?? "—"}</td>
                  <td className="p-3">{o.routeDistanceKm ? `${o.routeDistanceKm} km` : "—"}</td>
                  <td className="p-3">
                    {o.routeSource ? (
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          o.routeSource === "google_maps" ? "bg-blue-100 text-blue-700" : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {o.routeSource === "google_maps" ? "Road route" : "Straight-line"}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="p-3">
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full ${
                        o.paymentStatus === "paid"
                          ? "bg-green-100 text-green-700"
                          : o.paymentStatus === "failed"
                          ? "bg-red-100 text-red-700"
                          : "bg-gray-100 text-gray-500"
                      }`}
                    >
                      {o.paymentMethod === "cod" ? "COD" : "Online"} · {o.paymentStatus}
                    </span>
                  </td>
                  <td className="p-3">₹{o.total}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {orders.length === 0 && <p className="p-4 text-gray-500">No orders yet.</p>}
        </div>
      )}

      {activeTab === "Partners" && (
        <div className="bg-white rounded-lg shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 text-gray-600 text-left">
              <tr>
                <th className="p-3">Name</th>
                <th className="p-3">Status</th>
                <th className="p-3">Active orders</th>
                <th className="p-3">Capacity</th>
                <th className="p-3">Vehicle</th>
                <th className="p-3">Avg speed</th>
              </tr>
            </thead>
            <tbody>
              {partners.map((p) => (
                <tr key={p._id} className="border-t">
                  <td className="p-3">{p.user?.name}</td>
                  <td className="p-3">
                    <span className="px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 text-xs">{p.status}</span>
                  </td>
                  <td className="p-3">{p.activeOrders?.length ?? 0}</td>
                  <td className="p-3">{p.maxActiveOrders}</td>
                  <td className="p-3">{p.vehicleType}</td>
                  <td className="p-3">{p.avgSpeedKmph} km/h</td>
                </tr>
              ))}
            </tbody>
          </table>
          {partners.length === 0 && <p className="p-4 text-gray-500">No partners yet.</p>}
        </div>
      )}

      {activeTab === "Restaurants" && (
        <div className="bg-white rounded-lg shadow-sm overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-gray-100 text-gray-600 text-left">
              <tr>
                <th className="p-3">Name</th>
                <th className="p-3">Owner</th>
                <th className="p-3">Cuisine</th>
                <th className="p-3">Open</th>
                <th className="p-3">Avg prep time</th>
              </tr>
            </thead>
            <tbody>
              {restaurants.map((r) => (
                <tr key={r._id} className="border-t">
                  <td className="p-3">{r.name}</td>
                  <td className="p-3">{r.owner?.name}</td>
                  <td className="p-3">{r.cuisine?.join(", ")}</td>
                  <td className="p-3">{r.isOpen ? "Yes" : "No"}</td>
                  <td className="p-3">{r.avgPrepTimeMinutes} min</td>
                </tr>
              ))}
            </tbody>
          </table>
          {restaurants.length === 0 && <p className="p-4 text-gray-500">No restaurants yet.</p>}
        </div>
      )}
    </div>
  );
}
