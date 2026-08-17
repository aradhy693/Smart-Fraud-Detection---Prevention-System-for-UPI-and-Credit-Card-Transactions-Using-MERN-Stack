const express = require("express");
const {
  batchPredict,
  getDashboard,
  getDrift,
  getExplainability,
  getFeatures,
  getHealth,
  getModels,
  getPredictionJob,
  getPredictions,
  promoteModel,
  queuePrediction,
  retrain,
  rollbackModel,
  submitFeedback
} = require("../controllers/aiPlatformController");
const {
  protect,
  securityStaffOnly,
  socManagerOnly,
  socWriteOnly
} = require("../middleware/authMiddleware");
const { tokenAnomalyDetection } = require("../middleware/authSecurityMiddleware");

const router = express.Router();

router.use(protect, tokenAnomalyDetection);

router.get("/dashboard", securityStaffOnly, getDashboard);
router.get("/models", securityStaffOnly, getModels);
router.post("/models/:version/promote", socManagerOnly, promoteModel);
router.post("/models/rollback", socManagerOnly, rollbackModel);
router.get("/features", securityStaffOnly, getFeatures);
router.get("/drift", securityStaffOnly, getDrift);
router.get("/predictions", securityStaffOnly, getPredictions);
router.get("/explainability/:predictionId", securityStaffOnly, getExplainability);
router.get("/health", securityStaffOnly, getHealth);
router.post("/feedback", socWriteOnly, submitFeedback);
router.post("/retrain", socManagerOnly, retrain);
router.post("/batch-predict", securityStaffOnly, batchPredict);
router.post("/predict-async", securityStaffOnly, queuePrediction);
router.get("/prediction-jobs/:jobId", securityStaffOnly, getPredictionJob);

module.exports = router;
