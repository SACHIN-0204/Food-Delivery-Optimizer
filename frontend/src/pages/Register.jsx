import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

const ROLES = [
  { value: "customer", label: "Customer — order food" },
  { value: "restaurant", label: "Restaurant — sell food" },
  { value: "delivery_partner", label: "Delivery partner — deliver orders" },
];

export default function Register() {
  const { register } = useAuth();
  const navigate = useNavigate();

  const [form, setForm] = useState({ name: "", email: "", phone: "", password: "", role: "customer" });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (form.password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }

    setSubmitting(true);
    try {
      const data = await register(form);
      if (data.role === "restaurant") {
        navigate("/restaurant/onboarding");
      } else if (data.role === "delivery_partner") {
        navigate("/partner/onboarding");
      } else if (data.role === "admin") {
        navigate("/admin");
      } else {
        navigate("/restaurants");
      }
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <form onSubmit={handleSubmit} className="bg-white shadow-sm rounded-lg p-6 w-full max-w-sm space-y-4">
        <h1 className="text-xl font-semibold text-gray-800">Create an account</h1>

        <div>
          <label className="text-sm font-medium text-gray-700">Full name</label>
          <input
            required
            value={form.name}
            onChange={update("name")}
            className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
            placeholder="Asha Verma"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">Email</label>
          <input
            type="email"
            required
            value={form.email}
            onChange={update("email")}
            className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
            placeholder="you@example.com"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">Phone</label>
          <input
            required
            value={form.phone}
            onChange={update("phone")}
            className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
            placeholder="9990000000"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">Password</label>
          <input
            type="password"
            required
            value={form.password}
            onChange={update("password")}
            className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
            placeholder="At least 6 characters"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">I am a…</label>
          <select
            value={form.role}
            onChange={update("role")}
            className="mt-1 w-full border rounded-md px-3 py-2 text-sm bg-white"
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-2.5 rounded-lg bg-brand-500 text-white hover:bg-brand-600 transition disabled:opacity-50"
        >
          {submitting ? "Creating account…" : "Create account"}
        </button>

        <p className="text-sm text-gray-500 text-center">
          Already have an account?{" "}
          <Link to="/login" className="text-brand-600 font-medium">
            Log in
          </Link>
        </p>
      </form>
    </div>
  );
}
