const AppError = require("../utils/AppError");
const { evaluatePasswordStrength } = require("../security/passwordPolicy");

const validatePasswordPolicy = (field = "password") => (req, _res, next) => {
  const password = req.body?.[field];

  if (typeof password !== "string") {
    return next();
  }

  const strength = evaluatePasswordStrength(password);
  if (strength.valid) {
    return next();
  }

  return next(
    new AppError("Password does not meet the enterprise security policy", 400, "PASSWORD_POLICY_FAILED", [
      {
        field,
        message: "Password does not meet the enterprise security policy",
        score: strength.score,
        feedback: strength.feedback,
        checks: strength.checks
      }
    ])
  );
};

module.exports = validatePasswordPolicy;
