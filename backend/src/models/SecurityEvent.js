const mongoose = require("mongoose");
const { encryptedFieldsPlugin } = require("../security/encryptionService");

const securityEventSchema = new mongoose.Schema(
  {
    eventType: {
      type: String,
      required: true,
      enum: [
        "ACCOUNT_TAKEOVER_SUSPECTED",
        "NEW_DEVICE_LOGIN",
        "MFA_BYPASS_ATTEMPT",
        "DEVICE_CLONE_ATTEMPT",
        "MFA_ENABLED",
        "MFA_DISABLED",
        "RECOVERY_CODE_USED",
        "TRUSTED_DEVICE_CHANGED",
        "SUSPICIOUS_DEVICE",
        "HIGH_RISK_LOGIN",
        "HIGH_THREAT_IP",
        "VPN_LOGIN",
        "TOR_DETECTION",
        "IMPOSSIBLE_TRAVEL",
        "CRITICAL_FRAUD",
        "THREAT_ALERT"
      ],
      index: true
    },
    severity: {
      type: String,
      required: true,
      enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      default: "LOW"
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true
    },
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AuthSession"
    },
    deviceId: {
      type: String,
      trim: true
    },
    ipAddress: {
      type: String,
      trim: true
    },
    riskScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    riskLevel: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH"],
      default: "LOW"
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    resolvedAt: {
      type: Date
    }
  },
  {
    bufferCommands: false,
    strict: "throw",
    timestamps: true,
    versionKey: false
  }
);

securityEventSchema.plugin(encryptedFieldsPlugin, {
  fields: ["deviceId", "ipAddress", { path: "metadata", type: "json" }]
});

securityEventSchema.index({ userId: 1, createdAt: -1 });
securityEventSchema.index({ severity: 1, createdAt: -1 });

module.exports = mongoose.model("SecurityEvent", securityEventSchema);
