import mongoose from "mongoose";

const orderItemSchema = new mongoose.Schema(
  {
    menuItem: { type: mongoose.Schema.Types.ObjectId, required: true },
    name: { type: String, required: true },
    price: { type: Number, required: true },
    quantity: { type: Number, required: true, min: 1 },
  },
  { _id: false }
);

const orderSchema = new mongoose.Schema(
  {
    customer: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    restaurant: { type: mongoose.Schema.Types.ObjectId, ref: "Restaurant", required: true },
    deliveryPartner: { type: mongoose.Schema.Types.ObjectId, ref: "DeliveryPartner", default: null },

    items: [orderItemSchema],
    itemsTotal: { type: Number, required: true },
    deliveryFee: { type: Number, default: 0 },
    total: { type: Number, required: true },

    deliveryAddress: {
      fullAddress: { type: String, required: true },
      location: {
        type: { type: String, enum: ["Point"], default: "Point" },
        coordinates: { type: [Number], required: true }, // [lng, lat]
      },
    },

    status: {
      type: String,
      enum: [
        "placed",
        "confirmed",
        "preparing",
        "ready_for_pickup",
        "assigned",
        "picked_up",
        "on_the_way",
        "delivered",
        "cancelled",
      ],
      default: "placed",
    },

    // Optimizer-relevant fields
    estimatedPrepReadyAt: { type: Date }, // when food will be ready
    estimatedDeliveryAt: { type: Date }, // ETA to customer
    routeDistanceKm: { type: Number }, // computed route distance for this leg
    assignmentScore: { type: Number }, // score used when partner was assigned (debugging/tuning)
    deliveryRoutePolyline: { type: String, default: null }, // encoded polyline (restaurant -> customer), if Google Maps is configured
    routeSource: { type: String, enum: ["google_maps", "haversine"], default: "haversine" },

    paymentMethod: { type: String, enum: ["razorpay", "cod"], default: "cod" },
    paymentStatus: { type: String, enum: ["pending", "paid", "failed", "refunded"], default: "pending" },
    razorpayOrderId: { type: String, default: null },
    razorpayPaymentId: { type: String, default: null },

    placedAt: { type: Date, default: Date.now },
    deliveredAt: { type: Date },
  },
  { timestamps: true }
);

orderSchema.index({ status: 1 });
orderSchema.index({ "deliveryAddress.location": "2dsphere" });

const Order = mongoose.model("Order", orderSchema);
export default Order;
