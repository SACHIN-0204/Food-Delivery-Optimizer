# Food Delivery Optimizer

A full-stack food delivery app with route/assignment optimization, built with:

- **Frontend:** React.js + Tailwind CSS (Vite)
- **Backend:** Node.js + Express.js
- **Database:** MongoDB (Mongoose)
- **Auth:** JWT
- **Maps:** Leaflet (OpenStreetMap) — swappable for Google Maps API
- **Realtime:** Socket.IO

## Project structure

```
food-delivery-optimizer/
├── backend/
│   ├── config/db.js            # MongoDB connection
│   ├── models/                 # User, Restaurant, Order, DeliveryPartner
│   ├── routes/                 # Express route definitions
│   ├── controllers/            # Route handler logic
│   ├── middleware/authMiddleware.js
│   ├── sockets/index.js        # Socket.IO event handlers
│   └── server.js               # App entry point
└── frontend/
    ├── src/
    │   ├── components/
    │   ├── pages/
    │   ├── context/
    │   ├── hooks/
    │   ├── services/api.js     # Axios client w/ JWT interceptor
    │   └── App.jsx
    └── index.html
```

## Getting started

### 1. Backend

```bash
cd backend
cp .env.example .env   # then fill in MONGO_URI, JWT_SECRET, etc.
npm install
npm run dev
```

Runs on `http://localhost:5000`. Health check: `GET /api/health`.

Once it's running, populate sample data:

```bash
npm run seed    # creates sample restaurants, partners, a customer
npm run demo    # places test orders and runs the optimizer, printing its decisions
npm run demo:vrp # places 3 orders and runs the VRP batch solver, showing clustering
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev
```

Runs on `http://localhost:5173`.

You'll need MongoDB running locally (or an Atlas connection string in `.env`).

### 3. Or: run everything with Docker

No local Node/MongoDB install needed — this builds and runs MongoDB, the backend, and the frontend together:

```bash
cp .env.example .env   # optional: set a real JWT_SECRET
docker compose up --build
```

- Frontend: `http://localhost:5173`
- Backend: `http://localhost:5000`
- MongoDB: `localhost:27017` (persisted in a named volume, `mongo_data`)

Seed sample data into the containerized DB:

```bash
docker compose exec backend npm run seed
docker compose exec backend npm run demo   # watch the optimizer make decisions
```

Stop everything with `docker compose down` (add `-v` to also wipe the MongoDB volume).

**Note on the frontend build:** Vite bakes `VITE_API_URL`/`VITE_SOCKET_URL` into the JS at build time, so they default to `http://localhost:5000` in `docker-compose.yml`. If you're deploying anywhere other than local Docker, override them via `build.args` in the compose file before building.

## What's implemented so far

**Step 1 — Project setup**
- Monorepo folder structure for backend + frontend
- Mongoose models: `User`, `Restaurant` (with menu + geo location),
  `DeliveryPartner` (with live geo location + capacity), `Order`
  (with status lifecycle + optimizer-relevant fields)
- Working JWT auth: register / login / get current user
- Express server wired with CORS, Socket.IO, and route placeholders
- React app with routing skeleton and Tailwind styling

**Step 2 — Restaurant & menu API**
- `POST /api/restaurants` — create restaurant (owner/admin only)
- `GET /api/restaurants` — list restaurants, supports `?lat=&lng=&maxDistanceKm=&cuisine=` geo search via the `2dsphere` index
- `GET /api/restaurants/:id` — get single restaurant with full menu
- `PUT /api/restaurants/:id` / `DELETE /api/restaurants/:id` — owner-only update/delete
- `POST /api/restaurants/:id/menu` — add menu item
- `PUT /api/restaurants/:id/menu/:itemId` / `DELETE /api/restaurants/:id/menu/:itemId` — update/remove menu item
- All mutation routes protected by JWT + role check (`restaurant` or `admin` role)

**Step 3 — Order flow**
- `POST /api/orders` — customer places an order; menu items/prices are resolved server-side against the restaurant's actual menu (client can't spoof prices)
- `GET /api/orders/my` — customer's own order history
- `GET /api/orders/restaurant/:restaurantId` — restaurant owner's incoming orders, filterable by `?status=`
- `GET /api/orders/:id` — order detail, access-controlled (customer, restaurant owner, or admin)
- `PUT /api/orders/:id/status` — status transition, validated against an explicit state machine:
  `placed → confirmed → preparing → ready_for_pickup → assigned → picked_up → on_the_way → delivered`
  (cancellation allowed from any pre-pickup state)
- Socket.IO events already emitted: `new_order` (to `restaurant_<id>` room) and `order_status_updated` (to `order_<id>` room) — the frontend just needs to join those rooms once we build the realtime step

**Step 4 — Optimization engine**
- `backend/utils/geo.js` — Haversine distance + travel-time estimation (straight-line, no external API needed to get started; swap in Google Directions API later for real road distance)
- `backend/services/optimizationEngine.js` — the core greedy assignment algorithm:
  - Finds nearby delivery partners via `$near` geo query (partners who are `available`, `assigned`, or `on_delivery` but under capacity)
  - Scores each candidate: `distance_to_restaurant × weight + load_penalty − batching_bonus`
  - **Batching bonus**: if a partner already has an active pickup at the *same restaurant*, they're favored — this is what lets one partner carry multiple orders from one restaurant in a single trip
  - Lowest score wins; ties broken by whichever was found first
  - Computes pickup ETA + delivery ETA and stores `routeDistanceKm`, `estimatedDeliveryAt`, `assignmentScore` on the order
  - `assignAllReadyOrdersForRestaurant` batch-processes all ready orders oldest-first, so each assignment sees the updated load from the previous one
- `POST /api/delivery/assign/:orderId` — trigger assignment for a single order
- `POST /api/delivery/assign-all/:restaurantId` — batch-run the optimizer for a restaurant
- `PUT /api/delivery/location` / `PUT /api/delivery/status` — partner self-service (location ping, go online/offline)
- `GET /api/delivery/nearby` — debug endpoint to see candidate partners for a location

**Tuning the optimizer:** the weights (`WEIGHTS` object at the top of `optimizationEngine.js`) control how much distance vs. load vs. batching matters. Turn up `sameRestaurantBatchBonus` to favor batching more aggressively; turn up `loadPenaltyPerOrder` to spread work more evenly across partners.

**Step 5 — Realtime tracking**
- `backend/sockets/index.js` — full rewrite:
  - Sockets authenticate via JWT sent in `socket.handshake.auth.token`
  - Restaurant-role users auto-join `restaurant_<id>` rooms for every restaurant they own — dashboards update without extra plumbing
  - Delivery partners auto-join `partner_<id>`; customers/guests join `order_<id>` explicitly when opening a tracking page
  - `partner_location_update` — partner app pings coordinates over the socket (lower overhead than REST polling); server updates the DB and fans the new position out to every order room that partner is currently servicing
- **Frontend:**
  - `services/socket.js` — shared Socket.IO client singleton, re-authenticates if the JWT changes
  - `hooks/useOrderTracking.js` — fetches the order once via REST, then joins its room and layers live `order_status_updated` / `partner_location_updated` events on top
  - `pages/OrderTracking.jsx` — Leaflet map with restaurant/customer/partner markers, a live-updating partner marker + route line, and a status banner with ETA
  - `pages/RestaurantDashboard.jsx` — live incoming-orders list driven by `new_order` and `order_status_updated`, with one-click status advancement buttons

**Step 6 — Maps UI: browse, menu, checkout**
- `pages/RestaurantBrowse.jsx` — geolocates the user (falls back to a default center if denied), hits the geo-search endpoint from Step 2, and shows results as both map markers and a list
- `pages/RestaurantMenu.jsx` — menu with a quantity-stepper cart, address label input, and the `AddressPicker` map; on submit, calls `POST /api/orders` from Step 3 and redirects straight into the `OrderTracking` page from Step 5
- `components/AddressPicker.jsx` — reusable click-to-drop-a-pin map; converts Leaflet's `[lat, lng]` to the `[lng, lat]` GeoJSON order the backend expects everywhere else
- Home page now links straight into the browse flow

The full loop is wired end-to-end now: **browse → menu/cart → pick delivery location → place order → live tracking**, with the restaurant dashboard and optimizer running underneath.

**Step 7 — Seed data & optimizer demo**
- `backend/seed.js` — wipes and repopulates the DB with realistic test data: 1 customer, 2 restaurant owners (with full menus), 5 delivery partners scattered at known distances from the restaurants. Prints all IDs and login credentials to the console when done.
- `backend/demoOptimizer.js` — places two orders at the same restaurant (both `ready_for_pickup`), runs `assignAllReadyOrdersForRestaurant`, and prints exactly which partner got which order, their ETAs, and whether the batching bonus actually kicked in (i.e. both orders landed on the same partner)
- Run with:
  ```bash
  cd backend
  npm run seed
  npm run demo
  ```
- This is the fastest way to *see* the optimizer's scoring in action without manually creating restaurants/partners/orders through Postman first. Tweak `WEIGHTS` in `optimizationEngine.js` and re-run `npm run demo` to see how the assignment changes.

**Step 8 — Admin dashboard**
- `controllers/adminController.js` + `routes/adminRoutes.js` (all gated behind `authorizeRoles("admin")`):
  - `GET /api/admin/stats` — active/delivered/cancelled order counts, partner availability, and two optimizer health signals: **average assignment score** and **average route distance** over the last 50 assigned orders
  - `GET /api/admin/orders` — full order list with populated customer/restaurant/partner, including each order's `assignmentScore` and `routeDistanceKm` so you can see the optimizer's actual decisions, not just the outcome
  - `GET /api/admin/partners` — every partner's status, current load vs. capacity, vehicle, speed
  - `GET /api/admin/restaurants` — restaurant roster with owner info
- `pages/AdminDashboard.jsx` — stat cards up top, tabbed tables (Orders / Partners / Restaurants) below. The Orders tab is the interesting one: it surfaces `assignmentScore` and route distance per order, so tuning the optimizer's weights and watching the effect doesn't require digging through Mongo directly.

**Step 9 — Login & Register pages**
- `context/AuthContext.jsx` — holds the current user, restores session from the stored JWT on load (`GET /api/auth/me`), exposes `login`/`register`/`logout`
- `pages/Login.jsx` — logs in, then redirects by role: `admin` → `/admin`, `restaurant` → their own restaurant's dashboard (via the new `GET /api/restaurants/mine/list` endpoint), everyone else → `/restaurants`
- `pages/Register.jsx` — signup form with a role picker (customer / restaurant / delivery partner)
- `App.jsx` now has a real nav bar showing who's logged in, with a logout button
- Backend addition: `GET /api/restaurants/mine/list` — lets a restaurant owner find their own restaurant right after logging in, without needing to know its ID

**Step 10 — Restaurant onboarding & menu management**
- `pages/RestaurantOnboarding.jsx` — form + `AddressPicker` map; new restaurant owners land here automatically (both right after registering and after logging in, if `GET /api/restaurants/mine/list` comes back empty)
- `RestaurantDashboard.jsx` has two tabs:
  - **Orders** — unchanged from Step 5
  - **Menu** — add items, toggle availability, remove items, all backed by the CRUD endpoints from Step 2
- This closes the loop for restaurant owners: register → create restaurant → add menu items → start receiving orders, entirely through the UI, no direct API calls needed

**Step 11 — Delivery partner UI**
- Backend addition: `GET /api/delivery/me` — returns the caller's partner profile with `activeOrders` fully populated (restaurant name/address, customer name/phone), so the partner app has everything it needs in one call
- `pages/PartnerOnboarding.jsx` — vehicle type, capacity, average speed, and initial GPS location (via `navigator.geolocation`), posting to `POST /api/delivery/partners`
- `pages/PartnerDashboard.jsx`:
  - **Go online/offline** toggle (`PUT /api/delivery/status`) — this is what makes a partner eligible for the optimizer's `$near` queries in the first place
  - **Live location sharing** — `navigator.geolocation.watchPosition` streams GPS updates straight over the socket as `partner_location_update` events, which the backend (Step 5) already fans out to every order room the partner is servicing
  - **Active deliveries list** — shows each assigned order with a one-tap "Picked up → On the way → Delivered" status progression, calling the same `PUT /api/orders/:id/status` endpoint from Step 3
- `Login.jsx` / `Register.jsx` — delivery partners now route to onboarding (no profile yet) or straight to their dashboard (profile exists), mirroring the restaurant flow from Step 10

Every role now has a complete UI path: customer (browse → order → track), restaurant (onboard → menu → fulfill orders), delivery partner (onboard → go online → deliver), admin (monitor everything).

**Step 12 — Real road routing (Google Directions API)**
- `backend/utils/googleMaps.js` — thin wrapper around two Google APIs:
  - `getDistanceMatrix(origins, destination)` — **one API call** gets real road distance/duration from every candidate partner to the restaurant simultaneously (this is the efficient way to score N candidates — N separate Directions calls would be wasteful and slow)
  - `getDirectionsRoute(origin, destination)` — full route with distance, duration, and an **encoded polyline**, called once per confirmed assignment for the restaurant→customer leg (this is the leg worth drawing on a map; the partner→restaurant leg only needs distance/duration for scoring, not a polyline)
  - Both return `null` on any failure (API not configured, no key, request error, zero results) — every caller falls back to Haversine automatically. **The app works identically with or without a Google Maps API key** — you just get straight-line estimates instead of road distances without one.
- `optimizationEngine.js` now scores candidates using real road distance when available, with Haversine as a per-candidate fallback (if the matrix call fails for one partner but not others, only that partner degrades to straight-line — the batch doesn't fail as a whole)
- `Order` model gained `deliveryRoutePolyline` (encoded polyline string) and `routeSource` (`"google_maps"` or `"haversine"`) so you can see which mode produced a given assignment
- **Frontend:** `utils/polyline.js` decodes Google's polyline format; `OrderTracking.jsx` draws the real road route as a solid blue line (captured once at assignment time) alongside the existing live dashed line from the partner's current position; a small "real road route" badge shows next to the ETA when Google Maps was used
- **Admin dashboard:** Orders tab now has a "Route source" column so you can see at a glance which orders got real routing vs. the fallback

**To enable it:** get a Google Maps API key with the **Distance Matrix API** and **Directions API** enabled, put it in `GOOGLE_MAPS_API_KEY` in `backend/.env`. Nothing else changes — same seed data, same demo script, same UI. Without a key, everything still works exactly as before this step.

**Step 13 — Production hardening**
- **Security headers:** `helmet()` on every response (CSP, X-Frame-Options, etc.), with `crossOriginResourcePolicy` relaxed since the API is deliberately consumed cross-origin by the frontend
- **Rate limiting** (`middleware/rateLimiters.js`), three tiers:
  - `generalLimiter` — 500 req/15min globally, applied in `server.js` before any route
  - `authLimiter` — 20 req/15min on `/api/auth/register` and `/api/auth/login` only, the actual brute-force/credential-stuffing defense
  - `optimizerLimiter` — 60 req/5min on the assignment-trigger endpoints, since those do real work (geo queries + optional external API calls)
- **Input validation** (`middleware/validators.js`), built on `express-validator` — every mutating endpoint now validates its body/params *before* a controller runs: emails, coordinate bounds, Mongo ObjectId format, enum values (status, role, vehicle type), string length caps, numeric ranges. Bad input gets a consistent `400` with field-level error messages instead of reaching Mongoose and surfacing a raw driver error.
- **Centralized error handling** (`middleware/errorHandler.js`) — a `notFound` handler for unmatched routes, plus a final `errorHandler` that catches malformed JSON bodies, Mongoose `CastError`s (e.g. a malformed ObjectId that slipped through), and anything a controller forgot to wrap in try/catch. Stack traces go to the server console only, never to the client.
- Request body size capped at 1MB (`express.json({ limit: "1mb" })`) as a cheap defense against oversized payloads
- Fixed a pre-existing duplicate-index warning on `User.email` (it had both `unique: true` and an explicit `.index()` call — only one was needed)

All three additions (validators, limiters, error handler) were tested directly against a live Express instance during development — bad input reliably returns `400` with field errors, and the auth rate limiter reliably returns `429` after its threshold.

**Step 14 — VRP batch solver (proper multi-order optimization)**

The original optimizer (`optimizationEngine.js`) is strictly greedy: it assigns orders one at a time, in isolation. That works well, but it can't see the bigger picture — e.g. two orders from the same restaurant, going to addresses three streets apart, might get dispatched to two different partners simply because of the order they happened to arrive in.

`services/vrpBatchSolver.js` fixes this by solving a small vehicle-routing problem across a restaurant's *entire* ready-for-pickup queue at once, instead of order-by-order:

1. **Cluster** nearby orders together (nearest-neighbor clustering, capped at 3 stops per trip and a 3km radius — bigger than that and batching stops making sense for a bike/scooter partner)
2. **Route** each cluster optimally:
   - Single-stop clusters: a normal point-to-point route
   - Multi-stop clusters: if Google Maps is configured, asks the Directions API to solve the actual waypoint ordering (`optimizeWaypoints: true`) — this is real road-network TSP-solving, done by Google, not hand-rolled. Without a key, falls back to brute-force permutation search over Haversine distances (safe since clusters are capped at 3 stops → max 6 permutations)
3. **Match** clusters to partners — bigger (harder-to-place) clusters matched first, each to whichever available partner minimizes pickup distance + current load

This is exposed via the same `POST /api/delivery/assign-all/:restaurantId` endpoint — it now runs the VRP solver instead of the older per-order loop. The single-order endpoint (`POST /api/delivery/assign/:orderId`) is unchanged and still uses the original greedy optimizer, since a single order has nothing to batch against yet.

`googleMaps.js`'s `getDirectionsRoute` was extended to accept `waypoints` + `optimizeWaypoints`, returning per-leg durations and Google's optimized waypoint order — this is what makes step 2 above possible.

Try it: `npm run demo:vrp` places 3 orders (two close together, one far away) and shows the solver batching the two close ones into a single multi-stop trip while the far one gets its own partner.

**Step 15 — Payments (Razorpay)**
- Chosen over Stripe since the app already uses ₹/INR throughout — Razorpay is the standard choice for Indian payments.
- Every order now has `paymentMethod` (`"cod"` or `"razorpay"`) and `paymentStatus` (`"pending"` / `"paid"` / `"failed"` / `"refunded"`), plus `razorpayOrderId`/`razorpayPaymentId` once a payment order exists.
- `backend/utils/razorpay.js` — thin wrapper: `createRazorpayOrder`, `verifyCheckoutSignature` (HMAC-SHA256, the step that actually proves a payment happened — never trust "success" from the client alone), and `verifyWebhookSignature` (separate secret, for the webhook path below). Returns `null`/`false` on any failure so callers fall back gracefully — **online payments are entirely optional; the app works with Cash on Delivery if no Razorpay keys are set.**
- `POST /api/payments/create-order/:orderId` → creates a Razorpay order, `POST /api/payments/verify` → verifies the signature the checkout widget returns and marks the order paid
- **Payment gating:** a restaurant can't move a `razorpay`-method order from `placed` → `confirmed` until `paymentStatus === "paid"` (enforced in `orderController.updateOrderStatus`) — this stops a kitchen from starting on an order that was never actually paid for. COD orders skip this check entirely and get auto-marked paid on delivery (cash collected at the door).
- **Webhook, as a reconciliation backstop:** `POST /api/payments/webhook` handles `payment.captured`/`payment.failed` events directly from Razorpay's servers — this covers the case where the customer's browser closes mid-checkout and the frontend's `verify` call never happens. It needed its own signature scheme and, importantly, its own body-parsing: it's mounted in `server.js` with `express.raw()` **before** the global `express.json()`, since signature verification needs the exact original request bytes — by the time a request reaches a normal route, that raw buffer is already gone.
- **Frontend:** `utils/razorpayCheckout.js` lazy-loads Razorpay's checkout script once, opens the widget, and wraps the create-order → checkout → verify round trip into a single `payForOrder()` call. `RestaurantMenu.jsx` has a COD/"Pay online" toggle at checkout; `OrderTracking.jsx` has a "Pay now" retry button if a `razorpay` order is still unpaid (checkout cancelled, network drop, etc. — nothing is a dead end).
- Verified directly: ran the signature-verification functions against real Razorpay-shaped payloads (valid signature accepted, tampered signature rejected, same for the webhook path) before wiring them into any route.

**Step 16 — Push notifications (Web Push / VAPID)**
- Complements Socket.IO rather than replacing it: sockets only reach an open tab; push notifications reach the customer/restaurant even with the app closed.
- `backend/services/pushNotifications.js` — `notifyUser(userId, {title, body, url})` looks up every device a user has subscribed on and sends to each. No-ops silently if push isn't configured (no VAPID keys) — same graceful-degradation pattern as Google Maps and Razorpay. Automatically deletes subscriptions that come back `404`/`410` (revoked or expired), so the collection doesn't accumulate dead entries.
- Wired into: new order → push to the restaurant owner; every order status change → push to the customer; payment captured (via webhook) → push to the customer.
- `PushSubscription` model stores each browser's endpoint + keys per user; `GET /api/notifications/vapid-public-key`, `POST/DELETE /api/notifications/subscribe` handle the browser side.
- `npm run generate-vapid-keys` creates the one-time keypair needed to turn this on.
- **Frontend:** `public/sw.js` is a minimal service worker (shows the notification on `push`, focuses/opens the right page on click); `utils/push.js` handles registration + subscribing; a 🔔/🔕 toggle sits in the nav bar for any logged-in user.

Both features are entirely optional at runtime — leave their env vars blank and the app behaves exactly as it did before this step (COD-only ordering, Socket.IO-only live updates).

## Project status: feature-complete

All planned steps are done. The full loop works end-to-end:
**browse restaurants → build cart → set delivery pin → place order → restaurant confirms/preps → optimizer assigns + batches a delivery partner → customer tracks live on the map → admin can monitor the whole system and see optimizer decisions.**

### Where to go from here (optional stretch goals)
- ✅ ~~Dockerize backend + frontend + MongoDB for one-command local setup~~ — done, see "Or: run everything with Docker" above
- ✅ ~~Swap Haversine distance for the Google Directions API (real road routing instead of straight-line)~~ — done, see Step 12 above
- ✅ ~~Rate limiting + input validation middleware for production hardening~~ — done, see Step 13 above
- ✅ ~~Replace the greedy per-order assignment with a proper batch solver (mini VRP per restaurant cluster)~~ — done, see Step 14 above
- ✅ ~~Add payment integration (Razorpay/Stripe)~~ — done, see Step 15 above
- ✅ ~~Add push notifications for order status changes~~ — done, see Step 16 above

All originally planned stretch goals are now complete. Genuinely open-ended next moves from here: a proper test suite, CI/CD, deploying somewhere real (Render/Railway/a VPS + real domain + HTTPS), or refunds/partial-refund handling on the payments side.
