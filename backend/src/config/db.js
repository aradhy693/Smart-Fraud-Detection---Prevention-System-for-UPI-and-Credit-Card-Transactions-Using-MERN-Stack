const mongoose = require("mongoose");
const { getRequiredEnv } = require("./env");
const logger = require("../utils/logger");

const connectDB = async () => {
  const mongoUri = getRequiredEnv("MONGO_URI");

  mongoose.set("strictQuery", true);

  const connection = await mongoose.connect(mongoUri, {
    serverSelectionTimeoutMS: Number(process.env.MONGO_SERVER_SELECTION_TIMEOUT_MS || 10000)
  });

  logger.info("MongoDB connected successfully", {
    host: connection.connection.host,
    database: connection.connection.name
  });

  return connection;
};

module.exports = connectDB;
