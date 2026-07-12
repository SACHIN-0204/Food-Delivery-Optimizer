import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api.js";

const VEHICLES = ["bike", "scooter", "car", "bicycle"];

export default function PartnerOnboarding() {
  const navigate = useNavigate();

  const [form, setForm] = useState({ vehicleType: "bike", maxActiveOrders: 3, avgSpeedKmph: 25 });
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const getCurrentCoordinates = () =>
    new Promise((resolve) => {
      if (!navigator.geolocation) {
        resolve([75.8577, 22.7196]); // fallback: Indore
        return;
      }
      navigator.geolocation.getCurrentPosition(
        (pos) => resolve([pos.coords.longitude, pos.coords.latitude]),
        () => resolve([75.8577, 22.7196]),
        { timeout: 5000 }
      );
    });

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const coordinates = await getCurrentCoordinates();
      await api.post("/delivery/partners", {
        vehicleType: form.vehicleType,
        maxActiveOrders: Number(form.maxActiveOrders) || 3,
        avgSpeedKmph: Number(form.avgSpeedKmph) || 25,
        coordinates,
      });
      navigate("/partner/dashboard");
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4">
      <form onSubmit={handleSubmit} className="bg-white shadow-sm rounded-lg p-6 w-full max-w-sm space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">Set up your delivery profile</h1>
          <p className="text-sm text-gray-500">We'll use your current location to get you started.</p>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">Vehicle</label>
          <select
            value={form.vehicleType}
            onChange={update("vehicleType")}
            className="mt-1 w-full border rounded-md px-3 py-2 text-sm bg-white capitalize"
          >
            {VEHICLES.map((v) => (
              <option key={v} value={v}>
                {v}
              </option>
            ))}
          </select>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">Max orders you'll carry at once</label>
          <input
            type="number"
            min="1"
            max="10"
            value={form.maxActiveOrders}
            onChange={update("maxActiveOrders")}
            className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">Average speed (km/h)</label>
          <input
            type="number"
            min="1"
            value={form.avgSpeedKmph}
            onChange={update("avgSpeedKmph")}
            className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
          />
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-2.5 rounded-lg bg-brand-500 text-white hover:bg-brand-600 transition disabled:opacity-50"
        >
          {submitting ? "Setting up…" : "Start delivering"}
        </button>
      </form>
    </div>
  );
}
