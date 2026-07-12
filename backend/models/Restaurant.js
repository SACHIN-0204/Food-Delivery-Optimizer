import mongoose from "mongoose";

const menuItemSchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    price: { type: Number, required: true },
    description: { type: String },
    category: { type: String },
    isAvailable: { type: Boolean, default: true },
    prepTimeMinutes: { type: Number, default: 15 }, // used by optimizer
  },
  { timestamps: true }
);

const restaurantSchema = new mongoose.Schema(
  {
    owner: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    name: { type: String, required: true, trim: true },
    description: { type: String },
    cuisine: [{ type: String }],
    address: { type: String, required: true },
    location: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], required: true }, // [lng, lat]
    },
    menu: [menuItemSchema],
    avgPrepTimeMinutes: { type: Number, default: 20 }, // used by optimizer
    rating: { type: Number, default: 0 },
    isOpen: { type: Boolean, default: true },
  },
  { timestamps: true }
);

restaurantSchema.index({ location: "2dsphere" });

const Restaurant = mongoose.model("Restaurant", restaurantSchema);
export default Restaurant;
