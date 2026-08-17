const mongoose = require("mongoose");
const { encryptedFieldsPlugin } = require("../security/encryptionService");

const socNotificationSchema = new mongoose.Schema(
  {
    incidentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "SocIncident"
    },
    channel: {
      type: String,
      enum: ["SOCKET", "EMAIL", "WEBHOOK", "DESKTOP", "SLACK", "TELEGRAM"],
      required: true,
      index: true
    },
    status: {
      type: String,
      enum: ["QUEUED", "SENT", "FAILED", "SKIPPED"],
      default: "QUEUED",
      index: true
    },
    recipient: {
      type: String,
      trim: true,
      maxlength: 300
    },
    subject: {
      type: String,
      trim: true,
      maxlength: 200
    },
    body: {
      type: String,
      trim: true,
      maxlength: 5000
    },
    providerResponse: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    sentAt: Date,
    failedAt: Date
  },
  {
    strict: "throw",
    timestamps: true,
    versionKey: false
  }
);

socNotificationSchema.plugin(encryptedFieldsPlugin, {
  fields: ["recipient", "body", { path: "providerResponse", type: "json" }]
});

socNotificationSchema.index({ incidentId: 1, createdAt: -1 });
socNotificationSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model("SocNotification", socNotificationSchema);
