const express = require("express");
const { createTransaction, getAdminDashboard, getTransactions } = require("../controllers/transactionController");
const { protect, adminOnly } = require("../middleware/authMiddleware");
const { tokenAnomalyDetection } = require("../middleware/authSecurityMiddleware");
const fraudEngine = require("../middleware/fraudEngine");
const { transactionRateLimiter } = require("../middleware/rateLimitMiddleware");
const validate = require("../middleware/validateMiddleware");
const { validateTransactionPayload } = require("../validators/schemas");

const router = express.Router();

router.post(
  "/process",
  protect,
  tokenAnomalyDetection,
  transactionRateLimiter,
  validate(validateTransactionPayload),
  fraudEngine,
  createTransaction
);
router.get("/admin/dashboard", protect, tokenAnomalyDetection, adminOnly, getAdminDashboard);
router.get("/", protect, tokenAnomalyDetection, adminOnly, getTransactions);

module.exports = router;
