const AppError = require("../utils/AppError");

const notFoundMiddleware = (req, res, next) => {
  next(new AppError(`Route not found: ${req.method} ${req.originalUrl}`, 404, "ROUTE_NOT_FOUND"));
};

module.exports = notFoundMiddleware;
