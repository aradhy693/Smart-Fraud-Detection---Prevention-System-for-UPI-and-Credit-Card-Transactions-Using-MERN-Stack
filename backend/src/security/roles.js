const ROLES = Object.freeze({
  USER: "user",
  ADMIN: "admin",
  ANALYST: "analyst",
  SECURITY_OPERATOR: "security-operator",
  SOC_ANALYST: "soc-analyst",
  FRAUD_ANALYST: "fraud-analyst",
  INCIDENT_MANAGER: "incident-manager",
  VIEWER: "viewer"
});

const ALL_ROLES = Object.freeze(Object.values(ROLES));
const ELEVATED_ROLES = Object.freeze(
  ALL_ROLES.filter((role) => role !== ROLES.USER)
);
const SECURITY_STAFF_ROLES = Object.freeze([
  ROLES.ADMIN,
  ROLES.ANALYST,
  ROLES.SECURITY_OPERATOR,
  ROLES.SOC_ANALYST,
  ROLES.FRAUD_ANALYST,
  ROLES.INCIDENT_MANAGER,
  ROLES.VIEWER
]);
const SOC_WRITE_ROLES = Object.freeze([
  ROLES.ADMIN,
  ROLES.SECURITY_OPERATOR,
  ROLES.SOC_ANALYST,
  ROLES.FRAUD_ANALYST,
  ROLES.INCIDENT_MANAGER
]);
const SOC_MANAGER_ROLES = Object.freeze([
  ROLES.ADMIN,
  ROLES.SECURITY_OPERATOR,
  ROLES.INCIDENT_MANAGER
]);

module.exports = {
  ALL_ROLES,
  ELEVATED_ROLES,
  ROLES,
  SECURITY_STAFF_ROLES,
  SOC_MANAGER_ROLES,
  SOC_WRITE_ROLES
};
