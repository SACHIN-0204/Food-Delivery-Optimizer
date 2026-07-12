import Order from "../models/Order.js";
import Restaurant from "../models/Restaurant.js";
import { notifyUser } from "../services/pushNotifications.js";

// Valid forward transitions. Cancellation is allowed from most pre-pickup states.
const ALLOWED_TRANSITIONS = {
  placed: ["confirmed", "cancelled"],
  confirmed: ["preparing", "cancelled"],
  preparing: ["ready_for_pickup", "cancelled"],
  ready_for_pickup: ["assigned", "cancelled"],
  assigned: ["picked_up", "cancelled"],
  picked_up: ["on_the_way"],
  on_the_way: ["delivered"],
  delivered: [],
  cancelled: [],
};

// @route POST /api/orders
// @access customer
export const placeOrder = async (req, res) => {
  try {
    const { restaurantId, items, deliveryAddress, paymentMethod } = req.body;

    if (!restaurantId || !items?.length || !deliveryAddress?.location?.coordinates) {
      return res.status(400).json({
        message: "restaurantId, items, and deliveryAddress.location.coordinates are required",
      });
    }

    const restaurant = await Restaurant.findById(restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }
    if (!restaurant.isOpen) {
      return res.status(400).json({ message: "Restaurant is currently closed" });
    }

    // Resolve items against the restaurant's actual menu so prices can't be spoofed by the client
    let itemsTotal = 0;
    const resolvedItems = items.map(({ menuItemId, quantity }) => {
      const menuItem = restaurant.menu.id(menuItemId);
      if (!menuItem) {
        throw new Error(`Menu item ${menuItemId} not found on this restaurant`);
      }
      if (!menuItem.isAvailable) {
        throw new Error(`Menu item "${menuItem.name}" is currently unavailable`);
      }
      const qty = quantity && quantity > 0 ? quantity : 1;
      itemsTotal += menuItem.price * qty;
      return {
        menuItem: menuItem._id,
        name: menuItem.name,
        price: menuItem.price,
        quantity: qty,
      };
    });

    const deliveryFee = 30; // flat fee for now; optimizer step can make this distance-based
    const total = itemsTotal + deliveryFee;

    const order = await Order.create({
      customer: req.user._id,
      restaurant: restaurant._id,
      items: resolvedItems,
      itemsTotal,
      deliveryFee,
      total,
      deliveryAddress,
      status: "placed",
      paymentMethod: paymentMethod === "razorpay" ? "razorpay" : "cod",
    });

    // Notify restaurant dashboard in realtime (room per restaurant)
    req.app.get("io")?.to(`restaurant_${restaurant._id}`).emit("new_order", order);

    // Also push-notify the restaurant owner directly — useful if their dashboard
    // tab isn't open (Socket.IO only reaches an active connection).
    notifyUser(restaurant.owner, {
      title: "New order received",
      body: `Order #${order._id.toString().slice(-6)} — ₹${order.total}`,
      url: `/restaurant/${restaurant._id}/dashboard`,
    }).catch(() => {});

    return res.status(201).json(order);
  } catch (error) {
    return res.status(400).json({ message: error.message });
  }
};

// @route GET /api/orders/my
// @access customer — their own order history
export const getMyOrders = async (req, res) => {
  try {
    const orders = await Order.find({ customer: req.user._id })
      .sort({ createdAt: -1 })
      .populate("restaurant", "name address location");
    return res.json(orders);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route GET /api/orders/restaurant/:restaurantId
// @access restaurant owner — incoming orders for their restaurant
export const getRestaurantOrders = async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.params.restaurantId);
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }
    if (restaurant.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized to view these orders" });
    }

    const { status } = req.query;
    const filter = { restaurant: restaurant._id };
    if (status) filter.status = status;

    const orders = await Order.find(filter).sort({ createdAt: -1 }).populate("customer", "name phone");
    return res.json(orders);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route GET /api/orders/:id
export const getOrderById = async (req, res) => {
  try {
    const order = await Order.findById(req.params.id)
      .populate("restaurant", "name address location")
      .populate("customer", "name phone")
      .populate("deliveryPartner");

    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    // Restrict visibility: only the customer, the restaurant owner, or an admin can view
    const isCustomer = order.customer._id.toString() === req.user._id.toString();
    const isAdmin = req.user.role === "admin";
    if (!isCustomer && !isAdmin) {
      const restaurant = await Restaurant.findById(order.restaurant._id);
      const isOwner = restaurant?.owner.toString() === req.user._id.toString();
      if (!isOwner) {
        return res.status(403).json({ message: "Not authorized to view this order" });
      }
    }

    return res.json(order);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route PUT /api/orders/:id/status
// @access restaurant owner (placed->ready_for_pickup range) or admin/delivery partner (later stages)
export const updateOrderStatus = async (req, res) => {
  try {
    const { status: nextStatus } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    const currentStatus = order.status;
    const allowedNext = ALLOWED_TRANSITIONS[currentStatus] || [];

    if (!allowedNext.includes(nextStatus)) {
      return res.status(400).json({
        message: `Cannot transition from "${currentStatus}" to "${nextStatus}"`,
        allowedNext,
      });
    }

    // Online payments must actually clear before a restaurant starts cooking —
    // otherwise a customer could tie up kitchen capacity on an unpaid order.
    // Cash on Delivery orders skip this check entirely (payment happens at the door).
    if (nextStatus === "confirmed" && order.paymentMethod === "razorpay" && order.paymentStatus !== "paid") {
      return res.status(400).json({
        message: "This order's payment hasn't been confirmed yet. It can't be confirmed until payment clears.",
      });
    }

    order.status = nextStatus;

    if (nextStatus === "preparing") {
      const restaurant = await Restaurant.findById(order.restaurant);
      order.estimatedPrepReadyAt = new Date(Date.now() + (restaurant?.avgPrepTimeMinutes || 20) * 60000);
    }
    if (nextStatus === "delivered") {
      order.deliveredAt = new Date();
      // Cash collected at the door — mark COD orders paid once delivery completes.
      if (order.paymentMethod === "cod" && order.paymentStatus === "pending") {
        order.paymentStatus = "paid";
      }
    }

    await order.save();

    // Push realtime update to anyone subscribed to this order's room
    req.app.get("io")?.to(`order_${order._id}`).emit("order_status_updated", {
      orderId: order._id,
      status: order.status,
    });

    // Also push-notify the customer directly, in case they've closed the tab
    const STATUS_MESSAGES = {
      confirmed: "Your order was confirmed by the restaurant.",
      preparing: "Your order is being prepared.",
      ready_for_pickup: "Your order is ready and waiting for a delivery partner.",
      assigned: "A delivery partner has been assigned to your order.",
      picked_up: "Your order has been picked up.",
      on_the_way: "Your order is on the way!",
      delivered: "Your order has been delivered. Enjoy!",
      cancelled: "Your order was cancelled.",
    };
    if (STATUS_MESSAGES[nextStatus]) {
      notifyUser(order.customer, {
        title: `Order #${order._id.toString().slice(-6)}`,
        body: STATUS_MESSAGES[nextStatus],
        url: `/orders/${order._id}`,
      }).catch(() => {});
    }

    return res.json(order);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
