import { Routes, Route, Link, useParams, useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import OrderTracking from "./pages/OrderTracking.jsx";
import RestaurantDashboard from "./pages/RestaurantDashboard.jsx";
import RestaurantBrowse from "./pages/RestaurantBrowse.jsx";
import RestaurantMenu from "./pages/RestaurantMenu.jsx";
import AdminDashboard from "./pages/AdminDashboard.jsx";
import Login from "./pages/Login.jsx";
import Register from "./pages/Register.jsx";
import RestaurantOnboarding from "./pages/RestaurantOnboarding.jsx";
import PartnerOnboarding from "./pages/PartnerOnboarding.jsx";
import PartnerDashboard from "./pages/PartnerDashboard.jsx";
import { useAuth } from "./context/AuthContext.jsx";
import { isPushSupported, isPushEnabled, enablePushNotifications, disablePushNotifications } from "./utils/push.js";

function NotificationToggle() {
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState(null);

  useEffect(() => {
    if (isPushSupported()) isPushEnabled().then(setEnabled);
  }, []);

  if (!isPushSupported()) return null;

  const toggle = async () => {
    setBusy(true);
    setMessage(null);
    try {
      if (enabled) {
        await disablePushNotifications();
        setEnabled(false);
      } else {
        const result = await enablePushNotifications();
        if (result.ok) {
          setEnabled(true);
        } else {
          setMessage(result.reason);
        }
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="relative">
      <button
        onClick={toggle}
        disabled={busy}
        title={enabled ? "Notifications on — click to turn off" : "Turn on order notifications"}
        className={`text-xs px-2 py-1 rounded-md transition ${
          enabled ? "bg-brand-50 text-brand-600" : "text-gray-500 hover:text-brand-600"
        }`}
      >
        {enabled ? "🔔 On" : "🔕 Off"}
      </button>
      {message && (
        <div className="absolute right-0 mt-1 w-56 text-xs bg-white border rounded-md shadow-sm p-2 text-gray-600 z-10">
          {message}
        </div>
      )}
    </div>
  );
}

function NavBar() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/");
  };

  return (
    <nav className="bg-white border-b px-4 py-3 flex items-center justify-between">
      <Link to="/" className="font-semibold text-brand-600">
        Food Delivery Optimizer
      </Link>
      <div className="flex items-center gap-3 text-sm">
        {user ? (
          <>
            <NotificationToggle />
            <span className="text-gray-500">
              {user.name} <span className="text-gray-400">({user.role})</span>
            </span>
            <button onClick={handleLogout} className="text-brand-600 font-medium hover:underline">
              Log out
            </button>
          </>
        ) : (
          <>
            <Link to="/login" className="text-gray-600 hover:text-brand-600">
              Log in
            </Link>
            <Link to="/register" className="text-brand-600 font-medium hover:underline">
              Register
            </Link>
          </>
        )}
      </div>
    </nav>
  );
}

function Home() {
  return (
    <div className="min-h-[80vh] bg-gray-50 flex flex-col items-center justify-center px-4">
      <h1 className="text-3xl font-bold text-brand-600 mb-2">
        Food Delivery Optimizer
      </h1>
      <p className="text-gray-500 mb-6">
        Browse restaurants, place an order, and track it live on the map.
      </p>
      <Link
        to="/restaurants"
        className="px-4 py-2 rounded-lg bg-brand-500 text-white hover:bg-brand-600 transition"
      >
        Browse restaurants
      </Link>
    </div>
  );
}

// Thin wrapper so RestaurantDashboard (which takes a prop) can be reached via a URL param
function RestaurantDashboardRoute() {
  const { restaurantId } = useParams();
  return <RestaurantDashboard restaurantId={restaurantId} />;
}

export default function App() {
  return (
    <>
      <NavBar />
      <Routes>
        <Route path="/" element={<Home />} />
        <Route path="/login" element={<Login />} />
        <Route path="/register" element={<Register />} />
        <Route path="/restaurant/onboarding" element={<RestaurantOnboarding />} />
        <Route path="/partner/onboarding" element={<PartnerOnboarding />} />
        <Route path="/partner/dashboard" element={<PartnerDashboard />} />
        <Route path="/orders/:orderId" element={<OrderTracking />} />
        <Route path="/restaurants" element={<RestaurantBrowse />} />
        <Route path="/restaurants/:restaurantId" element={<RestaurantMenu />} />
        <Route path="/restaurant/:restaurantId/dashboard" element={<RestaurantDashboardRoute />} />
        <Route path="/admin" element={<AdminDashboard />} />
      </Routes>
    </>
  );
}
