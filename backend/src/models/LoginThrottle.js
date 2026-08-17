const mongoose = require("mongoose");

const loginThrottleSchema = new mongoose.Schema(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },
    scope: {
      type: String,
      required: true,
      enum: ["ip", "user"]
    },
    email: {
      type: String,
      trim: true,
      lowercase: true
    },
    ipAddress: {
      type: String,
      trim: true
    },
    attempts: {
      type: Number,
      default: 0,
      min: 0
    },
    offenseCount: {
      type: Number,
      default: 0,
      min: 0
    },
    lockUntil: {
      type: Date
    },
    firstAttemptAt: {
      type: Date
    },
    lastAttemptAt: {
      type: Date
    },
    lastFailureReason: {
      type: String,
      trim: true,
      maxlength: 128
    }
  },
  {
    bufferCommands: false,
    strict: "throw",
    timestamps: true,
    versionKey: false
  }
);

loginThrottleSchema.index({ scope: 1, lockUntil: 1 });
loginThrottleSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 86400 });

module.exports = mongoose.model("LoginThrottle", loginThrottleSchema);
