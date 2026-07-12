import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../services/api.js";
import AddressPicker from "../components/AddressPicker.jsx";

export default function RestaurantOnboarding() {
  const navigate = useNavigate();

  const [form, setForm] = useState({ name: "", description: "", cuisine: "", address: "", avgPrepTimeMinutes: 20 });
  const [coordinates, setCoordinates] = useState(null);
  const [error, setError] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  const update = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!coordinates) {
      setError("Pin your restaurant's location on the map.");
      return;
    }

    setSubmitting(true);
    try {
      const { data: restaurant } = await api.post("/restaurants", {
        name: form.name,
        description: form.description,
        cuisine: form.cuisine
          .split(",")
          .map((c) => c.trim())
          .filter(Boolean),
        address: form.address,
        location: { type: "Point", coordinates },
        avgPrepTimeMinutes: Number(form.avgPrepTimeMinutes) || 20,
      });
      navigate(`/restaurant/${restaurant._id}/dashboard`);
    } catch (err) {
      setError(err.response?.data?.message || err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center px-4 py-8">
      <form onSubmit={handleSubmit} className="bg-white shadow-sm rounded-lg p-6 w-full max-w-md space-y-4">
        <div>
          <h1 className="text-xl font-semibold text-gray-800">Set up your restaurant</h1>
          <p className="text-sm text-gray-500">This is what customers will see when they search nearby.</p>
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">Restaurant name</label>
          <input
            required
            value={form.name}
            onChange={update("name")}
            className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
            placeholder="Spice Villa"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">Description</label>
          <textarea
            value={form.description}
            onChange={update("description")}
            className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
            rows={2}
            placeholder="North Indian comfort food"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">Cuisine (comma separated)</label>
          <input
            value={form.cuisine}
            onChange={update("cuisine")}
            className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
            placeholder="North Indian, Mughlai"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">Street address</label>
          <input
            required
            value={form.address}
            onChange={update("address")}
            className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
            placeholder="12 MG Road, Indore"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">Average prep time (minutes)</label>
          <input
            type="number"
            min="1"
            value={form.avgPrepTimeMinutes}
            onChange={update("avgPrepTimeMinutes")}
            className="mt-1 w-full border rounded-md px-3 py-2 text-sm"
          />
        </div>

        <div>
          <label className="text-sm font-medium text-gray-700">Location</label>
          <div className="mt-1">
            <AddressPicker onChange={setCoordinates} />
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <button
          type="submit"
          disabled={submitting}
          className="w-full py-2.5 rounded-lg bg-brand-500 text-white hover:bg-brand-600 transition disabled:opacity-50"
        >
          {submitting ? "Creating…" : "Create restaurant"}
        </button>

        <p className="text-xs text-gray-400 text-center">
          You can add menu items from your dashboard right after this.
        </p>
      </form>
    </div>
  );
}
