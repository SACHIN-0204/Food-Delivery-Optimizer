import Restaurant from "../models/Restaurant.js";

// @route GET /api/restaurants/mine/list
// @access restaurant owner — used right after login to find their own restaurant(s)
export const getMyRestaurants = async (req, res) => {
  try {
    const restaurants = await Restaurant.find({ owner: req.user._id }).select("-menu");
    return res.json(restaurants);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route POST /api/restaurants
// @access restaurant owner
export const createRestaurant = async (req, res) => {
  try {
    const { name, description, cuisine, address, location, avgPrepTimeMinutes } = req.body;

    if (!name || !address || !location?.coordinates) {
      return res.status(400).json({ message: "name, address, and location.coordinates are required" });
    }

    const restaurant = await Restaurant.create({
      owner: req.user._id,
      name,
      description,
      cuisine,
      address,
      location: { type: "Point", coordinates: location.coordinates },
      avgPrepTimeMinutes,
    });

    return res.status(201).json(restaurant);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route GET /api/restaurants
// Supports optional ?lat=&lng=&maxDistanceKm= for geo search
export const getRestaurants = async (req, res) => {
  try {
    const { lat, lng, maxDistanceKm, cuisine } = req.query;
    const filter = { isOpen: true };

    if (cuisine) {
      filter.cuisine = cuisine;
    }

    if (lat && lng) {
      filter.location = {
        $near: {
          $geometry: { type: "Point", coordinates: [parseFloat(lng), parseFloat(lat)] },
          $maxDistance: (maxDistanceKm ? parseFloat(maxDistanceKm) : 5) * 1000,
        },
      };
    }

    const restaurants = await Restaurant.find(filter).select("-menu");
    return res.json(restaurants);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route GET /api/restaurants/:id
export const getRestaurantById = async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.params.id);
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }
    return res.json(restaurant);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route PUT /api/restaurants/:id
// @access owner only
export const updateRestaurant = async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.params.id);
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }
    if (restaurant.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized to update this restaurant" });
    }

    const allowedFields = ["name", "description", "cuisine", "address", "location", "avgPrepTimeMinutes", "isOpen"];
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) restaurant[field] = req.body[field];
    });

    await restaurant.save();
    return res.json(restaurant);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route DELETE /api/restaurants/:id
// @access owner only
export const deleteRestaurant = async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.params.id);
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }
    if (restaurant.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized to delete this restaurant" });
    }
    await restaurant.deleteOne();
    return res.json({ message: "Restaurant deleted" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route POST /api/restaurants/:id/menu
// @access owner only
export const addMenuItem = async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.params.id);
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }
    if (restaurant.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized to modify this restaurant's menu" });
    }

    const { name, price, description, category, prepTimeMinutes } = req.body;
    if (!name || price === undefined) {
      return res.status(400).json({ message: "name and price are required" });
    }

    restaurant.menu.push({ name, price, description, category, prepTimeMinutes });
    await restaurant.save();
    return res.status(201).json(restaurant.menu[restaurant.menu.length - 1]);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route PUT /api/restaurants/:id/menu/:itemId
// @access owner only
export const updateMenuItem = async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.params.id);
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }
    if (restaurant.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized to modify this restaurant's menu" });
    }

    const item = restaurant.menu.id(req.params.itemId);
    if (!item) {
      return res.status(404).json({ message: "Menu item not found" });
    }

    const allowedFields = ["name", "price", "description", "category", "isAvailable", "prepTimeMinutes"];
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) item[field] = req.body[field];
    });

    await restaurant.save();
    return res.json(item);
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};

// @route DELETE /api/restaurants/:id/menu/:itemId
// @access owner only
export const deleteMenuItem = async (req, res) => {
  try {
    const restaurant = await Restaurant.findById(req.params.id);
    if (!restaurant) {
      return res.status(404).json({ message: "Restaurant not found" });
    }
    if (restaurant.owner.toString() !== req.user._id.toString()) {
      return res.status(403).json({ message: "Not authorized to modify this restaurant's menu" });
    }

    const item = restaurant.menu.id(req.params.itemId);
    if (!item) {
      return res.status(404).json({ message: "Menu item not found" });
    }
    item.deleteOne();
    await restaurant.save();
    return res.json({ message: "Menu item deleted" });
  } catch (error) {
    return res.status(500).json({ message: error.message });
  }
};
