const express = require("express");
const {
  getFraudAlerts,
  getFraudStats,
  updateAlertStatus
} = require("../controllers/fraudController");
const {
  protect,
  securityOperatorOnly,
  securityStaffOnly
} = require("../middleware/authMiddleware");
const { tokenAnomalyDetection } = require("../middleware/authSecurityMiddleware");
const validate = require("../middleware/validateMiddleware");
const { validateAlertStatusPayload } = require("../validators/schemas");

const router = express.Router();

router.use(protect, tokenAnomalyDetection);

router.get("/alerts", securityStaffOnly, getFraudAlerts);
router.patch("/alerts/:id", securityOperatorOnly, validate(validateAlertStatusPayload), updateAlertStatus);
router.get("/stats", securityStaffOnly, getFraudStats);

module.exports = router;
