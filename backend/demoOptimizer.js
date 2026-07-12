import dotenv from "dotenv";
import mongoose from "mongoose";
import connectDB from "./config/db.js";

import User from "./models/User.js";
import Restaurant from "./models/Restaurant.js";
import DeliveryPartner from "./models/DeliveryPartner.js";
import Order from "./models/Order.js";
import { assignAllReadyOrdersForRestaurant } from "./services/optimizationEngine.js";

dotenv.config();

const line = () => console.log("-".repeat(60));

const run = async () => {
  await connectDB();

  const customer = await User.findOne({ role: "customer" });
  const spiceVilla = await Restaurant.findOne({ name: "Spice Villa" });

  if (!customer || !spiceVilla) {
    console.error('No seed data found. Run "npm run seed" first.');
    process.exit(1);
  }

  console.log(`Using restaurant: ${spiceVilla.name} at ${spiceVilla.location.coordinates}`);
  line();

  // Two customers ordering from Spice Villa, at two different delivery addresses,
  // both already at "ready_for_pickup" — simulating the moment the optimizer kicks in.
  const butterChicken = spiceVilla.menu.find((m) => m.name === "Butter Chicken");
  const naan = spiceVilla.menu.find((m) => m.name === "Garlic Naan");

  const makeOrder = (deliveryOffset) =>
    Order.create({
      customer: customer._id,
      restaurant: spiceVilla._id,
      items: [
        { menuItem: butterChicken._id, name: butterChicken.name, price: butterChicken.price, quantity: 1 },
        { menuItem: naan._id, name: naan.name, price: naan.price, quantity: 2 },
      ],
      itemsTotal: butterChicken.price + naan.price * 2,
      deliveryFee: 30,
      total: butterChicken.price + naan.price * 2 + 30,
      deliveryAddress: {
        fullAddress: "Sample delivery address",
        location: {
          type: "Point",
          coordinates: [
            spiceVilla.location.coordinates[0] + deliveryOffset[0],
            spiceVilla.location.coordinates[1] + deliveryOffset[1],
          ],
        },
      },
      status: "ready_for_pickup",
    });

  console.log("Placing 2 orders at the same restaurant, both ready for pickup...");
  const orderA = await makeOrder([0.01, 0.01]); // ~1.5km from restaurant
  const orderB = await makeOrder([0.012, 0.008]); // nearby delivery address — batching candidate
  line();

  console.log(`Order A: ${orderA._id}`);
  console.log(`Order B: ${orderB._id}`);
  line();

  console.log("Running the optimizer for this restaurant...\n");
  const results = await assignAllReadyOrdersForRestaurant(spiceVilla._id);

  for (const result of results) {
    if (!result.success) {
      console.log(`Order ${result.orderId}: FAILED — ${result.message}`);
      continue;
    }
    const partnerUser = await User.findById(result.partner.user);
    console.log(`Order ${result.orderId}:`);
    console.log(`  -> Assigned to ${partnerUser.name} (partner ${result.partner._id})`);
    console.log(`  -> Pickup ETA: ${result.pickupEtaMinutes} min, Delivery ETA: ${result.deliveryEtaMinutes} min`);
    console.log(`  -> Route distance: ${result.order.routeDistanceKm} km, score: ${result.order.assignmentScore}`);
    console.log(`  -> Route source: ${result.order.routeSource}${result.order.deliveryRoutePolyline ? " (polyline captured)" : ""}`);
    console.log();
  }

  line();
  const sameFirst = results[0]?.partner?._id?.toString();
  const sameSecond = results[1]?.partner?._id?.toString();
  if (sameFirst && sameFirst === sameSecond) {
    console.log("✅ Both orders were batched onto the SAME partner (batching bonus worked as intended).");
  } else {
    console.log(
      "ℹ️  Orders went to different partners — this can happen if the nearest partner hit capacity, or if another partner was simply closer. Try adjusting WEIGHTS.sameRestaurantBatchBonus in optimizationEngine.js to see the effect."
    );
  }

  await mongoose.connection.close();
  process.exit(0);
};

run().catch((err) => {
  console.error("Demo failed:", err);
  process.exit(1);
});
