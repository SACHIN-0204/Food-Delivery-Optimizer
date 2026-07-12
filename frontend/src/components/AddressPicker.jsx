import { useState } from "react";
import { MapContainer, TileLayer, Marker, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

const pinIcon = new L.Icon({
  iconUrl: "https://raw.githubusercontent.com/pointhi/leaflet-color-markers/master/img/marker-icon-green.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
  iconSize: [25, 41],
  iconAnchor: [12, 41],
});

function ClickHandler({ onPick }) {
  useMapEvents({
    click(e) {
      onPick([e.latlng.lat, e.latlng.lng]);
    },
  });
  return null;
}

/**
 * Lets the user click anywhere on the map to drop a pin for their delivery address.
 * Calls onChange with GeoJSON-style [lng, lat] (matching what the backend expects),
 * while keeping [lat, lng] internally since that's what Leaflet uses.
 */
export default function AddressPicker({ initialLatLng = [22.7196, 75.8577], onChange }) {
  // Default center: Indore, India — swap for the user's actual geolocation if available
  const [position, setPosition] = useState(initialLatLng);

  const handlePick = (latlng) => {
    setPosition(latlng);
    onChange?.([latlng[1], latlng[0]]); // -> [lng, lat] for the backend
  };

  return (
    <div>
      <div className="h-64 w-full rounded-lg overflow-hidden border">
        <MapContainer center={position} zoom={14} className="h-full w-full">
          <TileLayer
            attribution='&copy; OpenStreetMap contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <Marker position={position} icon={pinIcon} />
          <ClickHandler onPick={handlePick} />
        </MapContainer>
      </div>
      <p className="text-xs text-gray-500 mt-1">Tap the map to set your delivery location.</p>
    </div>
  );
}
