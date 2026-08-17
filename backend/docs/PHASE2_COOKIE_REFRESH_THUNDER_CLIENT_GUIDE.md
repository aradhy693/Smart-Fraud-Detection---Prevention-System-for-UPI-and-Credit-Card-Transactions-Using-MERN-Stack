# Phase 2 Cookie Auth And Refresh Rotation Thunder Client Guide

Base URL: `http://localhost:5000`

Thunder Client stores response cookies automatically when cookies are enabled. Keep the same Thunder Client collection or environment while running the flow so the `sfd_access_token` and `sfd_refresh_token` cookies are reused.

## 1. Login Sets HTTP-Only Cookies

Request:

`POST http://localhost:5000/api/auth/login`

Body:

```json
{
  "email": "soc.analyst@example.com",
  "password": "StrongPass123!"
}
```

Expected:

`200 OK`

Response body includes `success`, `message`, `token`, and `user` for backward compatibility.

Response cookies include:

`sfd_access_token`

`sfd_refresh_token`

Both cookies should show `HttpOnly` and `SameSite=Strict`. In production, or when `COOKIE_SECURE=true`, they also show `Secure`.

## 2. Protected Route Uses Cookie Auth

Request:

`GET http://localhost:5000/api/auth/me`

Do not add an Authorization header. Let Thunder Client send the cookies from login.

Expected:

`200 OK` with the authenticated user.

## 3. Refresh Rotates Tokens

Request:

`POST http://localhost:5000/api/auth/refresh`

Expected:

`200 OK`

Thunder Client receives a new `sfd_access_token` and a new `sfd_refresh_token`.

MongoDB Atlas checks:

`refreshtokens` contains the old token record with `usedAt`, `revokedAt`, and `revokedReason: "ROTATED"`.

`refreshtokens` contains the new active token record with the same `familyId`, `parentTokenId` set to the old token id, and an incremented `rotationCounter`.

`authsessions` has the new `tokenId`, `tokenHash`, and `currentRefreshTokenId`.

## 4. Replay Attack Detection

After a successful refresh, reuse the previous `sfd_refresh_token` value in a new request.

Request:

`POST http://localhost:5000/api/auth/refresh`

Cookie header:

`sfd_refresh_token=previous-refresh-token-value`

Expected:

`401 Unauthorized` with `error.code` equal to `INVALID_TOKEN`.

MongoDB Atlas checks:

Every token in the reused token family is revoked.

The matching `authsessions` document is inactive with `revokedReason: "REFRESH_TOKEN_REUSE"`.

`auditlogs` contains a `SUSPICIOUS_AUTH` event with critical severity.

## 5. Expired Access Token Recovery

Set `ACCESS_TOKEN_EXPIRES_IN=30s` in `backend/.env`, restart the backend, then log in.

Wait longer than 30 seconds.

Request:

`GET http://localhost:5000/api/auth/me`

Expected for Thunder Client without frontend retry:

`401 Unauthorized` with `SESSION_EXPIRED`.

Now request:

`POST http://localhost:5000/api/auth/refresh`

Expected:

`200 OK` with fresh cookies.

Repeat:

`GET http://localhost:5000/api/auth/me`

Expected:

`200 OK`.

The React frontend does this refresh and retry step automatically through the Axios interceptor.

## 6. Device Mismatch Detection

Login with this header:

`X-Device-Fingerprint: trusted-browser-1`

Refresh once with the same header.

Expected:

`200 OK`.

Refresh again with:

`X-Device-Fingerprint: different-device`

Expected:

`401 Unauthorized`.

MongoDB Atlas checks:

The token family is revoked with `revokedReason: "REFRESH_DEVICE_MISMATCH"`.

`auditlogs` contains `SUSPICIOUS_AUTH`.

## 7. Logout Clears Cookies And Revokes Session

Request:

`POST http://localhost:5000/api/auth/logout`

Expected:

`200 OK`.

Response clears both `sfd_access_token` and `sfd_refresh_token`.

MongoDB Atlas checks:

`authsessions` matching the login is inactive with `revokedReason: "USER_LOGOUT"`.

The refresh token family is revoked with `revokedReason: "USER_LOGOUT"`.

Repeat:

`GET http://localhost:5000/api/auth/me`

Expected:

`401 Unauthorized`.

## 8. Socket.io Cookie Auth

Use the React frontend after login.

Expected:

The Socket.io client connects with browser cookies, joins the `admin-dashboard` room for `admin`, `analyst`, or `security-operator`, and rejects revoked or expired sessions.

Bearer token socket auth is still supported for non-browser clients through `auth.token`.
