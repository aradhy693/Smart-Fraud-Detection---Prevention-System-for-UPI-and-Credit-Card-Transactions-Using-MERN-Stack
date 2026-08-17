module.exports = {
  testEnvironment: "node",
  clearMocks: true,
  restoreMocks: true,
  testMatch: ["**/tests/**/*.test.js"],
  collectCoverageFrom: ["src/**/*.js", "!src/server.js"],
  setupFilesAfterEnv: ["<rootDir>/tests/setupTests.js"]
};
