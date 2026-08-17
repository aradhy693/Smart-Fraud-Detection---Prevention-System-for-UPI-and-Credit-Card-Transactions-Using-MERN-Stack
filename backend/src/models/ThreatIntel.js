const mongoose = require("mongoose");
const { blindIndex } = require("../security/cryptoUtils");
const { encryptedFieldsPlugin } = require("../security/encryptionService");

const threatIntelSchema = new mongoose.Schema(
  {
    ipAddress: {
      type: String,
      required: true,
      trim: true,
      select: false
    },
    ipHash: {
      type: String,
      required: true,
      trim: true,
      index: true,
      select: false
    },
    eventType: {
      type: String,
      enum: [
        "IP_REPUTATION",
        "HIGH_THREAT_IP",
        "VPN_LOGIN",
        "TOR_DETECTION",
        "IMPOSSIBLE_TRAVEL",
        "CRITICAL_FRAUD",
        "THREAT_ALERT"
      ],
      default: "IP_REPUTATION",
      index: true
    },
    score: {
      type: Number,
      required: true,
      min: 0,
      max: 100,
      index: true
    },
    level: {
      type: String,
      enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
      default: "LOW",
      index: true
    },
    reasons: {
      type: [String],
      default: []
    },
    flags: {
      type: [String],
      default: []
    },
    country: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "Unknown",
      index: true
    },
    countryCode: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 3
    },
    city: {
      type: String,
      trim: true,
      maxlength: 100,
      default: "Unknown"
    },
    latitude: Number,
    longitude: Number,
    timezone: {
      type: String,
      trim: true,
      maxlength: 120
    },
    asn: {
      type: String,
      trim: true,
      maxlength: 120
    },
    isp: {
      type: String,
      trim: true,
      maxlength: 200
    },
    organization: {
      type: String,
      trim: true,
      maxlength: 200
    },
    provider: {
      type: String,
      trim: true,
      maxlength: 80,
      default: "local"
    },
    vpn: {
      type: Boolean,
      default: false,
      index: true
    },
    tor: {
      type: Boolean,
      default: false,
      index: true
    },
    proxy: {
      type: Boolean,
      default: false,
      index: true
    },
    hosting: {
      type: Boolean,
      default: false,
      index: true
    },
    malicious: {
      type: Boolean,
      default: false,
      index: true
    },
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
      type: Date,
      default: Date.now,
      index: true
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    }
  },
  {
    bufferCommands: false,
    strict: "throw",
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform: (doc, ret) => {
        delete ret.ipHash;
        return ret;
      }
    }
  }
);

threatIntelSchema.pre("validate", function setIpBlindIndex(next) {
  if (this.ipAddress && !this.ipHash) {
    this.ipHash = blindIndex(this.ipAddress, "threat-ip");
  }
  next();
});

threatIntelSchema.plugin(encryptedFieldsPlugin, {
  fields: ["ipAddress", { path: "metadata", type: "json" }]
});

threatIntelSchema.index({ country: 1, score: -1 });
threatIntelSchema.index({ checkedAt: -1, level: 1 });

module.exports = mongoose.model("ThreatIntel", threatIntelSchema);
