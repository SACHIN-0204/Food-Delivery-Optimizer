# Food Delivery Optimizer

A full-stack (MERN) food delivery platform with an algorithmic dispatch engine that assigns and batches orders to delivery partners in real time, instead of simple first-come-first-served assignment.

## Why this project

Most delivery-app demos hardcode "assign nearest partner." This one implements two real dispatch strategies:

- **Single-order assignment** — scores every nearby candidate partner on distance, current load, and whether they already have a pickup at the same restaurant, then picks the best match.
- **Batch (VRP-style) assignment** — clusters nearby ready orders using greedy nearest-neighbor clustering, then brute-forces the optimal visiting order within each small cluster (bounded permutation search, capped at 3 stops so it never blows up combinatorially).

Both paths fall back gracefully: real road distance via the Google Maps Distance Matrix API when configured, Haversine great-circle distance otherwise — so the app runs fully offline/without API keys for local development.

## Features

- **Real-time order tracking** for customers via Socket.io — live partner location and status updates pushed to the client, no polling
- **Role-based dashboards** for restaurants, delivery partners, and admins, plus customer-facing restaurant browsing and ordering
- **Geospatial partner matching** using MongoDB 2dsphere indexes for efficient `$near` queries over partner locations
- **Payments** via Razorpay, including signature-verified webhooks (raw body parsing kept separate from the JSON body parser so signatures validate correctly)
- **Push notifications** via the Web Push API (VAPID) for order status changes
- **JWT authentication** with role-based access control across all API routes
- **Hardened API**: Helmet security headers, rate limiting, and request size limits on every route

## Tech Stack

| Layer | Technology |
|---|---|
| Frontend | React 18, Vite, Tailwind CSS, React Router, Leaflet / React-Leaflet (maps) |
| Backend | Node.js, Express, Socket.io |
| Database | MongoDB (Mongoose), 2dsphere geospatial indexing |
| Auth | JWT, bcrypt |
| Payments | Razorpay (checkout + webhooks) |
| Notifications | Web Push (VAPID) |
| Infra | Docker, Docker Compose |

## Architecture

```
├── backend/
│   ├── controllers/     # Route handlers (auth, orders, payments, delivery, admin...)
│   ├── models/          # Mongoose schemas (User, Order, Restaurant, DeliveryPartner...)
│   ├── routes/          # Express route definitions
│   ├── services/
│   │   ├── optimizationEngine.js   # Single-order partner scoring & assignment
│   │   └── vrpBatchSolver.js       # Order clustering + permutation-based route solving
│   ├── sockets/         # Socket.io event handlers
│   ├── middleware/      # Auth, validation, rate limiting, error handling
│   └── server.js
└── frontend/
    ├── src/pages/       # Role-based views (Restaurant, Partner, Admin, Order Tracking...)
    ├── src/services/    # API client, socket client
    ├── src/hooks/       # e.g. useOrderTracking
    └── src/context/     # Auth context
```

## Getting Started

### Prerequisites
- Node.js 18+
- Docker & Docker Compose (recommended, spins up MongoDB automatically)

### Run with Docker (recommended)

```bash
git clone https://github.com/SACHIN-0204/Food-Delivery-Optimizer.git
cd Food-Delivery-Optimizer
docker-compose up --build
```

This starts MongoDB, the backend API (`localhost:5000`), and the frontend (`localhost:5173`).

### Run manually

```bash
# Backend
cd backend
npm install
npm run dev          # starts with nodemon on localhost:5000

# Frontend (in a separate terminal)
cd frontend
npm install
npm run dev           # starts Vite dev server on localhost:5173
```

### Environment variables

The backend reads the following (see `docker-compose.yml` for local defaults):

| Variable | Purpose |
|---|---|
| `MONGO_URI` | MongoDB connection string |
| `JWT_SECRET` / `JWT_EXPIRES_IN` | Auth token signing |
| `GOOGLE_MAPS_API_KEY` | Optional — enables real road-distance routing (falls back to Haversine if unset) |
| `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET` | Payment processing |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_SUBJECT` | Web Push notifications |

### Demo scripts

```bash
npm run seed        # seed the database with sample restaurants/partners/orders
npm run demo         # run the single-order optimization engine standalone
npm run demo:vrp    # run the batch VRP solver standalone
```

## License

This project was built for educational purposes as part of personal portfolio work.
