const AppError = require("../utils/AppError");

const validate = (schema) => (req, res, next) => {
  const { error, value } = schema(req.body);

  if (error) {
    return next(new AppError(error.message, 400, error.code, error.details));
  }

  req.body = value;
  return next();
};

module.exports = validate;
