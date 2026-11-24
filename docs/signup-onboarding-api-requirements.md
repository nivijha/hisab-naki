# Signup and first-business onboarding API

This document describes the backend implementation added for self-service phone signup and first-shop creation. It supersedes the earlier proposed contracts below. The endpoints are implemented in source but are **not live-verified** until the migration is applied and a delivery provider is configured.

## Account registration

### `POST /api/auth/register`

Public, JSON body (strict; unknown fields are rejected):

```json
{ "name": "Shopkeeper name", "phone": "9876543210", "password": "at-least-eight-characters" }
```

- `name`: trimmed, 2-100 characters.
- `phone`: required Indian mobile number or E.164 number; Indian 10-digit input and leading `0` are normalized to `+91`.
- `password`: 8-128 characters; stored with the existing scrypt password hasher.
- Email signup is not supported because the current schema has no email-verification flow.
- `202 { ok: true, data: { maskedPhone, expiresAt, verificationRequired: true } }` is returned after code delivery.
- `400` validation, `409` duplicate/pending phone (same generic response to reduce account enumeration), `429` rate limit, `503` unavailable code delivery or missing verification configuration.
- OTPs are never returned to the caller or logged.

### `POST /api/auth/register/resend`

Public JSON body: `{ "phone": "..." }`. Returns generic `202 { ok: true, data: { message } }`, whether or not a pending signup exists. When a valid pending challenge exists, a new code supersedes the prior code. Resend is rate-limited. Delivery failure returns `503` and can be retried by requesting another code.

### `POST /api/auth/register/verify`

Public JSON body: `{ "phone": "...", "code": "123456" }`.

- Success: `200 { ok: true, data: { verified: true } }`.
- Invalid, expired, consumed, or exhausted challenge: `400 { ok: false, message: "The verification code is invalid or expired. Request a new code." }`.
- A successful verification creates the user with `phoneVerifiedAt`, consumes the challenge, and clears pending name/password-hash material in one database transaction.
- OTP lifetime is 10 minutes, with at most five verification attempts.
- Verification does not log the user in. The client follows with the existing `POST /api/auth/login` and then selects/creates a business.

The OTP hash uses HMAC-SHA256 with `OTP_HASH_SECRET` (or `JWT_SECRET` as fallback, at least 32 characters). Delivery requires `OTP_DELIVERY_URL` and `OTP_DELIVERY_TOKEN`; optional `OTP_DELIVERY_CHANNEL=WHATSAPP` selects WhatsApp, otherwise SMS. The configured gateway receives an authenticated POST with `{ to, channel, template, code, expiresInSeconds }`. Production delivery URLs must use HTTPS. The gateway itself must deliver the code securely and must not retain or expose it beyond its delivery purpose.

Signup rate limits are in-memory per process/IP: defaults are 5 registrations, 3 resends and 10 verification attempts per 15 minutes, configurable with the `SIGNUP_*_RATE_LIMIT_*` variables. Multi-instance deployments require shared rate limiting before production use.

## First business creation

### `POST /api/businesses`

Requires `Authorization: Bearer <JWT>` but **does not** require `X-Business-ID`; a user with no active membership cannot supply a business context. Browser clients must be allowed to send `Idempotency-Key` by CORS.

Headers: `Idempotency-Key: <8-128 characters>`.

Strict JSON body: `{ "name": "Shop name" }` (`name` trimmed, 2-120 characters).

- User must exist and have a verified phone (`phoneVerifiedAt`); otherwise `401` or `403`.
- Only the first active business is created through this onboarding endpoint. Existing active membership returns `409`.
- Business and active `OWNER` membership are inserted atomically; identifiers are server-generated.
- First success: `201 { ok: true, data: { business: { id, name, currency }, membership: { membershipId, businessId, role: "OWNER", status: "ACTIVE" }, replayed: false } }`.
- Same user/key/same normalized name retry: `200` with the original business and membership and `replayed: true`.
- Reusing a key with a different name: `409`.
- Existing active membership or competing setup: `409`; invalid body/key: `400`; unauthenticated: `401`; unverified phone: `403`; rate limit: `429`.

Clients must retain and reuse the same idempotency key after a network timeout. Do not retry with a new key when the result is unknown; first retrieve memberships or retry with the original key. The database migration adds `BusinessCreationRequest` for durable idempotency records.

## Persistence and deployment requirements

Migration `20261123130000_signup_onboarding` adds pending signup fields to `OtpChallenge` and the idempotent business creation table. Apply it through the backend team's normal migration process before deploying these routes. The current workspace's isolated staging database was unreachable at `127.0.0.1:55432`, so the migration and endpoints have not been exercised against PostgreSQL in this run.

The Prisma schema validates, but Prisma client regeneration was blocked because Windows could not replace a locked query-engine DLL. The implementation uses tagged SQL for newly added fields/table and existing Prisma delegates for existing models. Stop the backend process and regenerate the client before release as a consistency check.

No registration, email verification, password reset, refresh token, JWT revocation, or automatic login API is provided. Existing login and membership contracts remain unchanged. Signup and business-creation route rate limits are process-local and should be backed by shared infrastructure in a multi-instance production deployment.
