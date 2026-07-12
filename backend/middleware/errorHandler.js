// Catches any request that didn't match a route above it. Placed after all
// app.use("/api/...") mounts in server.js.
export const notFound = (req, res, next) => {
  res.status(404).json({ message: `Route not found: ${req.method} ${req.originalUrl}` });
};

/**
 * Last-resort error handler. Individual controllers already catch their own
 * errors and respond with a specific status + message, so this mainly catches:
 * - malformed JSON bodies (express.json() throws before a controller runs)
 * - Mongoose CastErrors (e.g. an invalid ObjectId that slipped past validation)
 * - anything a controller forgot to wrap in try/catch
 *
 * Never leaks stack traces to the client — those go to the server console only.
 */
export const errorHandler = (err, req, res, next) => {
  console.error(err.stack || err);

  if (err.type === "entity.parse.failed") {
    return res.status(400).json({ message: "Malformed JSON in request body" });
  }
  if (err.name === "CastError") {
    return res.status(400).json({ message: `Invalid ${err.path}: ${err.value}` });
  }
  if (err.name === "ValidationError") {
    return res.status(400).json({ message: err.message });
  }

  const status = err.statusCode || 500;
  res.status(status).json({ message: status === 500 ? "Internal server error" : err.message });
};
