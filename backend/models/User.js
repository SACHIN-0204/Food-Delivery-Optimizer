import mongoose from "mongoose";

const addressSchema = new mongoose.Schema(
  {
    label: { type: String, default: "Home" },
    fullAddress: { type: String, required: true },
    location: {
      type: { type: String, enum: ["Point"], default: "Point" },
      coordinates: { type: [Number], required: true }, // [lng, lat]
    },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 6 },
    phone: { type: String, required: true },
    role: {
      type: String,
      enum: ["customer", "restaurant", "delivery_partner", "admin"],
      default: "customer",
    },
    addresses: [addressSchema],
  },
  { timestamps: true }
);

const User = mongoose.model("User", userSchema);
export default User;
