const mongoose = require("mongoose");
const { encryptedFieldsPlugin } = require("../security/encryptionService");

const auditLogSchema = new mongoose.Schema(
  {
    eventType: {
      type: String,
      required: true,
      enum: [
        "LOGIN_SUCCESS",
        "LOGIN_FAILED",
        "LOGIN_BLOCKED",
        "LOGOUT",
        "SESSION_REVOKED",
        "ADMIN_ACTION",
        "TOKEN_FAILURE",
        "SUSPICIOUS_AUTH",
        "MFA_ENABLED",
        "MFA_DISABLED",
        "RECOVERY_CODE_USED",
        "NEW_DEVICE_LOGIN",
        "TRUSTED_DEVICE_CHANGED",
        "ACCOUNT_TAKEOVER_SUSPECTED",
        "MFA_BYPASS_ATTEMPT",
        "DEVICE_CLONE_ATTEMPT",
        "HIGH_THREAT_IP",
        "VPN_LOGIN",
        "TOR_DETECTION",
        "IMPOSSIBLE_TRAVEL",
        "CRITICAL_FRAUD",
        "THREAT_ALERT"
      ]
    },
    outcome: {
      type: String,
      required: true,
      enum: ["SUCCESS", "FAILURE", "BLOCKED"]
    },
    severity: {
      type: String,
      required: true,
      enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      default: "LOW"
    },
    actorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    actorEmail: {
      type: String,
      trim: true,
      lowercase: true
    },
    targetUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    ipAddress: {
      type: String,
      trim: true
    },
    userAgent: {
      type: String,
      trim: true,
      maxlength: 512
    },
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AuthSession"
    },
    tokenId: {
      type: String,
      trim: true
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    bufferCommands: false,
    strict: "throw",
    timestamps: { createdAt: true, updatedAt: false },
    versionKey: false
  }
);

auditLogSchema.plugin(encryptedFieldsPlugin, {
  fields: ["ipAddress", "userAgent", "tokenId", { path: "metadata", type: "json" }]
});

auditLogSchema.index({ eventType: 1, createdAt: -1 });
auditLogSchema.index({ actorUserId: 1, createdAt: -1 });
auditLogSchema.index({ ipAddress: 1, createdAt: -1 });

module.exports = mongoose.model("AuditLog", auditLogSchema);
