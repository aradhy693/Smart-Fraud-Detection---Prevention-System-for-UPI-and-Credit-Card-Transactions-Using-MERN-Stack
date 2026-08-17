require("./config/env");

const express = require("express");
const cors = require("cors");
const helmet = require("helmet");
const morgan = require("morgan");

const authRoutes = require("./routes/authRoutes");
const aiPlatformRoutes = require("./routes/aiPlatformRoutes");
const transactionRoutes = require("./routes/transactionRoutes");
const fraudRoutes = require("./routes/fraudRoutes");
const errorHandler = require("./middleware/errorMiddleware");
const notFoundMiddleware = require("./middleware/notFoundMiddleware");
const requestSanitizer = require("./middleware/requestSanitizer");
const { authSecurityContext } = require("./middleware/authSecurityMiddleware");
const {
  csrfProtection,
  ensureCsrfTokenCookie
} = require("./middleware/csrfMiddleware");
const { apiLimiter } = require("./middleware/rateLimitMiddleware");

const app = express();

const parseAllowedOrigins = () => {
  const configuredOrigins = process.env.CORS_ORIGINS || process.env.FRONTEND_URL || "";
  const defaults = ["http://localhost:5174", "http://127.0.0.1:5174"];
  return [...new Set([
    ...configuredOrigins
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean),
    ...defaults
  ])];
};

const allowedOrigins = parseAllowedOrigins();
const corsOptions = {
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    if (allowedOrigins.length === 0 && process.env.NODE_ENV !== "production") {
      callback(null, true);
      return;
    }

    callback(null, false);
  },
  credentials: true,
  methods: ["GET", "POST", "PATCH", "OPTIONS"],
  allowedHeaders: [
    "Content-Type",
    "Authorization",
    "X-Admin-Registration-Key",
    "X-CSRF-Token",
    "X-Device-Fingerprint",
    "X-Device-Id",
    "X-Device-Metadata",
    "X-Network-Risk"
  ]
};

app.disable("x-powered-by");
app.set("trust proxy", 1);

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(helmet());
app.use(express.json({ limit: "100kb" }));
app.use(express.urlencoded({ extended: false, limit: "50kb" }));
app.use(requestSanitizer);
app.use(authSecurityContext);
app.use(ensureCsrfTokenCookie);
app.use(csrfProtection);

if (process.env.NODE_ENV !== "test") {
  app.use(morgan("combined"));
}

app.use((req, res, next) => {
  req.io = req.app.get("io") || null;
  next();
});

app.get("/", (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Smart Fraud Detection API Running"
  });
});

app.use("/api", apiLimiter);
app.use("/api/auth", authRoutes);
app.use("/api/ai", aiPlatformRoutes);
app.use("/api/transactions", transactionRoutes);
app.use("/api/fraud", fraudRoutes);

app.use(notFoundMiddleware);
app.use(errorHandler);

module.exports = app;
