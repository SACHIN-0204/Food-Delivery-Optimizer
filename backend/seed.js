import dotenv from "dotenv";
import bcrypt from "bcryptjs";
import connectDB from "./config/db.js";
import mongoose from "mongoose";

import User from "./models/User.js";
import Restaurant from "./models/Restaurant.js";
import DeliveryPartner from "./models/DeliveryPartner.js";
import Order from "./models/Order.js";

dotenv.config();

// Center point for all sample data: Indore, India. Offsets below are small
// enough (~0.01 deg ≈ 1km) to keep everything within the optimizer's 7km radius.
const CENTER = [75.8577, 22.7196]; // [lng, lat]
const offset = (lng, lat) => [CENTER[0] + lng, CENTER[1] + lat];

const hash = async (plain) => bcrypt.hash(plain, await bcrypt.genSalt(10));

const run = async () => {
  await connectDB();

  console.log("Clearing existing sample collections...");
  await Promise.all([
    User.deleteMany({}),
    Restaurant.deleteMany({}),
    DeliveryPartner.deleteMany({}),
    Order.deleteMany({}),
  ]);

  const password = await hash("password123");

  console.log("Creating users...");
  const customer = await User.create({
    name: "Asha Verma",
    email: "customer@example.com",
    password,
    phone: "9990000001",
    role: "customer",
  });

  const restaurantOwners = await User.insertMany([
    { name: "Ramesh (Spice Villa)", email: "spicevilla@example.com", password, phone: "9990000002", role: "restaurant" },
    { name: "Neha (Green Bowl)", email: "greenbowl@example.com", password, phone: "9990000003", role: "restaurant" },
  ]);

  const partnerUsers = await User.insertMany(
    Array.from({ length: 5 }, (_, i) => ({
      name: `Partner ${i + 1}`,
      email: `partner${i + 1}@example.com`,
      password,
      phone: `999000001${i}`,
      role: "delivery_partner",
    }))
  );

  console.log("Creating restaurants with menus...");
  const spiceVilla = await Restaurant.create({
    owner: restaurantOwners[0]._id,
    name: "Spice Villa",
    description: "North Indian comfort food",
    cuisine: ["North Indian", "Mughlai"],
    address: "12 MG Road, Indore",
    location: { type: "Point", coordinates: offset(0.002, 0.001) },
    avgPrepTimeMinutes: 18,
    isOpen: true,
    menu: [
      { name: "Butter Chicken", price: 280, category: "Main", prepTimeMinutes: 20 },
      { name: "Paneer Tikka", price: 220, category: "Starter", prepTimeMinutes: 15 },
      { name: "Garlic Naan", price: 50, category: "Bread", prepTimeMinutes: 8 },
      { name: "Dal Makhani", price: 190, category: "Main", prepTimeMinutes: 15 },
    ],
  });

  const greenBowl = await Restaurant.create({
    owner: restaurantOwners[1]._id,
    name: "Green Bowl",
    description: "Healthy salads and bowls",
    cuisine: ["Healthy", "Continental"],
    address: "45 Vijay Nagar, Indore",
    location: { type: "Point", coordinates: offset(-0.015, 0.01) },
    avgPrepTimeMinutes: 10,
    isOpen: true,
    menu: [
      { name: "Quinoa Salad Bowl", price: 240, category: "Bowl", prepTimeMinutes: 10 },
      { name: "Grilled Chicken Wrap", price: 210, category: "Wrap", prepTimeMinutes: 12 },
      { name: "Smoothie", price: 130, category: "Drink", prepTimeMinutes: 5 },
    ],
  });

  console.log("Creating delivery partners scattered nearby...");
  const partnerOffsets = [
    [0.001, 0.001], // very close to Spice Villa
    [0.003, -0.002], // close-ish to Spice Villa
    [-0.012, 0.008], // close to Green Bowl
    [0.02, 0.02], // farther away from both
    [-0.03, -0.01], // farthest, outside the 7km radius from most points
  ];

  const partners = await DeliveryPartner.insertMany(
    partnerUsers.map((user, i) => ({
      user: user._id,
      vehicleType: "bike",
      currentLocation: { type: "Point", coordinates: offset(...partnerOffsets[i]) },
      status: "available",
      maxActiveOrders: 3,
      avgSpeedKmph: 25,
    }))
  );

  console.log("\n=== Seed complete ===");
  console.log("Customer login:      customer@example.com / password123");
  console.log("Restaurant logins:   spicevilla@example.com, greenbowl@example.com / password123");
  console.log("Partner logins:      partner1@example.com ... partner5@example.com / password123");
  console.log("\nRestaurant IDs:");
  console.log("  Spice Villa:", spiceVilla._id.toString());
  console.log("  Green Bowl: ", greenBowl._id.toString());
  console.log("\nMenu item IDs (Spice Villa):");
  spiceVilla.menu.forEach((item) => console.log(`  ${item.name}: ${item._id}`));
  console.log("\nDelivery partner IDs:");
  partners.forEach((p, i) => console.log(`  Partner ${i + 1}: ${p._id.toString()}`));

  console.log("\nRun `npm run demo` to see the optimization engine assign these partners to sample orders.");

  await mongoose.connection.close();
  process.exit(0);
};

run().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
