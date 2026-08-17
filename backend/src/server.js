const { validateStartupEnv } = require("./config/env");

validateStartupEnv();

const http = require("http");
const app = require("./app");
const connectDB = require("./config/db");
const { initSocket } = require("./config/socket");
const logger = require("./utils/logger");

const server = http.createServer(app);
const io = initSocket(server);
app.set("io", io);

const PORT = process.env.PORT || 5000;

const startServer = async () => {
  try {
    validateStartupEnv();
    await connectDB();

    server.listen(PORT, () => {
      logger.info("Server started", { port: PORT });
    });
  } catch (error) {
    logger.error("Server startup failed", {
      message: error.message,
      stack: error.stack
    });
    process.exit(1);
  }
};

if (require.main === module) {
  startServer();
}

process.on("unhandledRejection", (error) => {
  logger.error("Unhandled promise rejection", {
    message: error.message,
    stack: error.stack
  });

  server.close(() => {
    process.exit(1);
  });
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught exception", {
    message: error.message,
    stack: error.stack
  });
  process.exit(1);
});

module.exports = {
  app,
  io,
  server,
  startServer
};
