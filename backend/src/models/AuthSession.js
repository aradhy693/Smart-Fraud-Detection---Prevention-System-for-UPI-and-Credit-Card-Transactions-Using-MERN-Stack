const mongoose = require("mongoose");
const { encryptedFieldsPlugin } = require("../security/encryptionService");
const { ALL_ROLES } = require("../security/roles");

const authSessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    tokenId: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    tokenHash: {
      type: String,
      required: true,
      select: false
    },
    refreshTokenFamilyId: {
      type: String,
      trim: true,
      index: true
    },
    currentRefreshTokenId: {
      type: String,
      trim: true
    },
    refreshTokenExpiresAt: {
      type: Date
    },
    role: {
      type: String,
      required: true,
      enum: ALL_ROLES
    },
    ipAddress: {
      type: String,
      required: true,
      trim: true
    },
    userAgent: {
      type: String,
      trim: true,
      maxlength: 512,
      default: "unknown"
    },
    deviceFingerprint: {
      type: String,
      required: true,
      trim: true
    },
    deviceId: {
      type: String,
      trim: true
    },
    mfaRequired: {
      type: Boolean,
      default: false
    },
    mfaVerified: {
      type: Boolean,
      default: false
    },
    mfaVerifiedAt: {
      type: Date
    },
    deviceBound: {
      type: Boolean,
      default: true
    },
    sessionRiskScore: {
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
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },
    issuedAt: {
      type: Date,
      required: true,
      default: Date.now
    },
    expiresAt: {
      type: Date,
      required: true
    },
    lastSeenAt: {
      type: Date,
      default: Date.now
    },
    revokedAt: {
      type: Date
    },
    revokedReason: {
      type: String,
      trim: true,
      maxlength: 128
    },
    anomalyFlags: {
      type: [String],
      default: []
    }
  },
  {
    bufferCommands: false,
    strict: "throw",
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform: (doc, ret) => {
        delete ret.tokenHash;
        delete ret.deviceFingerprint;
        return ret;
      }
    }
  }
);

authSessionSchema.plugin(encryptedFieldsPlugin, {
  fields: ["tokenHash", "deviceFingerprint", "ipAddress"]
});

authSessionSchema.index({ userId: 1, isActive: 1, expiresAt: -1 });
authSessionSchema.index({ userId: 1, refreshTokenFamilyId: 1 });
authSessionSchema.index({ userId: 1, deviceId: 1, isActive: 1 });
authSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 86400 });

module.exports = mongoose.model("AuthSession", authSessionSchema);
