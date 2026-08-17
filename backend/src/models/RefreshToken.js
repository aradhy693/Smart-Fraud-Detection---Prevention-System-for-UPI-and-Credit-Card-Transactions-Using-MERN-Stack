const mongoose = require("mongoose");
const { encryptedFieldsPlugin } = require("../security/encryptionService");

const refreshTokenSchema = new mongoose.Schema(
  {
    tokenId: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    familyId: {
      type: String,
      required: true,
      index: true,
      trim: true
    },
    sessionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "AuthSession",
      required: true,
      index: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    tokenHash: {
      type: String,
      required: true,
      select: false
    },
    parentTokenId: {
      type: String,
      trim: true
    },
    replacedByTokenId: {
      type: String,
      trim: true
    },
    rotationCounter: {
      type: Number,
      default: 0,
      min: 0
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true
    },
    issuedAt: {
      type: Date,
      default: Date.now,
      required: true
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true
    },
    usedAt: {
      type: Date
    },
    revokedAt: {
      type: Date
    },
    revokedReason: {
      type: String,
      trim: true,
      maxlength: 128
    },
    reuseDetectedAt: {
      type: Date
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
    }
  },
  {
    bufferCommands: false,
    strict: "throw",
    timestamps: true,
    versionKey: false
  }
);

refreshTokenSchema.plugin(encryptedFieldsPlugin, {
  fields: ["tokenHash", "deviceFingerprint", "ipAddress"]
});

refreshTokenSchema.index({ familyId: 1, tokenId: 1 }, { unique: true });
refreshTokenSchema.index({ userId: 1, familyId: 1, isActive: 1 });
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 86400 });

module.exports = mongoose.model("RefreshToken", refreshTokenSchema);
