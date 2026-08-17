const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const { encryptedFieldsPlugin } = require("../security/encryptionService");
const { ALL_ROLES } = require("../security/roles");

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, "Name is required"],
      trim: true,
      minlength: 2,
      maxlength: 100
    },
    email: {
      type: String,
      required: [true, "Email is required"],
      unique: true,
      lowercase: true,
      trim: true,
      match: [/^\S+@\S+\.\S+$/, "Please provide a valid email address"]
    },
    password: {
      type: String,
      required: [true, "Password is required"],
      minlength: 12,
      select: false
    },
    role: {
      type: String,
      enum: ALL_ROLES,
      default: "user"
    },
    failedLoginAttempts: {
      type: Number,
      default: 0,
      min: 0
    },
    accountLockoutCount: {
      type: Number,
      default: 0,
      min: 0
    },
    accountLockedUntil: {
      type: Date,
      default: null
    },
    suspiciousLoginFlag: {
      type: Boolean,
      default: false
    },
    mfaEnabled: {
      type: Boolean,
      default: false
    },
    mfaSecretEncrypted: {
      type: String,
      select: false
    },
    mfaPendingSecretEncrypted: {
      type: String,
      select: false
    },
    recoveryCodes: {
      type: [
        {
          codeHash: {
            type: String,
            required: true,
            select: false
          },
          usedAt: {
            type: Date
          },
          createdAt: {
            type: Date,
            default: Date.now
          }
        }
      ],
      default: [],
      select: false
    },
    lastSuccessfulMfa: {
      type: Date
    },
    mfaFailedAttempts: {
      type: Number,
      default: 0,
      min: 0
    },
    mfaLockedUntil: {
      type: Date
    },
    passwordChangedAt: {
      type: Date
    },
    lastFailedLoginAt: {
      type: Date
    },
    lastLoginAt: {
      type: Date
    },
    lastLoginIp: {
      type: String,
      trim: true
    },
    lastLoginUserAgent: {
      type: String,
      trim: true,
      maxlength: 512
    },
    knownLoginIps: {
      type: [
        {
          ipAddress: {
            type: String,
            required: true,
            trim: true
          },
          firstSeenAt: {
            type: Date,
            default: Date.now
          },
          lastSeenAt: {
            type: Date,
            default: Date.now
          },
          loginCount: {
            type: Number,
            default: 1,
            min: 1
          }
        }
      ],
      default: []
    }
  },
  {
    strict: "throw",
    timestamps: true,
    versionKey: false,
    toJSON: {
      transform: (doc, ret) => {
        delete ret.password;
        delete ret.failedLoginAttempts;
        delete ret.accountLockoutCount;
        delete ret.accountLockedUntil;
        delete ret.suspiciousLoginFlag;
        delete ret.mfaSecretEncrypted;
        delete ret.mfaPendingSecretEncrypted;
        delete ret.recoveryCodes;
        delete ret.mfaFailedAttempts;
        delete ret.mfaLockedUntil;
        delete ret.lastFailedLoginAt;
        delete ret.lastLoginIp;
        delete ret.lastLoginUserAgent;
        delete ret.knownLoginIps;
        return ret;
      }
    }
  }
);

userSchema.plugin(encryptedFieldsPlugin, {
  fields: [
    { path: "mfaSecretEncrypted", aad: "mfa-secret" },
    { path: "mfaPendingSecretEncrypted", aad: "mfa-secret" },
    "recoveryCodes.codeHash",
    "lastLoginIp",
    "knownLoginIps.ipAddress"
  ]
});

userSchema.index({ role: 1 });
userSchema.index({ accountLockedUntil: 1 });
userSchema.index({ mfaEnabled: 1 });
userSchema.index({ "knownLoginIps.ipAddress": 1 });

userSchema.pre("save", async function (next) {
  if (!this.isModified("password")) {
    return next();
  }

  try {
    const configuredRounds = Number(process.env.BCRYPT_SALT_ROUNDS || 12);
    const saltRounds = Number.isInteger(configuredRounds) && configuredRounds >= 12 ? configuredRounds : 12;
    this.password = await bcrypt.hash(this.password, saltRounds);
    next();
  } catch (error) {
    next(error);
  }
});

userSchema.methods.comparePassword = async function (enteredPassword) {
  if (!enteredPassword || !this.password) {
    return false;
  }

  return bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model("User", userSchema);
