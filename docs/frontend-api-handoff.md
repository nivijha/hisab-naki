# HisabNaki — Frontend API Handoff

All contracts below are derived from the actual route definitions, controllers, services, and schemas in the current codebase. **Verification status:** every endpoint here is marked as verified against the code. Live smoke-testing against the database is marked separately in §13; it was blocked at the time of writing because the database is not in sync with the schema (see §1.1).

---

## 1. Base API URL

- Local dev: `http://localhost:4000` (Express default; `backend/src/server.ts:16`).
- The frontend reads `NEXT_PUBLIC_API_URL` at build time with fallback `http://localhost:4000` (`frontend/app/dashboard/page.tsx:10`).
- For the frontend platform, `NEXT_PUBLIC_API_URL` must be set to the backend's HTTPS origin **before the build/deploy** (it is a build-time Next.js env var).

### 1.1 Database status caveat

The live database was not verified against the current schema (see the final report): the pending migration `20261121043545_init_multibusiness` is not applied. Until the DB teammate applies it, do not assume the data endpoints work against the live DB.

---

## 2. Authentication Headers

| Header | Value | Required by |
|---|---|---|
| `Authorization` | `Bearer <JWT>` | All business APIs + memberships |
| `x-business-id` | `<BUSINESS_ID>` | All business APIs (business selection) |
| `Content-Type` | `application/json` | POST/PATCH bodies |

- The JWT is an HS256 token with claims `{ sub: <userId>, iat, exp }` (`backend/src/services/auth/tokenService.ts:77-90`).
- Only `POST /api/ai/interpret` is public (no auth).
- Unknown routes return `404 { ok: false, message: "Route not found" }` (`backend/src/server.ts:48`, `backend/src/middleware/errorHandler.ts:37`).

---

## 3. Authentication Flow

### 3.1 `POST /api/auth/login`

- Route: `backend/src/routes/auth.ts:11`.
- Request body (`backend/src/schemas/auth.ts:3-6`):
  ```json
  { "identifier": "shopkeeper@hisabnaki.local", "password": "demo-password" }
  ```
  - `identifier`: string, trimmed, min 1 — matches `User.email` (case-insensitive) or `User.phone` (exact).
  - `password`: string, min 1.
- Success → `200`:
  ```json
  {
    "ok": true,
    "data": {
      "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
      "tokenType": "Bearer",
      "expiresAt": "2026-11-23T12:00:00.000Z",
      "expiresIn": 3600
    }
  }
  ```
- Invalid credentials → `401 { "ok": false, "message": "Invalid credentials." }` (`authService.ts:91`).
- Validation failure → `400 { "ok": false, "message": "Validation failed", "errors": [{ "path": "identifier", "message": "Identifier is required." }] }`.
- Passwords are never returned by any endpoint (login returns only the token; user lookups select `id` + `passwordHash` only — `authService.ts:32-41`).
- Token TTL: `expiresIn` = `JWT_EXPIRES_IN_SECONDS` env or default 3600s, capped at 86400s (`tokenService.ts:50-62`).
- Passwords are stored as scrypt hashes (`backend/src/services/auth/passwordService.ts:37-41`).
- Rate limit: 10 attempts per 15 min by default (`LOGIN_RATE_LIMIT_MAX` / `LOGIN_RATE_LIMIT_WINDOW_MS`, `backend/src/middleware/rateLimit.ts:22-23`); excess → `429`.

### 3.2 `GET /api/auth/memberships`

- Route: `backend/src/routes/auth.ts:12` (requires valid JWT via `authenticateToken`).
- Success → `200`:
  ```json
  {
    "ok": true,
    "data": [
      {
        "membershipId": "h1abc...",
        "businessId": "hisabnaki-demo-business",
        "businessName": "Raju General Store",
        "role": "OWNER",
        "status": "ACTIVE"
      }
    ]
  }
  ```
  - Only `ACTIVE` memberships of the authenticated user are returned, ordered by `createdAt` ascending; the business must not be soft-deleted (`membershipService.ts:28-52`).
  - Note the key is `membershipId` (not `id`).

---

## 4. Business Authorization (`authenticate` middleware)

Every business API goes through `authenticate` (`backend/src/middleware/authenticate.ts:42-91`):

1. No `Authorization` header → `401 { ok: false, message: "Authorization header is required." }`.
2. Malformed scheme → `401 { ok: false, message: "Bearer token is required." }`.
3. Expired/invalid token → `401` with the token error message (`"Token has expired."`, `"Invalid token signature."`, `"Malformed token."`, etc., `tokenService.ts:98-150`).
4. Missing `x-business-id` → `400 { ok: false, message: "Business context is required." }`.
5. No ACTIVE membership for `(userId, businessId)` (or business soft-deleted) → `403 { ok: false, message: "No active membership for this business." }`.
6. Success: `req.auth = { userId, businessId, membershipId, role }`.

**Security note:** all controllers read the business context from `requireAuth(req)` (`authenticate.ts:96-101`), not from the request body. So `businessId` / `createdByUserId` in the body cannot override the authenticated tenant (e.g., `transactionController.ts:42-43`, `customerController.ts:33`).

---

## 5. Customer APIs

All under `/api/customers` (`backend/src/routes/customers.ts`), all business-scoped via `authenticate`.

### 5.1 `GET /api/customers/`
- Success → `200 { "ok": true, "data": [CustomerSummary] }` where each item:
  ```json
  {
    "id": "h1xyz...",
    "name": "Raju Sharma",
    "phone": "9876543210",
    "createdAt": "2026-11-17T16:26:37.576Z",
    "outstandingBalance": 650,
    "transactionCount": 2
  }
  ```
  - `outstandingBalance` is the business-scoped outstanding amount (CREDIT +, PAYMENT −; SALE/EXPENSE ignored; `calculateOutstandingAmount`, `backend/src/utils/ledger.ts:9-28`).
- Errors: `500 { "ok": false, "message": "Unable to load customers." }`.

### 5.2 `POST /api/customers/`
- Body (`backend/src/schemas/customer.ts:3-6`): `{ "name": "Raju General", "phone": "9876543210" }` — `name` required (trimmed, min 1, message `"Customer name is required."`); `phone` optional.
- Success → `201 { "ok": true, "data": <Customer> }` where `<Customer>` is the full row: `{ id, businessId, name, phone, email, notes, createdByUserId, createdAt, updatedAt, deletedAt }`.
- Duplicate behavior: if a customer with the same trimmed name already exists in the business, the existing customer is returned (no new row) — `customerService.ensureCustomer` (`backend/src/services/ledger/customerService.ts:22-46`).
- Errors: `400` validation (`Validation failed` + `errors[]`), `400 "Customer name is required."`, `500 "Unable to create customer."`.

### 5.3 `GET /api/customers/:id`
- Success → `200 { "ok": true, "data": <Customer & { outstandingBalance: number }> }`.
- Not found → `404 { "ok": false, message: "Customer not found." }` (`customerController.ts:47-49`).
- Errors: `500 { "ok": false, message: "Unable to load customer details." }`.

### 5.4 `GET /api/customers/:id/transactions`
- Same response shape as §5.3 (customer detail + `outstandingBalance`); route param validated as `{ id: string, min 1 }`.
- Not found → `404 "Customer not found."`.

### 5.5 `PATCH /api/customers/:id`
- Body (`backend/src/schemas/customer.ts:12-19`): `{ "name": "Raju", "phone": "9876543210" }` — at least one of `name`/`phone` required (`"At least one field (name or phone) is required."`); `name` is trimmed.
- Success → `200 { "ok": true, "data": <Customer> }`.
- Not found → `404 "Customer not found."`; name taken by another customer → `400 "Customer with this name already exists."` (`NAME_CONFLICT`); other validation → `400`.
- Errors: `500 "Unable to update customer."`.

### 5.6 `DELETE /api/customers/:id`
- Success → `200 { "ok": true, data: { "id": "<customerId>" } }`.
- Not found → `404 "Customer not found."`; has transactions → `409 "Cannot delete a customer with transaction history."`.
- Errors: `500 "Unable to delete customer."`.

---

## 6. Transaction APIs

All under `/api/transactions` (`backend/src/routes/transactions.ts`), all business-scoped.

### 6.1 `POST /api/transactions/`

Body (`backend/src/schemas/transaction.ts:38-99`):
```json
{
  "customerName": "Raju",
  "amount": 450.75,
  "type": "CREDIT",
  "description": "Udhaar",
  "idempotencyKey": "txn-abc-1"
}
```
- `intent`: one of `ADD_CREDIT | RECORD_PAYMENT | ADD_SALE | ADD_EXPENSE | GET_BALANCE | GET_TOTAL_OUTSTANDING | GET_TODAY_TRANSACTIONS | GET_CUSTOMER_TRANSACTIONS` (all optional).
- `amount`: string or number, preprocessed to Number; must be `> 0` (`"Amount must be greater than zero."`) and have **at most 2 decimals** (`"Amount supports at most two decimal places."`). `450.75` is valid; `100.505` is rejected.
- `type`: `CREDIT | PAYMENT | SALE | EXPENSE` (for write intents).
- `idempotencyKey`: string, 1–200 chars.

**Write intents** (everything except the 4 read intents): `customerName`, `amount`, `type` required — validation failures return `400 { ok: false, message: "Validation failed", errors: [...] }` or the fallback `400 "Customer name, amount and type are required for a ledger update."`.

Success (`CREDIT` example) → `201`:
```json
{
  "ok": true,
  "data": {
    "transaction": {
      "id": "h1txx...",
      "businessId": "hisabnaki-demo-business",
      "customerId": "h1cyy...",
      "type": "CREDIT",
      "status": "ACTIVE",
      "amount": "450.75",
      "description": "Ledger update",
      "occurredAt": "2026-11-23T10:00:00.000Z",
      "createdAt": "2026-11-23T10:00:00.000Z",
      "createdByUserId": "h1u1...",
      "voidedAt": null,
      "voidedByUserId": null,
      "voidReason": null,
      "originalTransactionId": null,
      "idempotencyKey": null,
      "saleMode": null,
      "paymentMethod": null,
      "openingDirection": null,
      "customer": { "id": "h1cyy...", "name": "Raju", "businessId": "hisabnaki-demo-business", "...": "..." }
    },
    "customer": { "...": "..." },
    "outstandingBalance": 450.75
  },
  "responseText": "Raju ke account mein 450.75 ka balance hai."
}
```
- `amount` is a JSON **string** (Prisma `Decimal` serializes via `toJSON`; verified: `JSON.stringify(new Prisma.Decimal('450.75')) === '"450.75"'`).
- `outstandingBalance` is a number (`toDisplayNumber`).
- `idempotencyKey` set on retry → returns the **original transaction** (no duplicate): `IdempotentCreateResult { transaction, created: false }` (`transactionRepository.ts:22-25`); a 409 is returned if the same key is reused with a different payload (`409 "Idempotency key was reused with a different request payload."`, `transactionService.ts:104-106`). The fingerprint covers customer name, amount, type, and description.

**Read intents** (body-based, via `POST /api/transactions/`):
- `GET_BALANCE` + `customerName` → `200 { ok: true, data: { customerName, outstandingBalance, balanceText }, responseText: "<name> ke <balance> baaki hain." }`; `404 { ok: false, message: "Customer not found." }`.
- `GET_TOTAL_OUTSTANDING` → `200 { ok: true, data: { totalOutstanding, totalOutstandingText }, responseText: "Total outstanding <text> hai." }`.
- `GET_TODAY_TRANSACTIONS` → `200 { ok: true, data: Transaction[], responseText: "Aaj ke transactions dikha diye gaye hain." }` — transactions for the authenticated business created today (server-local date).
- `GET_CUSTOMER_TRANSACTIONS` + `customerName` → `200 { ok: true, data: Transaction[], responseText: "<name> ke transactions loaded." }`; `404` if customer not found.

Errors: `401/400` as above; `500 { ok: false, message: "Could not process the transaction." }` — internal errors are not leaked (`transactionController.ts:121-128`).

### 6.2 `GET /api/transactions/`

Query (`backend/src/schemas/transaction.ts:24-36`, `backend/src/routes/transactions.ts:9-17`): `page?` (int > 0), `limit?` (int, default 10, max 100), `type?` (`CREDIT|PAYMENT|SALE|EXPENSE`), `customerId?`, `from?`, `to?` (dates). Validation failure → `400 { ok: false, message: "Validation failed", errors: [...] }`.

- If any history key (`page|limit|type|customerId|from|to`) is present → history mode:
  ```json
  { "ok": true, "data": { "transactions": [<Transaction & { formattedAmount: "₹101" }>], "total": 12, "page": 1, "limit": 10, "totalPages": 2 } }
  ```
  - Default `page=1`, `limit=10`, `totalPages = ceil(total/limit)` (0 if total 0) (`transactionService.ts:148-182`).
- Otherwise → recent list mode: `200 { "ok": true, "data": [<Transaction & { formattedAmount }>...] }` — ACTIVE transactions of the business (reversed, newest first).
- `formattedAmount` uses `Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 })` (`utils/ledger.ts:42-48`).
- Errors: `500 { ok: false, message: "Unable to load transactions." }`.

### 6.3 `GET /api/transactions/summary`
Same response shape as `GET /api/dashboard/summary` (§7). (Route: `backend/src/routes/transactions.ts:30`.)

### 6.4 `GET /api/transactions/:id`
- Success → `200 { "ok": true, "data": <Transaction & { formattedAmount }> }`.
- Not found → `404 { "ok": false, "message": "Transaction not found." }`.
- Errors: `500 { "ok": false, "message": "Unable to load transaction." }`.

---

## 7. Dashboard API

- Route: `GET /api/dashboard/summary` (`backend/src/routes/dashboard.ts:10`).
- Success → `200 { "ok": true, "data": <DashboardSummary> }` (`dashboardService.ts:9-17`):
  ```json
  {
    "ok": true,
    "data": {
      "businessName": "Raju General Store",
      "todaysSales": 350,
      "todaysExpenses": 0,
      "paymentsReceived": 40,
      "newCredit": 310,
      "totalOutstanding": 270,
      "recentTransactions": [ "<Transaction>", "<Transaction>", "..." ]
    }
  }
  ```
  - `businessName`: from the `Business` table; falls back to `DASHBOARD_BUSINESS_NAME` env or `"My Business"` (`dashboardService.ts:26-29, 63-65`).
  - `todaysSales` = Σ today SALE amounts; `todaysExpenses` = Σ today EXPENSE; `paymentsReceived` = Σ today PAYMENT; `newCredit` = Σ today CREDIT; `totalOutstanding` = Σ (CREDIT − PAYMENT) across the business; `recentTransactions` = up to 5 ACTIVE transactions.
  - "Today" is the server-local date (`dashboardService.ts:41-42`).
  - Amounts are numbers via `toDisplayNumber` (`utils/ledger.ts:38-40`).
- Errors: `500 { ok: false, message: "Unable to load dashboard data." }`.

---

## 8. Voice Interpretation + Preview Workflow

### 8.1 `POST /api/ai/interpret` — interpretation (no auth)
- Body: `{ "transcript": "Raju ko 500 rupaye udhaar diya." }` (`backend/src/controllers/aiController.ts:4-13`).
- Success → `200 { "ok": true, "data": <ParsedIntent> }` where (`backend/src/services/ai/intentService.ts:1-16`):
  ```json
  {
    "intent": "ADD_CREDIT",
    "customerName": "Raju",
    "amount": 500,
    "description": "udhar diya",
    "confidence": 0.9,
    "missingFields": []
  }
  ```
  - `intent` ∈ `ADD_CREDIT | RECORD_PAYMENT | ADD_SALE | ADD_EXPENSE | GET_BALANCE | GET_TOTAL_OUTSTANDING | GET_TODAY_TRANSACTIONS | GET_CUSTOMER_TRANSACTIONS`.
  - `customerName`, `amount`, `description`, `missingFields` optional; `confidence` 0–1 (0 on empty transcript).
  - Rate limit: `AI_RATE_LIMIT_MAX` default 30 per `AI_RATE_LIMIT_WINDOW_MS` default 60000 (`rateLimit.ts:61-65`).
- Errors: `400 { "ok": false, "message": "<error message>" }`.

### 8.2 `POST /api/preview/` — create preview
- Body: `{ "transcript": "..." }` (`backend/src/schemas/preview.ts:3-5`).
- Success → `201 { "ok": true, "data": <TransactionPreview> }` (`previewStore.ts:26-40`):
  ```json
  {
    "id": "6f7f...-uuid",
    "businessId": "hisabnaki-demo-business",
    "createdByUserId": "h1u1...",
    "intent": "ADD_CREDIT",
    "customerName": "Raju",
    "amount": 500,
    "type": "CREDIT",
    "description": "Udhaar",
    "confidence": 0.9,
    "missingFields": [],
    "readyForConfirmation": true,
    "state": "pending",
    "createdAt": "2026-11-23T10:05:00.000Z"
  }
  ```
- The preview stores the authenticated business context (`previewController.ts:68-77`).

### 8.3 `GET /api/preview/:id` — retrieve preview
- Success → `200 { "ok": true, "data": <TransactionPreview> }`.
- Ownership: the preview's `businessId` must match the authenticated business → otherwise `404 INVALID_PREVIEW`.
- Error codes → status (`previewController.ts:25-42`):
  - `404 INVALID_PREVIEW "Invalid or unknown preview."`
  - `410 EXPIRED "Preview has expired."`
- Errors body: `{ "ok": false, "code": "...", "message": "..." }`.

### 8.4 `POST /api/preview/:id/cancel` — cancel preview
- Success → `200 { "ok": true, "data": <TransactionPreview> }` with `state: "cancelled"`.
- Errors: `404 INVALID_PREVIEW`, `410 EXPIRED`, `409 NOT_CANCELLABLE "Preview cannot be cancelled."`.

### 8.5 `POST /api/preview/:id/confirm` — confirm preview (writes the transaction)
- Success → `200 { "ok": true, "data": <TransactionPreview>, "result": <createTransaction result> }` where `result = { transaction, customer, outstandingBalance }` (the same shape as the §6.1 write response).
- The transaction is committed with the **stored** context (businessId/createdByUserId), not anything client-supplied (`previewController.ts:93-104`, `previewService.ts:279-286`).
- Errors (`previewController.ts:25-42`):
  - `404 INVALID_PREVIEW`, `410 EXPIRED`, `409 ALREADY_CONFIRMED`, `409 CANCELLED`, `409 CONFIRMATION_IN_PROGRESS`, `409 CONTEXT_MISMATCH`, `400 READ_ONLY_INTENT`, `400 INVALID_INTENT`, `400 LOW_CONFIDENCE`, `400 MISSING_FIELDS`, `400 NOT_READY`, `500 COMMIT_FAILED` (+ `retryable: true`).
- Notes: `get`/`cancel` validate business ownership inside the service (`isOwnedBy`, `previewService.ts:140-142`); `confirm` additionally requires the creating userId to match (`previewService.ts:225-235`).

### 8.6 Preview details
- States: `pending → confirming → confirmed` (on successful commit) or `cancelled` (`previewStore.ts:24`).
- TTL: `PREVIEW_TTL_MS` env, default 900000 ms (15 min) (`previewService.ts:16, 48-57`). Expired previews are pruned on new creation and rejected as `EXPIRED` on read/cancel/confirm.
- The store is in-memory per process: previews are lost on restart and are not shared across instances (`previewController.ts:15-16`).

---

## 9. Error Response Formats

All errors are `{ "ok": false, ... }`:

| Case | Status | Body |
|---|---|---|
| Route not found | 404 | `{ "ok": false, "message": "Route not found" }` |
| Validation failure | 400 | `{ "ok": false, "message": "Validation failed", "errors": [{ "path": "amount", "message": "Amount must be greater than zero." }] }` |
| Not authenticated | 401 | `{ "ok": false, "message": "Authorization header is required." }` etc. |
| No active membership | 403 | `{ "ok": false, "message": "No active membership for this business." }` |
| Business context missing | 400 | `{ "ok": false, "message": "Business context is required." }` |
| Business not found / not accessible | 403 | `{ "ok": false, "message": "No active membership for this business." }` |
| Entity not found | 404 | `{ "ok": false, "message": "Customer not found." }` etc. |
| Duplicate customer name on create | — | returns existing customer (201) |
| Customer has transactions | 409 | `{ "ok": false, "message": "Cannot delete a customer with transaction history." }` |
| Idempotency conflict | 409 | `{ "ok": false, "message": "Idempotency key was reused with a different request payload." }` |
| Validation (business APIs) | 400 | `{ "ok": false, "message": "Validation failed", "errors": [...] }` |
| Internal error | 500 | `{ "ok": false, "message": "Could not process the transaction." }` — in production, generic messages (`errorHandler.ts:20-23`). |

---

## 10. Request/Response Examples

### 10.1 Login
```
POST /api/auth/login
{ "identifier": "shopkeeper@hisabnaki.local", "password": "demo-password" }

200
{ "ok": true, "data": { "token": "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJodTF1Li4uIn0.abc", "tokenType": "Bearer", "expiresAt": "2026-11-23T11:00:00.000Z", "expiresIn": 3600 } }
```

### 10.2 Memberships
```
GET /api/auth/memberships
Authorization: Bearer <token>

200
{ "ok": true, "data": [ { "membershipId": "h1mem1", "businessId": "hisabnaki-demo-business", "businessName": "Raju General Store", "role": "OWNER", "status": "ACTIVE" } ] }
```

### 10.3 Business-scoped header example (all business APIs)
```
Headers:
  Authorization: Bearer <token>
  x-business-id: hisabnaki-demo-business
  Content-Type: application/json
```

### 10.4 Create customer
```
POST /api/customers/
{ "name": "Raju General", "phone": "9876543210" }

201
{ "ok": true, "data": { "id": "h1cust1", "businessId": "hisabnaki-demo-business", "name": "Raju General", "phone": "9876543210", "email": null, "notes": null, "createdByUserId": "h1u1", "createdAt": "2026-11-23T10:10:00.000Z", "updatedAt": "2026-11-23T10:10:00.000Z", "deletedAt": null } }
```

### 10.5 Create CREDIT (write flow)
```
POST /api/transactions/
{ "customerName": "Raju General", "amount": 450.75, "type": "CREDIT", "description": "Udhaar", "idempotencyKey": "smoke-1" }

201
{ "ok": true, "data": { "transaction": { "id": "h1txn1", "amount": "450.75", "type": "CREDIT", "status": "ACTIVE", "...": "..." }, "customer": { "id": "h1cust1", "name": "Raju General", "...": "..." }, "outstandingBalance": 450.75 }, "responseText": "Raju General ke account mein 450.75 ka balance hai." }
```

### 10.6 Idempotent retry (same body + idempotencyKey)
```
POST /api/transactions/ (identical body)
→ 201 with the same "data.transaction.id" as the first call; no new row created
```

### 10.7 Outstanding balance
```
GET /api/customers/h1cust1
200
{ "ok": true, "data": { "id": "h1cust1", "name": "Raju General", "outstandingBalance": 450.75, "transactionCount": 1 } }
```

### 10.8 Voice interpretation
```
POST /api/ai/interpret
{ "transcript": "Raju ko 500 rupaye udhaar diya." }

200
{ "ok": true, "data": { "intent": "ADD_CREDIT", "customerName": "Raju", "amount": 500, "description": "udhar diya", "confidence": 0.9, "missingFields": [] } }
```

### 10.9 Preview + confirm
```
POST /api/preview/
{ "transcript": "Raju ko 500 rupaye udhaar diya." }

201
{ "ok": true, "data": { "id": "<uuid>", "businessId": "hisabnaki-demo-business", "createdByUserId": "h1u1", "intent": "ADD_CREDIT", "customerName": "Raju", "amount": 500, "type": "CREDIT", "description": "Udhaar", "confidence": 0.9, "missingFields": [], "readyForConfirmation": true, "state": "pending", "createdAt": "2026-11-23T10:20:00.000Z" } }

GET /api/preview/<uuid>
200 { "ok": true, "data": { ...same preview... } }

POST /api/preview/<uuid>/confirm
200 { "ok": true, "data": { ...preview state "confirmed"... }, "result": { "transaction": { ...Transaction row with amount "500"... }, "customer": { ... }, "outstandingBalance": 500 } }
```

---

## 11. Authentication & Business-Switching Behavior

- **Auth model:** `Authorization: Bearer <JWT>` (HS256, `{sub, iat, exp}`). Expired/invalid → `401`.
- **Business selection:** always via the `x-business-id` header. The header is authoritative — the membership table must contain an ACTIVE membership for `(JWT.sub, x-business-id)` and the business must not be deleted, else `403`.
- **No tenant spoofing:** every business API reads `businessId`/`userId` from `requireAuth(req)`; body fields `businessId`/`createdByUserId` are ignored.
- **Multi-business switching:** frontend reads `GET /api/auth/memberships` and offers one header value per business; on switch, re-send `x-business-id`.
- **Same session across businesses:** allowed if memberships exist — authorization is per-request via the header.

---

## 12. Smoke Test Plan (backend; safe data)

> Not executed — blocked (see §13). Intended plan:
>
> 1. Login: `POST /api/auth/login` with `shopkeeper@hisabnaki.local` / `demo-password` (seeded dev account; verify against the DB — see §13).
> 2. `GET /api/auth/memberships` → select business A (`x-business-id`).
> 3. `GET /api/dashboard/summary` (business A).
> 4. `POST /api/customers/` — create a throwaway customer.
> 5. `POST /api/transactions/` — CREDIT.
> 6. `GET /api/customers/:id` → verify `outstandingBalance`.
> 7. `POST /api/transactions/` — PAYMENT.
> 8. `GET /api/customers/:id` → verify balance decremented.
> 9. `GET /api/transactions/` — history contains both.
> 10. `POST /api/transactions/` — same `idempotencyKey` → no new transaction.
> 11. Cross-business: `x-business-id` of business B (user has membership, or without) → expect `403` or `401`; never business A data.

---

## 13. Status & Verification Notes

- **TypeScript:** 0 errors (`tsc -p tsconfig.json --noEmit` in `backend/`).
- **Tests:** 305/305 passing (`npm test` in `backend/`).
- **DB:** blocked (see §1.1) — `prisma migrate status` shows migration `20261121043545_init_multibusiness` not applied; live `Transaction` table lacks `businessId`/`idempotencyKey`/`createdByUserId` columns and `id` is the only unique index; `Business`, `Membership`, `VoiceTransactionRequest`, `AuditLog`, `OtpChallenge` tables are missing. This blocks all data-dependent smoke tests.
- **Live API smoke tests:** BLOCKED — not executed against the database because of the DB state above.
- **Env gaps found:** root `.env` lacks `JWT_SECRET` (required — login will throw `TokenError('JWT secret is not configured.')` → `500` if unset). `SEED_PASSWORD` has a default. Other vars have defaults or are optional (`CORS_ORIGIN` — set in production).
- **Seed script status:** `prisma/seed.ts` is stale — uses `prisma.customer.upsert({ where: { id }, create: { id, userId, name, phone } })` and `prisma.user.upsert({ where: { email }, create: { name, email, businessName } })`; the current schema has no `Customer.userId` or `User.businessName`. It cannot run as-is against the current schema.
- **Minor defect found:** `POST /api/customers/` accepts whitespace-only names (`createCustomerSchema` `z.string().min(1)` without trim) — such requests 500 via the service's `Customer name is required.` error; schema now rejects them with `400` (fixed).
