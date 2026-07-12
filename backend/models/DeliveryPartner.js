import mongoose from "mongoose";

const deliveryPartnerSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, unique: true },
    vehicleType: { type: String, enum: ["bike", "scooter", "car", "bicycle"], default: "bike" },
    currentLocation: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], default: [0, 0] }, // [lng, lat]
    },
    status: {
      type: String,
      enum: ["offline", "available", "assigned", "on_delivery"],
      default: "offline",
    },
    // capacity: how many active orders this partner can carry at once (for batching)
    maxActiveOrders: { type: Number, default: 3 },
    activeOrders: [{ type: mongoose.Schema.Types.ObjectId, ref: "Order" }],
    avgSpeedKmph: { type: Number, default: 25 }, // used to estimate ETA
    rating: { type: Number, default: 0 },
  },
  { timestamps: true }
);

deliveryPartnerSchema.index({ currentLocation: "2dsphere" });

const DeliveryPartner = mongoose.model("DeliveryPartner", deliveryPartnerSchema);
export default DeliveryPartner;
