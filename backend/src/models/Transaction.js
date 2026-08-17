const mongoose = require("mongoose");
const net = require("net");
const generateTransactionId = require("../utils/generateTransactionId");
const { blindIndex } = require("../security/cryptoUtils");
const { encryptedFieldsPlugin } = require("../security/encryptionService");

const locationSchema = new mongoose.Schema(
  {
    city: {
      type: String,
      default: "Unknown",
      trim: true,
      maxlength: 100
    },
    country: {
      type: String,
      default: "Unknown",
      trim: true,
      maxlength: 100
    },
    latitude: {
      type: Number,
      required: [true, "Latitude is required"],
      min: [-90, "Latitude cannot be less than -90"],
      max: [90, "Latitude cannot be greater than 90"]
    },
    longitude: {
      type: Number,
      required: [true, "Longitude is required"],
      min: [-180, "Longitude cannot be less than -180"],
      max: [180, "Longitude cannot be greater than 180"]
    }
  },
  {
    _id: false,
    strict: "throw"
  }
);

const riskSignalsSchema = new mongoose.Schema(
  {
    transactionVelocity: {
      type: Number,
      default: 0,
      min: 0
    },
    ipRisk: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    deviceRisk: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    geoDistance: {
      type: Number,
      default: 0,
      min: 0
    },
    impossibleTravel: {
      type: Boolean,
      default: false
    },
    hourOfDay: {
      type: Number,
      default: 0,
      min: 0,
      max: 23
    },
    repeatedFailures: {
      type: Number,
      default: 0,
      min: 0
    },
    newDeviceFlag: {
      type: Boolean,
      default: false
    },
    threatScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    threatLevel: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      default: "LOW"
    },
    countryRisk: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    geolocationRisk: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    vpnDetected: {
      type: Boolean,
      default: false
    },
    torDetected: {
      type: Boolean,
      default: false
    },
    proxyDetected: {
      type: Boolean,
      default: false
    },
    datacenterIp: {
      type: Boolean,
      default: false
    },
    timezoneMismatch: {
      type: Boolean,
      default: false
    },
    aiServiceAvailable: {
      type: Boolean,
      default: false
    }
  },
  {
    _id: false,
    strict: "throw"
  }
);

const threatIntelSchema = new mongoose.Schema(
  {
    score: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    level: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      default: "LOW"
    },
    reasons: {
      type: [String],
      default: []
    },
    flags: {
      type: [String],
      default: []
    },
    vpn: {
      type: Boolean,
      default: false
    },
    tor: {
      type: Boolean,
      default: false
    },
    proxy: {
      type: Boolean,
      default: false
    },
    hosting: {
      type: Boolean,
      default: false
    },
    asn: {
      type: String,
      trim: true,
      maxlength: 120
    },
    country: {
      type: String,
      trim: true,
      maxlength: 100
    },
    city: {
      type: String,
      trim: true,
      maxlength: 100
    },
    latitude: Number,
    longitude: Number,
    countryRisk: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    timezoneMismatch: {
      type: Boolean,
      default: false
    },
    checkedAt: {
      type: Date
    }
  },
  {
    _id: false,
    strict: "throw"
  }
);

const transactionSchema = new mongoose.Schema(
  {
    transactionReference: {
      type: String,
      default: generateTransactionId,
      unique: true,
      index: true,
      immutable: true
    },
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: false
    },
    amount: {
      type: Number,
      required: [true, "Transaction amount is required"],
      min: [1, "Amount must be greater than zero"],
      max: [10000000, "Amount exceeds the maximum supported transaction limit"]
    },
    paymentMethod: {
      type: String,
      required: true,
      enum: ["UPI", "CREDIT_CARD"]
    },
    identifier: {
      type: String,
      required: [true, "Identifier is required"],
      trim: true,
      minlength: [3, "Identifier must be at least 3 characters"],
      maxlength: [512, "Identifier cannot exceed 512 characters"],
      select: false
    },
    identifierHash: {
      type: String,
      trim: true,
      index: true,
      select: false
    },
    ipAddress: {
      type: String,
      required: [true, "IP address is required"],
      validate: {
        validator: (value) => net.isIP(value) !== 0,
        message: "IP address must be a valid IPv4 or IPv6 address"
      }
    },
    location: {
      type: locationSchema,
      required: [true, "Location is required"]
    },
    deviceId: {
      type: String,
      required: [true, "Device ID is required"],
      trim: true,
      minlength: [3, "Device ID must be at least 3 characters"],
      maxlength: [128, "Device ID cannot exceed 128 characters"]
    },
    fraudScore: {
      type: Number,
      required: true,
      min: 0,
      max: 1
    },
    aiFraudProbability: {
      type: Number,
      default: 0,
      min: 0,
      max: 1
    },
    aiRiskScore: {
      type: Number,
      default: 0,
      min: 0,
      max: 100
    },
    aiDecision: {
      type: String,
      enum: ["ALLOWED", "FLAGGED", "BLOCKED", "UNAVAILABLE"],
      default: "UNAVAILABLE"
    },
    riskLevel: {
      type: String,
      enum: ["LOW_RISK", "MEDIUM_RISK", "HIGH_RISK"],
      default: "LOW_RISK"
    },
    modelVersion: {
      type: String,
      trim: true,
      maxlength: 120,
      default: "rules-fallback"
    },
    status: {
      type: String,
      required: true,
      enum: ["ALLOWED", "FLAGGED_OTP", "BLOCKED"]
    },
    riskReasons: {
      type: Map,
      of: Number,
      default: {}
    },
    riskSignals: {
      type: riskSignalsSchema,
      default: () => ({})
    },
    threatIntel: {
      type: threatIntelSchema,
      default: () => ({})
    }
  },
  {
    strict: "throw",
    timestamps: { createdAt: "timestamp", updatedAt: "updatedAt" },
    versionKey: false
  }
);

transactionSchema.pre("validate", function setIdentifierBlindIndex(next) {
  if (this.identifier && !this.identifierHash) {
    this.identifierHash = blindIndex(this.identifier, "transaction-identifier");
  }
  next();
});

transactionSchema.plugin(encryptedFieldsPlugin, {
  fields: ["identifier"]
});

transactionSchema.index({ userId: 1, timestamp: -1 });
transactionSchema.index({ deviceId: 1, timestamp: -1 });
transactionSchema.index({ ipAddress: 1, timestamp: -1 });
transactionSchema.index({ status: 1, timestamp: -1 });
transactionSchema.index({ riskLevel: 1, timestamp: -1 });
transactionSchema.index({ aiRiskScore: -1, timestamp: -1 });

module.exports = mongoose.model("Transaction", transactionSchema);
