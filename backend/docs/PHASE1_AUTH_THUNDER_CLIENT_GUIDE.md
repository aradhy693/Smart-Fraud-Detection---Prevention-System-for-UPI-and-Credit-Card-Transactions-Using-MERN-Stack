# Phase 1 Auth Hardening Thunder Client Guide

Base URL: `http://localhost:5000`

Use a dedicated test account when exercising lockouts so a real admin is not temporarily blocked.

## 1. Password Strength Feedback

Request:

`POST http://localhost:5000/api/auth/password-strength`

Body:

```json
{
  "password": "weak"
}
```

Expected: `200 OK`, `passwordStrength.valid` is `false`, and `feedback` lists missing requirements.

Repeat with:

```json
{
  "password": "StrongPass123!"
}
```

Expected: `passwordStrength.valid` is `true`.

## 2. Elevated Role Registration

Request:

`POST http://localhost:5000/api/auth/register`

Headers:

`X-Admin-Registration-Key: 9bf1356a8e074dd89c7f4f881cb3ed25`

Body:

```json
{
  "name": "SOC Analyst",
  "email": "soc.analyst@example.com",
  "password": "StrongPass123!",
  "role": "analyst"
}
```

Expected: `201 Created`, a JWT in `token`, and `user.role` equals `analyst`.

Repeat with `role` set to `security-operator` and `admin` to verify each elevated role. Remove or alter the admin-registration key to confirm the API returns `403`.

## 3. Login And Session Creation

Request:

`POST http://localhost:5000/api/auth/login`

Body:

```json
{
  "email": "soc.analyst@example.com",
  "password": "StrongPass123!"
}
```

Expected: `200 OK`, a JWT in `token`, and a matching document in MongoDB Atlas `authsessions`.

Copy the returned JWT. In Thunder Client, open the request Authorization tab, choose `Bearer`, and paste that JWT.

## 4. JWT Verification

Request:

`GET http://localhost:5000/api/auth/me`

Authorization: `Bearer` token copied from the login response.

Expected: `200 OK` and the authenticated user.

Now change the last character of the token and resend.

Expected: `401 Unauthorized` with `error.code` equal to `INVALID_TOKEN`.

## 5. Brute Force And Lockout

Create a disposable user:

`POST http://localhost:5000/api/auth/register`

Body:

```json
{
  "name": "Lockout Test",
  "email": "lockout.test@example.com",
  "password": "StrongPass123!",
  "role": "user"
}
```

Send this login request five times:

`POST http://localhost:5000/api/auth/login`

```json
{
  "email": "lockout.test@example.com",
  "password": "WrongPass123!"
}
```

Expected: the fifth failure returns `423 Locked` with `error.code` equal to `ACCOUNT_LOCKED`. MongoDB Atlas `users` should show `accountLockedUntil`, and `auditlogs` should include `LOGIN_FAILED` and `LOGIN_BLOCKED`.

## 6. User And IP Throttling

Send repeated login attempts against the same email or from the same client IP.

Expected after the configured threshold: `429 Too Many Requests` with `error.code` equal to `TOO_MANY_ATTEMPTS`. MongoDB Atlas `loginthrottles` should show the active throttle and progressive `offenseCount`.

## 7. RBAC Checks

Use an analyst token:

`GET http://localhost:5000/api/fraud/stats`

Expected: `200 OK`.

Use the same analyst token:

`PATCH http://localhost:5000/api/fraud/alerts/507f1f77bcf86cd799439099`

Body:

```json
{
  "status": "REVIEWING"
}
```

Expected: `403 Forbidden` with `INSUFFICIENT_PERMISSIONS`.

Use a `security-operator` or `admin` token for the same PATCH request.

Expected: status update succeeds if the alert ID exists.

Use a normal `user` token against:

`GET http://localhost:5000/api/transactions/admin/dashboard`

Expected: `403 Forbidden` with `INSUFFICIENT_PERMISSIONS`.

## 8. Logout Invalidation

Request:

`POST http://localhost:5000/api/auth/logout`

Authorization: `Bearer` token copied from the login response.

Expected: `200 OK` and the matching `authsessions` document is marked inactive.

Send `GET /api/auth/me` again with the same JWT.

Expected: `401 Unauthorized` with `SESSION_EXPIRED` or `INVALID_TOKEN`.

## 9. Audit Collections

Verify these MongoDB Atlas collections after the tests:

`auditlogs`

`authsessions`

`loginthrottles`

`users`

Important audit events to confirm: `LOGIN_SUCCESS`, `LOGIN_FAILED`, `LOGIN_BLOCKED`, `LOGOUT`, `TOKEN_FAILURE`, `SUSPICIOUS_AUTH`, and `ADMIN_ACTION`.
