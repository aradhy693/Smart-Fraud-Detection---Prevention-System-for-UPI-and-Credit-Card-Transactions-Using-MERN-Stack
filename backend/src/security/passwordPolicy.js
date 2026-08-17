const PASSWORD_POLICY = Object.freeze({
  minLength: 12,
  maxLength: 128,
  requireUppercase: true,
  requireLowercase: true,
  requireNumber: true,
  requireSpecialCharacter: true
});

const buildCheck = (code, passed, message) => ({ code, passed, message });

const evaluatePasswordStrength = (password) => {
  const value = typeof password === "string" ? password : "";
  const checks = [
    buildCheck(
      "MIN_LENGTH",
      value.length >= PASSWORD_POLICY.minLength,
      `Use at least ${PASSWORD_POLICY.minLength} characters.`
    ),
    buildCheck(
      "MAX_LENGTH",
      value.length <= PASSWORD_POLICY.maxLength,
      `Use no more than ${PASSWORD_POLICY.maxLength} characters.`
    ),
    buildCheck("UPPERCASE", /[A-Z]/.test(value), "Add at least one uppercase letter."),
    buildCheck("LOWERCASE", /[a-z]/.test(value), "Add at least one lowercase letter."),
    buildCheck("NUMBER", /\d/.test(value), "Add at least one number."),
    buildCheck(
      "SPECIAL_CHARACTER",
      /[^A-Za-z0-9]/.test(value),
      "Add at least one special character."
    )
  ];
  const passedChecks = checks.filter((check) => check.passed).length;
  const valid = checks.every((check) => check.passed);

  return {
    valid,
    score: Math.round((passedChecks / checks.length) * 100),
    policy: PASSWORD_POLICY,
    checks,
    feedback: valid
      ? ["Password meets the enterprise security policy."]
      : checks.filter((check) => !check.passed).map((check) => check.message)
  };
};

module.exports = {
  PASSWORD_POLICY,
  evaluatePasswordStrength
};
