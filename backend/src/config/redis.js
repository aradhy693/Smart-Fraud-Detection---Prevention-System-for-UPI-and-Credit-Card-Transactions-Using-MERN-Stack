const redisConfig = {
  url: process.env.REDIS_URL || "redis://localhost:6379"
};

module.exports = redisConfig;
