import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import api from "../services/api.js";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const data = await login(email, password);
      await redirectByRole(data.role, navigate);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <form onSubmit={handleSubmit} className="bg-white shadow-sm rounded-lg p-6 w-full max-w-sm space-y-4">
        <h1 className="text-xl font-semibold text-gray-800">Log in</h1>

        <div>
          <label className="text-sm font-medium text-gray-700">Email</label>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">Password</label>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
            placeholder="••••••••"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-2.5 rounded-lg bg-brand-500 text-white hover:bg-brand-600 transition disabled:opacity-50"
        >
          {submitting ? "Logging in…" : "Log in"}
        </button>

        <p className="text-sm text-gray-500 text-center">
          No account?{" "}
          <Link to="/register" className="text-brand-600 font-medium">
            Register
          </Link>
        </p>

        <p className="text-xs text-gray-400 text-center">
          Seeded test logins: customer@example.com · spicevilla@example.com · partner1@example.com (password123)
        </p>
      </form>
    </div>
  );
}

// Sends each role to the page that's actually useful for them right after login.
async function redirectByRole(role, navigate) {
  if (role === "admin") {
    navigate("/admin");
    return;
  }
  if (role === "restaurant") {
    try {
      const { data: myRestaurants } = await api.get("/restaurants/mine/list");
      if (myRestaurants.length > 0) {
        navigate(`/restaurant/${myRestaurants[0]._id}/dashboard`);
        return;
      }
      navigate("/restaurant/onboarding");
      return;
    } catch {
      // fall through to onboarding if this lookup fails for any reason
    }
    navigate("/restaurant/onboarding");
    return;
  }
  if (role === "delivery_partner") {
    try {
      await api.get("/delivery/me");
      navigate("/partner/dashboard");
    } catch {
      navigate("/partner/onboarding");
    }
    return;
  }
  // customers land on the browse page
  navigate("/restaurants");
}
