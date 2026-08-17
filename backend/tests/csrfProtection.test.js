const express = require("express");
const request = require("supertest");

const errorHandler = require("../src/middleware/errorMiddleware");
const {
  csrfProtection,
  ensureCsrfTokenCookie
} = require("../src/middleware/csrfMiddleware");
const { createCsrfToken, CSRF_COOKIE_NAME } = require("../src/security/csrf");

const buildApp = () => {
  const app = express();
  app.use(express.json());
  app.use(ensureCsrfTokenCookie);
  app.use(csrfProtection);
  app.post("/api/protected", (_req, res) => res.status(200).json({ success: true }));
  app.use(errorHandler);
  return app;
};

describe("CSRF protection", () => {
  test("allows a cookie-authenticated mutating request with a valid CSRF token", async () => {
    const app = buildApp();
    const csrfToken = createCsrfToken();

    const response = await request(app)
      .post("/api/protected")
      .set("Cookie", [`sfd_access_token=access-token`, `${CSRF_COOKIE_NAME}=${csrfToken}`])
      .set("X-CSRF-Token", csrfToken)
      .send({ action: "valid" })
      .expect(200);

    expect(response.body.success).toBe(true);
  });

  test("rejects a cookie-authenticated mutating request when the CSRF token is missing", async () => {
    const app = buildApp();

    const response = await request(app)
      .post("/api/protected")
      .set("Cookie", ["sfd_access_token=access-token"])
      .send({ action: "missing" })
      .expect(403);

    expect(response.body.error.code).toBe("CSRF_TOKEN_MISSING");
  });

  test("rejects a cookie-authenticated mutating request when the CSRF token is invalid", async () => {
    const app = buildApp();
    const csrfToken = createCsrfToken();

    const response = await request(app)
      .post("/api/protected")
      .set("Cookie", [`sfd_access_token=access-token`, `${CSRF_COOKIE_NAME}=${csrfToken}`])
      .set("X-CSRF-Token", "tampered-token")
      .send({ action: "invalid" })
      .expect(403);

    expect(response.body.error.code).toBe("CSRF_TOKEN_INVALID");
  });

  test("does not require CSRF tokens for bearer-token API clients", async () => {
    const app = buildApp();

    const response = await request(app)
      .post("/api/protected")
      .set("Authorization", "Bearer api-client-token")
      .set("Cookie", ["sfd_access_token=browser-cookie"])
      .send({ action: "bearer" })
      .expect(200);

    expect(response.body.success).toBe(true);
  });
});
