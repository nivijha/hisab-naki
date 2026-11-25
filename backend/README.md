# HisabNaki Backend

Express + TypeScript (ESM/NodeNext) backend with Prisma/PostgreSQL (Neon), JWT authentication and multi-tenant (business) isolation.

## Setup

```bash
npm install                      # from repository root (workspaces)
cp .env.example .env
# set DATABASE_URL and JWT_SECRET (minimum 32 characters)
npx prisma generate --schema prisma/schema.prisma
npx prisma migrate deploy --schema prisma/schema.prisma   # DB owner
npm run prisma:seed              # development data
npm run dev --workspace backend
```

## Environment variables

| Variable | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | PostgreSQL connection |
| `NODE_ENV` | no | Application environment; `mock` OTP delivery only works when this is `development` |
| `OTP_DELIVERY_MODE` | no | `http` (default) uses a real gateway; `mock` logs the OTP in the backend terminal (development only — rejected in production) |
| `JWT_SECRET` | yes (≥32 chars) | HS256 signing secret |
| `JWT_EXPIRES_IN_SECONDS` | no | Access token TTL, default 3600, capped at 86400 |
| `CORS_ORIGIN` | production | Explicit frontend origin; wildcard rejected in production |
| `LOGIN_RATE_LIMIT_MAX` / `_WINDOW_MS` | no | Login limiter defaults 10 / 900000 |
| `SIGNUP_RATE_LIMIT_MAX` / `_WINDOW_MS` | no | Phone-signup register limiter defaults 5 / 900000 |
| `SIGNUP_RESEND_RATE_LIMIT_MAX` / `_WINDOW_MS` | no | Verification-code resend limiter defaults 3 / 900000 |
| `SIGNUP_VERIFY_RATE_LIMIT_MAX` / `_WINDOW_MS` | no | Verification-code confirm limiter defaults 10 / 900000 |
| `AI_RATE_LIMIT_MAX` / `_WINDOW_MS` | no | Interpretation limiter defaults 30 / 60000 |
| `PREVIEW_TTL_MS` | no | Preview TTL, default 900000 (15 min) |
| `DASHBOARD_BUSINESS_NAME` | no | Fallback business name, default `My Business` |
| `OTP_DELIVERY_URL` | no | OTP delivery gateway endpoint — **required** for `POST /api/auth/register` and verify when `OTP_DELIVERY_MODE=http` (signup returns 503 without it) |
| `OTP_DELIVERY_TOKEN` | no | Bearer token for the OTP delivery gateway |
| `OTP_DELIVERY_CHANNEL` | no | Delivery channel `SMS` (default) or `WHATSAPP` |
| `OTP_HASH_SECRET` | yes (≥32 chars) in production | HMAC secret for OTP codes; required in production (no silent `JWT_SECRET` fallback), falls back to `JWT_SECRET` in development |
| `SEED_PASSWORD` | no | Staging seed password; required by `npm run prisma:seed:staging` (staging-only, never commit) |

Never commit real secrets. `SEED_PASSWORD` is staging-only.

## Authentication flow

1. `POST /api/auth/login` with `{ identifier, password }` (email or phone). Returns `{ ok: true, data: { token, tokenType, expiresAt, expiresIn } }`.
2. `POST /api/auth/register` — immediate registration: creates User + Business + OWNER/ACTIVE membership atomically and returns a JWT (see contract).
3. `GET /api/auth/memberships` with `Authorization: Bearer <token>` (no business header needed) returns ACTIVE memberships: `[{ membershipId, businessId, businessName, role, status }]`.
4. Every business request requires **both** `Authorization: Bearer <token>` and `x-business-id: <Business.id>`.
5. Middleware verifies the JWT, resolves an ACTIVE membership for the requested business (business must not be soft-deleted), and attaches `req.auth = { userId, businessId, membershipId, role }`.

Phone signup flow (OTP, mounted for later use): `POST /api/auth/register/resend` + `POST /api/auth/register/verify`; see the signup contracts below.

Roles OWNER/ADMIN/STAFF all have access to current APIs; `role` is retained for future authorization. A suspended or removed membership returns `403`, and unknown/foreign business IDs return `403`.

All success responses: `{ ok: true, data, message?, responseText? }`. Errors: `{ ok: false, message, code?, errors?, retryable? }`.

## API contracts

### Authentication

| Method & URL | Auth | Body | Success | Errors |
|---|---|---|---|---|
| `POST /api/auth/login` | public, rate limited (10/15min per IP) | `{ identifier: string (email or phone), password: string }` | `200 { ok: true, data: { token, tokenType: "Bearer", expiresAt, expiresIn } }` | `400` identifier/password required; `401` invalid credentials; `429` rate limited |
| `POST /api/auth/register` | public, rate limited (5/15min per IP) | `{ name, email, businessName, password, phone? }` | `201 { ok: true, data: RegisterResult }` (below) | `400` duplicate email/phone or invalid input; `429` rate limited |
| `POST /api/auth/register/resend` | public, rate limited (3/15min per IP) | `{ phone }` | `202 { ok: true, data: { message: string } }` | `400` invalid phone; `429` |
| `POST /api/auth/register/verify` | public, rate limited (10/15min per IP) | `{ phone, code }` (6-digit) | `200 { ok: true, data: { verified: true } }` | `400` invalid/expired code; `429` |
| `GET /api/auth/memberships` | Bearer only | – | `200 { ok: true, data: MembershipSummary[] }` | `401` missing/invalid token |

`RegisterResult`:

```json
{
  "ok": true,
  "data": {
    "user": { "id": "string", "name": "string", "email": "string|null", "phone": "string|null", "phoneVerifiedAt": "string|null" },
    "business": { "id": "string", "name": "string", "currency": "string" },
    "membership": { "id": "string", "role": "OWNER", "status": "ACTIVE" },
    "token": "string (JWT)",
    "tokenType": "Bearer",
    "expiresAt": "ISO date",
    "expiresIn": 3600
  }
}
```

Registration rules:

- Validates with Zod: `name` (1–100), `email` (valid format), `businessName` (1–100), `password` (8–128), optional `phone`.
- Checks duplicates before creation: `400` "Email address is already registered." or "Phone number is already registered."
- Passwords are hashed with the existing scrypt implementation; plaintext is never stored and never returned.
- Creates User + Business + OWNER/ACTIVE Membership atomically with Prisma `$transaction`; the token uses the same JWT mechanism as login.

### First business creation

| Method & URL | Auth | Headers | Body | Success | Errors |
|---|---|---|---|---|---|
| `POST /api/businesses` | Bearer only | `Idempotency-Key` (8–128 chars) required | `{ name: string (2–120) }` | `201 { ok: true, data: { business, membership, replayed } }` (200 when replayed) | `400` invalid key/name; `401`; `403` phone not verified; `409` already has an active business or key reused with different name; `429` (10/15min, fixed) |

`CreatedFirstBusiness`: `{ business: { id, name, currency }, membership: { membershipId, businessId, role: "OWNER", status: "ACTIVE" }, replayed: boolean }`.

Notes: requires `user.phoneVerifiedAt` (set by `POST /api/auth/register/verify`); idempotent via the `BusinessCreationRequest` table (`@@unique([userId, idempotencyKey])`) with a Serializable transaction guard.

### Dashboard

| Method & URL | Auth | Body | Success | Errors |
|---|---|---|---|---|
| `GET /api/dashboard/summary` | Bearer + `x-business-id` | – | `200 { ok: true, data: DashboardSummary }` | `401`/`403` |

`DashboardSummary`:

```json
{
  "ok": true,
  "data": {
    "businessName": "Raju General Store",
    "todaysSales": 450.75,
    "todaysExpenses": 0,
    "paymentsReceived": 100.50,
    "newCredit": 0,
    "totalOutstanding": 350.25,
    "recentTransactions": [ { "id": "tx_1", "type": "CREDIT", "amount": "450.75", "...": "full Transaction fields" } ]
  }
}
```

All totals are Decimal-based; "today" uses the server-local current date and only ACTIVE transactions of the selected business.

### Customers

| Method & URL | Auth | Body | Success | Errors |
|---|---|---|---|---|
| `GET /api/customers` | Bearer + `x-business-id` | – | `200 { ok: true, data: CustomerSummary[] }` | `401`/`403` |
| `POST /api/customers` | Bearer + `x-business-id` | `{ name: string, phone?: string }` | `201 { ok: true, data: Customer }` | `400` name required |
| `GET /api/customers/:id` | Bearer + `x-business-id` | – | `200 { ok: true, data: CustomerDetail }` | `404` not found |
| `GET /api/customers/:id/transactions` | Bearer + `x-business-id` | – | `200 { ok: true, data: CustomerDetail }` | `404` |
| `PATCH /api/customers/:id` | Bearer + `x-business-id` | `{ name?: string, phone?: string }` (one required) | `200 { ok: true, data: Customer }` | `400` invalid/empty, `404` not found, `409` name conflict |
| `DELETE /api/customers/:id` | Bearer + `x-business-id` | – | `200 { ok: true, data: { id } }` (soft delete: sets `deletedAt`) | `404` |

`CustomerSummary`: `{ id, name, phone, createdAt, outstandingBalance, transactionCount }`.
`CustomerDetail`: `{ id, name, phone, email, notes, businessId, createdByUserId, createdAt, updatedAt, deletedAt, outstandingBalance, transactions: Transaction[] }`.

Customer name duplicate check is per business; search by name/phone uses the same scoping. All reads are restricted to the authenticated `x-business-id`.

### Transactions

| Method & URL | Auth | Body | Success | Errors |
|---|---|---|---|---|
| `POST /api/transactions` | Bearer + `x-business-id` | write: `{ type, customerName?, customerId?, amount, idempotencyKey?, saleMode?, paymentMethod?, description? }`; read: `{ intent: "GET_BALANCE" \| "GET_TOTAL_OUTSTANDING" \| "GET_TODAY_TRANSACTIONS" \| "GET_CUSTOMER_TRANSACTIONS", customerName? }` | `201 { ok: true, data: { transaction, customer, outstandingBalance }, responseText? }` (write) | `400` validation; `401`/`403`; `409` idempotency reuse with different payload; `404` customer not found |
| `GET /api/transactions` | Bearer + `x-business-id` | – (legacy) or `?page=&limit=&type=&customerId=&from=&to=` (history) | `200 { ok: true, data: Transaction[] }` or `200 { ok: true, data: { transactions, total, page, limit, totalPages } }` | `400` query validation |
| `GET /api/transactions/summary` | Bearer + `x-business-id` | – | same `DashboardSummary` shape as `GET /api/dashboard/summary` | `401`/`403` |
| `GET /api/transactions/:id` | Bearer + `x-business-id` | – | `200 { ok: true, data: { ...Transaction, formattedAmount } }` | `404` |

Transaction write types (all Decimal, amounts must be positive with ≤ 2 decimals):

| Type | Required | Valid extras | Effect on customer outstanding |
|---|---|---|---|
| `CREDIT` | `customerName` or `customerId` | – | + amount |
| `PAYMENT` | `customerName`/`customerId`, `paymentMethod` (CASH/UPI/BANK_TRANSFER/OTHER) | – | − amount |
| `SALE` | `saleMode` (`CASH`/`CREDIT`) | cash: `paymentMethod` required; credit: customer required, no `paymentMethod` | 0 for CASH; + amount for CREDIT |
| `EXPENSE` | `paymentMethod` | no customer | 0 |
| `OPENING_BALANCE` | `customerName`/`customerId`, `openingDirection` (`INCREASE`/`DECREASE`) | no `saleMode`/`paymentMethod` | + amount for INCREASE, − amount for DECREASE |
| `SALE_RETURN` | `customerName`/`customerId` | no `saleMode`/`paymentMethod` | − amount |
| `REFUND` | amount (customer optional) | no `saleMode`/`paymentMethod` | + amount |

Example (the task's example):

```http
POST /api/transactions
Authorization: Bearer <JWT>
x-business-id: <BUSINESS_ID>
Content-Type: application/json

{ "type": "CREDIT", "customerName": "Raju", "amount": 450.75 }
```

Response: `201 { "ok": true, "data": { "transaction": { "id": "...", "type": "CREDIT", "amount": "450.75", ... }, "customer": { "id": "...", "name": "Raju", ... }, "outstandingBalance": 450.75 } }`

Follow with `{ "type": "PAYMENT", "customerName": "Raju", "amount": 100.50, "paymentMethod": "CASH" }` → outstanding `350.25`.

Idempotency: `idempotencyKey` (1–200 chars) is business-scoped. Replaying the same key with the same payload returns the original transaction (`created: false` semantics via `IdempotentCreateResult`); a different payload returns `409`. The unique index `Transaction_businessId_idempotencyKey_key` (migration `20261123120000_transaction_idempotency_unique`) enforces this at the DB level; the service also takes an advisory lock per (business, key).

Read intents are side-effect free: `GET_BALANCE` (with `customerName`) returns `{ ok: true, data: { customerName, outstandingBalance, balanceText } }`, `GET_TOTAL_OUTSTANDING` returns `{ ok: true, data: { totalOutstanding, totalOutstandingText } }`, `GET_TODAY_TRANSACTIONS` and `GET_CUSTOMER_TRANSACTIONS` return transaction arrays.

### Voice (interpretation + preview)

| Method & URL | Auth | Body | Success | Errors |
|---|---|---|---|---|
| `POST /api/ai/interpret` | public, rate limited (30/min per IP) | `{ transcript: string }` | `200 { ok: true, data: ParsedIntent }` | `400` empty transcript |
| `POST /api/preview` | Bearer + `x-business-id` | `{ transcript: string }` | `201 { ok: true, data: TransactionPreview }` | `201` |
| `GET /api/preview/:id` | Bearer + `x-business-id` | – | `200 { ok: true, data: TransactionPreview }` | `404` INVALID_PREVIEW, `410` EXPIRED |
| `POST /api/preview/:id/cancel` | Bearer + `x-business-id` | – | `200 { ok: true, data: TransactionPreview }` (state → `cancelled`) | `409` NOT_CANCELLABLE, `410` EXPIRED, `404` |
| `POST /api/preview/:id/confirm` | Bearer + `x-business-id` | – | `200 { ok: true, data: TransactionPreview, result: { transaction, customer, outstandingBalance } }` (state → `confirmed`) | `400` LOW_CONFIDENCE/MISSING_FIELDS/READ_ONLY_INTENT/NOT_READY, `404` INVALID_PREVIEW, `409` ALREADY_CONFIRMED/CANCELLED/CONTEXT_MISMATCH, `410` EXPIRED, `500` COMMIT_FAILED |

`ParsedIntent`: `{ intent: "ADD_CREDIT" | "RECORD_PAYMENT" | "ADD_SALE" | "ADD_EXPENSE" | "GET_BALANCE" | "GET_TOTAL_OUTSTANDING" | "GET_TODAY_TRANSACTIONS" | "GET_CUSTOMER_TRANSACTIONS", customerName?, amount?, description, confidence, missingFields }`.

Interpretation is deterministic keyword parsing (Hindi/Hinglish/English) with confidence scoring; unknown input falls back to a read-only intent with confidence 0. `TransactionPreview`: `{ id, businessId, createdByUserId, intent, customerName?, amount?, type?, description?, confidence, missingFields, readyForConfirmation, state, createdAt }`.

Voice workflow: interpret → preview (never commits) → confirm (commits via `createTransaction`; duplicate confirmations are prevented by preview state).

### Preview limitations

The preview store is process-local in-memory: previews are lost on restart, concurrency protection is single-process, and multiple backend instances do not share previews. Persistent storage is a separate production improvement.

Implications of the in-memory store:

- A preview created before a restart is lost; the user must request a new preview after the reload.
- If your deployment runs multiple backend instances, a preview created on instance A returns `404` (`INVALID_PREVIEW`) when confirmed on instance B. Render's default is one instance per service; for multi-instance staging, add sticky routing per business or move previews to a shared store (Redis/Postgres) before going to production.

### Frontend integration

The frontend API client (`frontend/lib/api-client.ts`) always sends `Authorization: Bearer` and `X-Business-ID` on business-scoped requests and expects `{ ok: true, data }` success envelopes and `{ ok: false, message }` error envelopes. Staging/production CORS allows the exact frontend origin with `Content-Type`, `Authorization`, and `x-business-id`.

## Idempotency

`Transaction.idempotencyKey` is business-scoped (see `Transaction_businessId_idempotencyKey_key`). `PrismaTransactionRepository.createIdempotent` takes a PostgreSQL advisory transaction lock derived from `(businessId, key)`, checks for an existing row, creates if absent, and handles unique violations by returning the winning row.

## Error handling and logging

Production responses hide stack traces and internal database messages. Structured JSON logs are emitted for authentication failures, transaction creation, preview confirmation, and server errors. Logs never include passwords, JWTs, phone numbers, or secrets (redacted by `src/utils/logger.ts`).

## Staging seed

`prisma/seed-staging.ts` seeds a repeatable, idempotent dataset for the **staging branch only**:

- User: `HisabNaki Test User`, email `staging@hisabnaki.test`, password from `SEED_PASSWORD` (required; staging-only, never commit).
- Businesses: `Raju General Store` (`staging-biz-1`), `Sharma Kirana Store` (`staging-biz-2`).
- Active OWNER memberships in both businesses.
- Synthetic customers + CREDIT/PAYMENT transactions per business.

Idempotency: all writes are upserts on stable IDs and seeded transactions carry `idempotencyKey` (`staging:<businessId>:<id>`), so repeated runs never duplicate users, memberships, customers, or transactions.

Setup and run (against the **staging Neon branch** DATABASE_URL, never the dev DB):

```bash
# 1. Ensure a staging branch exists with its own DATABASE_URL (DB teammate)
# 2. Run migrations on the staging branch
npx prisma migrate deploy --schema prisma/schema.prisma

# 3. Seed (from repository root, with the staging environment active)
SEED_PASSWORD=your-staging-password npm run prisma:seed:staging
# Without SEED_PASSWORD the seed fails with an error; it is never optional.

# 4. Verify: GET /api/auth/login or dashboard totals with the staging credentials
```

Safety rules: never run `prisma:seed` (dev) against staging, or `prisma:seed:staging` against the development database; do not modify or delete development data; do not commit `.env` files or secrets.

## Mock OTP delivery (development only)

For local development you can test the full signup + verification flow without an SMS provider. `MockOtpDelivery` (backend/src/services/auth/otpDelivery.ts) logs the generated code in the **backend terminal** with the phone number masked.

Enable it with:

```bash
NODE_ENV=development
OTP_DELIVERY_MODE=mock
```

(See `.env.example`.)

### How to test the signup flow locally

1. `POST /api/auth/register` — `{ name, phone, password }` → `202/201` with `{ ok: true, data: { maskedPhone, expiresAt, verificationRequired } }`.
2. Check the backend terminal for the code, e.g.:

   `[DEV OTP] Phone: ••••••••1234 | Code: 482913`

3. `POST /api/auth/register/verify` — `{ phone, code }` → `200 { ok: true, data: { verified: true } }`.
4. `POST /api/auth/login` — `{ identifier: phone, password }` → token.

### Security of mock mode

- Mock mode activates only when `NODE_ENV=development` **and** `OTP_DELIVERY_MODE=mock`; `createOtpDelivery()` throws otherwise (no silent fallback to HTTP).
- Startup fails in production when `OTP_DELIVERY_MODE=mock` (`assertOtpDeliveryEnvironment` in `backend/src/server.ts`).
- OTP generation, HMAC hashing, 10-minute expiry, the 5-attempt limit and all rate limits are unchanged.
- Never use mock mode in staging or production.

### Configuring MSG91 later

Set `OTP_DELIVERY_MODE=http`, `OTP_DELIVERY_URL` and `OTP_DELIVERY_TOKEN`; in production the URL must use HTTPS. `OTP_DELIVERY_CHANNEL` defaults to `SMS`; `OTP_HASH_SECRET` is required (≥32 chars) in production.

## Deployment (Render)

Deploy the backend as a Node Web Service (staging or production).

- **Root directory:** repository root (`hisab-naki/`)
- **Build command:** `npm run build --workspace backend`
- **Start command:** `npm run start --workspace backend`
- **PreDeploy (staging, run before the deploy):** `npx prisma migrate deploy --schema prisma/schema.prisma`
- **Environment variables (staging):** `DATABASE_URL`, `JWT_SECRET`, `CORS_ORIGIN` (the exact frontend staging origin), `PREVIEW_TTL_MS` (optional; default 900000), `LOGIN_RATE_LIMIT_MAX`/`_WINDOW_MS` and `AI_RATE_LIMIT_MAX`/`_WINDOW_MS` (optional defaults), `DASHBOARD_BUSINESS_NAME` (optional). Render sets `PORT` and `NODE_ENV=production`.

In production the server fails to start if `DATABASE_URL`, `CORS_ORIGIN` (specific origin, not `*`) or `JWT_SECRET` (≥ 32 characters) is missing.

## Testing

```bash
npm test --workspace backend     # Node built-in test runner (mocked repos; no live DB required)
npx tsc -p tsconfig.json         # from backend/
npm run build                    # from repository root
npx prisma validate --schema prisma/schema.prisma
```

Tests use mocked repositories and middleware; they do not require a live database. After the DB owner applies migrations, run the full workflow manually or add integration tests against a test PostgreSQL instance.
