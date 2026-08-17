const mongoose = require("mongoose");
const { blindIndex } = require("../security/cryptoUtils");
const { encryptedFieldsPlugin } = require("../security/encryptionService");

const deviceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    deviceId: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    fingerprint: {
      type: String,
      required: true,
      trim: true,
      select: false
    },
    fingerprintHash: {
      type: String,
      trim: true,
      index: true,
      select: false
    },
    browser: {
      type: String,
      trim: true,
      maxlength: 120,
      default: "Unknown"
    },
    os: {
      type: String,
      trim: true,
      maxlength: 120,
      default: "Unknown"
    },
    timezone: {
      type: String,
      trim: true,
      maxlength: 120,
      default: "Unknown"
    },
    screenResolution: {
      type: String,
      trim: true,
      maxlength: 80,
      default: "Unknown"
    },
    language: {
      type: String,
      trim: true,
      maxlength: 40,
      default: "Unknown"
    },
    userAgent: {
      type: String,
      trim: true,
      maxlength: 512,
      default: "Unknown"
    },
    ipAddress: {
      type: String,
      trim: true
    },
    geolocation: {
      city: { type: String, trim: true },
      country: { type: String, trim: true },
      latitude: Number,
      longitude: Number
    },
    firstSeenAt: {
      type: Date,
      default: Date.now
    },
    lastUsed: {
      type: Date,
      default: Date.now,
      index: true
    },
    trusted: {
      type: Boolean,
      default: false,
      index: true
    },
    trustedAt: {
      type: Date
    },
    revokedAt: {
      type: Date
    },
    riskLevel: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH"],
      default: "LOW"
    },
    riskScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    }
  },
  {
    bufferCommands: false,
    strict: "throw",
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform: (doc, ret) => {
        delete ret.fingerprint;
        delete ret.fingerprintHash;
        return ret;
      }
    }
  }
);

deviceSchema.pre("validate", function setFingerprintBlindIndex(next) {
  if (this.fingerprint && !this.fingerprintHash) {
    this.fingerprintHash = blindIndex(this.fingerprint, "device-fingerprint");
  }
  next();
});

deviceSchema.plugin(encryptedFieldsPlugin, {
  fields: ["fingerprint", "ipAddress"]
});

deviceSchema.index({ userId: 1, fingerprintHash: 1 }, { unique: true, sparse: true });

module.exports = mongoose.model("Device", deviceSchema);
