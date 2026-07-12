import dotenv from "dotenv";
import mongoose from "mongoose";
import connectDB from "./config/db.js";

import User from "./models/User.js";
import Restaurant from "./models/Restaurant.js";
import Order from "./models/Order.js";
import { solveBatchForRestaurant } from "./services/vrpBatchSolver.js";

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

  console.log(`Using restaurant: ${spiceVilla.name}`);
  line();

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

  // Two orders close together (should cluster into one multi-stop trip) plus
  // one far away (should end up in its own cluster, its own partner).
  console.log("Placing 3 orders: two nearby (batching candidates), one far away...");
  const orderA = await makeOrder([0.01, 0.01]);
  const orderB = await makeOrder([0.011, 0.009]); // very close to A
  const orderC = await makeOrder([-0.03, -0.025]); // far from A/B
  line();
  console.log(`Order A: ${orderA._id}`);
  console.log(`Order B: ${orderB._id} (near A)`);
  console.log(`Order C: ${orderC._id} (far from A/B)`);
  line();

  console.log("Running the VRP batch solver for this restaurant...\n");
  const { results, clusterCount, message } = await solveBatchForRestaurant(spiceVilla._id);

  if (message) {
    console.log(message);
  }

  console.log(`Formed ${clusterCount} cluster(s) from 3 ready orders.\n`);

  for (const result of results) {
    if (!result.success) {
      console.log(`Order ${result.orderId}: FAILED — ${result.message}`);
      continue;
    }
    console.log(
      `Order ${result.orderId}: stop ${result.stopNumber}/${result.totalStops} on this trip, ETA ${result.etaMinutes} min, route source: ${result.order.routeSource}`
    );
  }

  line();
  console.log(
    "Look for two of the three orders sharing the same partner and appearing as stop 1/2 and 2/2 of the same trip — that's the VRP solver batching them into one multi-stop route, instead of dispatching two separate partners."
  );

  await mongoose.connection.close();
  process.exit(0);
};

run().catch((err) => {
  console.error("VRP demo failed:", err);
  process.exit(1);
});
