const mongoose = require("mongoose");
const { encryptedFieldsPlugin } = require("../security/encryptionService");

const severityLevels = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const priorityLevels = ["P4", "P3", "P2", "P1"];
const statuses = ["OPEN", "ASSIGNED", "INVESTIGATING", "RESOLVED", "CLOSED", "FALSE_POSITIVE"];
const classifications = [
  "FRAUD",
  "ACCOUNT_TAKEOVER",
  "MALICIOUS_IP",
  "DEVICE_COMPROMISE",
  "IMPOSSIBLE_TRAVEL",
  "VELOCITY_ATTACK",
  "POLICY_VIOLATION",
  "OTHER"
];
const killChainPhases = [
  "RECONNAISSANCE",
  "WEAPONIZATION",
  "DELIVERY",
  "EXPLOITATION",
  "INSTALLATION",
  "COMMAND_AND_CONTROL",
  "ACTIONS_ON_OBJECTIVES"
];

const timelineSchema = new mongoose.Schema(
  {
    eventType: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120
    },
    message: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000
    },
    actorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {}
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: true, strict: "throw" }
);

const evidenceSchema = new mongoose.Schema(
  {
    evidenceType: {
      type: String,
      enum: ["TRANSACTION", "ALERT", "LOG", "SCREENSHOT", "FILE", "URL", "NOTE", "IOC"],
      default: "LOG"
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 160
    },
    description: {
      type: String,
      trim: true,
      maxlength: 3000
    },
    source: {
      type: String,
      trim: true,
      maxlength: 300
    },
    hash: {
      type: String,
      trim: true,
      maxlength: 128
    },
    collectedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    collectedAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: true, strict: "throw" }
);

const noteSchema = new mongoose.Schema(
  {
    body: {
      type: String,
      required: true,
      trim: true,
      maxlength: 5000
    },
    authorUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    createdAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: true, strict: "throw" }
);

const iocSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["IP", "DEVICE", "USER", "TRANSACTION", "UPI_ID", "CARD_TOKEN", "EMAIL", "DOMAIN", "URL", "HASH"],
      required: true
    },
    value: {
      type: String,
      required: true,
      trim: true,
      maxlength: 512
    },
    confidence: {
      type: Number,
      default: 50,
      min: 0,
      max: 100
    },
    firstSeenAt: {
      type: Date,
      default: Date.now
    },
    lastSeenAt: {
      type: Date,
      default: Date.now
    }
  },
  { _id: true, strict: "throw" }
);

const socIncidentSchema = new mongoose.Schema(
  {
    incidentNumber: {
      type: String,
      unique: true,
      index: true
    },
    title: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200
    },
    description: {
      type: String,
      trim: true,
      maxlength: 5000
    },
    status: {
      type: String,
      enum: statuses,
      default: "OPEN",
      index: true
    },
    severity: {
      type: String,
      enum: severityLevels,
      default: "MEDIUM",
      index: true
    },
    priority: {
      type: String,
      enum: priorityLevels,
      default: "P3",
      index: true
    },
    classification: {
      type: String,
      enum: classifications,
      default: "FRAUD",
      index: true
    },
    assignedTo: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true
    },
    createdBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    relatedAlertId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "FraudAlert"
    },
    relatedTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Transaction"
    },
    relatedUserId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User"
    },
    relatedDeviceId: {
      type: String,
      trim: true,
      maxlength: 128
    },
    relatedIpAddress: {
      type: String,
      trim: true,
      maxlength: 64
    },
    mitreTechniques: {
      type: [
        {
          techniqueId: { type: String, trim: true, maxlength: 30 },
          tactic: { type: String, trim: true, maxlength: 100 },
          name: { type: String, trim: true, maxlength: 200 }
        }
      ],
      default: []
    },
    killChainPhase: {
      type: String,
      enum: killChainPhases,
      default: "ACTIONS_ON_OBJECTIVES"
    },
    campaign: {
      name: {
        type: String,
        trim: true,
        maxlength: 160
      },
      campaignId: {
        type: String,
        trim: true,
        maxlength: 120
      }
    },
    iocs: {
      type: [iocSchema],
      default: []
    },
    timeline: {
      type: [timelineSchema],
      default: []
    },
    evidence: {
      type: [evidenceSchema],
      default: []
    },
    notes: {
      type: [noteSchema],
      default: []
    },
    tags: {
      type: [String],
      default: []
    },
    resolvedAt: Date,
    closedAt: Date,
    slaDueAt: Date
  },
  {
    strict: "throw",
    timestamps: true,
    versionKey: false
  }
);

socIncidentSchema.pre("validate", function setIncidentNumber(next) {
  if (!this.incidentNumber) {
    const date = new Date();
    const stamp = date.toISOString().slice(0, 10).replace(/-/g, "");
    const entropy = Math.random().toString(36).slice(2, 8).toUpperCase();
    this.incidentNumber = `INC-${stamp}-${entropy}`;
  }
  next();
});

socIncidentSchema.plugin(encryptedFieldsPlugin, {
  fields: [
    "description",
    "relatedIpAddress",
    "timeline.message",
    { path: "timeline.metadata", type: "json" },
    "evidence.description",
    "evidence.source",
    "notes.body",
    "iocs.value"
  ]
});

socIncidentSchema.index({ status: 1, priority: 1, createdAt: -1 });
socIncidentSchema.index({ severity: 1, createdAt: -1 });
socIncidentSchema.index({ classification: 1, createdAt: -1 });
socIncidentSchema.index({ relatedDeviceId: 1, createdAt: -1 });

module.exports = mongoose.model("SocIncident", socIncidentSchema);
