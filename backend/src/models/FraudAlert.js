const mongoose = require("mongoose");
const { encryptedFieldsPlugin } = require("../security/encryptionService");

const FraudAlertSchema = new mongoose.Schema(
  {
    transactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction",
      required: true,
      unique: true,
      index: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false
    },
    alertType: {
      type: String,
      enum: [
        "HIGH_RISK_TRANSACTION",
        "IMPOSSIBLE_TRAVEL",
        "DEVICE_MISMATCH",
        "VELOCITY_SPIKE",
        "GEOLOCATION_ANOMALY",
        "AI_HIGH_CONFIDENCE",
        "SUSPICIOUS_TRANSACTION",
        "HIGH_THREAT_IP",
        "VPN_DETECTED",
        "TOR_DETECTED",
        "DATACENTER_IP",
        "KNOWN_MALICIOUS_IP",
        "COUNTRY_RISK"
      ],
      required: true
    },
    severity: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      default: "HIGH"
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 500
    },
    status: {
      type: String,
      enum: ["OPEN", "REVIEWING", "RESOLVED", "DISMISSED"],
      default: "OPEN"
    },
    aiConfidence: {
      type: Number,
      min: 0,
      max: 1,
      default: 0
    },
    riskScore: {
      type: Number,
      min: 0,
      max: 100,
      default: 0
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    strict: "throw",
    timestamps: true
  }
);

FraudAlertSchema.plugin(encryptedFieldsPlugin, {
  fields: [{ path: "metadata", type: "json" }]
});

FraudAlertSchema.index({ status: 1, createdAt: -1 });
FraudAlertSchema.index({ severity: 1, createdAt: -1 });

module.exports = mongoose.model("FraudAlert", FraudAlertSchema);
