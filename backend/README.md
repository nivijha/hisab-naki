# HisabNaki Backend

Express + TypeScript (ESM/NodeNext) backend with Prisma/PostgreSQL, JWT authentication and multi-tenant (business) isolation.

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
| `JWT_SECRET` | yes (≥32 chars) | HS256 signing secret |
| `JWT_EXPIRES_IN_SECONDS` | no | Access token TTL, default 3600, capped at 86400 |
| `CORS_ORIGIN` | production | Explicit frontend origin; wildcard rejected in production |
| `LOGIN_RATE_LIMIT_MAX` / `_WINDOW_MS` | no | Login limiter defaults 10 / 900000 |
| `AI_RATE_LIMIT_MAX` / `_WINDOW_MS` | no | Interpretation limiter defaults 30 / 60000 |
| `PREVIEW_TTL_MS` | no | Preview TTL, default 900000 |
| `DASHBOARD_BUSINESS_NAME` | no | Fallback business name, default `My Business` |
| `SEED_PASSWORD` | no | Development seed password (default `demo-password`) |

Never commit real secrets. The seed password is development-only.

## Authentication flow

1. `POST /api/auth/login` with `{ identifier, password }` (email or phone). Returns `{ token, tokenType, expiresAt, expiresIn }`.
2. `GET /api/auth/memberships` with `Authorization: Bearer <token>` (no business header needed) returns ACTIVE memberships.
3. Every business request requires **both** `Authorization: Bearer <token>` and `x-business-id: <Business.id>`.
4. Middleware verifies the JWT, resolves an ACTIVE membership with a non-deleted business, and attaches `req.auth = { userId, businessId, membershipId, role }`.

Roles OWNER/ADMIN/STAFF all have access to current APIs; `role` is retained for future authorization.

## API contracts

All success responses: `{ ok: true, data, message?, responseText? }`. Errors: `{ ok: false, message, code?, errors? }`.

- **Customers** (`/api/customers`): `GET /`, `POST /`, `GET /:id`, `GET /:id/transactions`, `PATCH /:id`, `DELETE /:id`. All scoped by authenticated `businessId`; creation uses `req.auth.userId` as `createdByUserId`.
- **Transactions** (`/api/transactions`): `POST /` (write intents or read intents), `GET /` (list or paginated history when query params present), `GET /summary`, `GET /:id`. Optional `idempotencyKey` (1–200 chars) on writes. Replaying the same key with the same payload returns the original transaction; a different payload returns HTTP 409.
- **Dashboard** (`/api/dashboard/summary`): seven keys — `businessName`, `todaysSales`, `todaysExpenses`, `paymentsReceived`, `newCredit`, `totalOutstanding`, `recentTransactions`.
- **AI** (`POST /api/ai/interpret`): public but rate-limited; side-effect free.
- **Preview** (`/api/preview`): `POST /`, `GET /:id`, `POST /:id/cancel`, `POST /:id/confirm`. Previews carry `businessId`/`createdByUserId`; confirmation validates context and commits via the transaction service.

## Idempotency

`Transaction.idempotencyKey` is business-scoped. `PrismaTransactionRepository.createIdempotent` takes a PostgreSQL advisory transaction lock derived from `(businessId, key)`, checks for an existing row, creates if absent, and handles unique violations by returning the winning row. **DB teammate:** add `@@unique([businessId, idempotencyKey])` in a new migration (do not rewrite migration history) for defense-in-depth and to cover non-application writers.

## Preview limitations

The preview store is process-local in-memory: previews are lost on restart, concurrency protection is single-process, and multiple backend instances do not share previews. Persistent storage is a separate production improvement.

## Error handling and logging

Production responses hide stack traces and internal database messages. Structured JSON logs are emitted for authentication failures, transaction creation, preview confirmation, and server errors. Logs never include passwords, JWTs, phone numbers, or secrets.

## Testing

```bash
npm test --workspace backend     # Node built-in test runner
npx tsc -p tsconfig.json         # from backend/
npm run build                    # from repository root
```

Tests use mocked repositories; **they do not verify a live database**. After the DB owner applies the migration, run the full workflow manually or add integration tests against a test PostgreSQL instance.
