# HisabNaki Open Ledger API handoff

The dashboard at `/dashboard` uses the Express API below. The contracts in this document describe the current integration. The release requirements describe work for the backend and database teams to review before a real shop uses the ledger.

The browser uses the build-time `NEXT_PUBLIC_API_URL` and falls back to `http://localhost:4000`. Set the intended HTTPS API origin for staging and production. Current authenticated business-scoped requests use `Authorization: Bearer <JWT>` and `X-Business-ID`; public login is the exception. Credentials are in-memory only and are not persisted across a full reload. The preview details below were rechecked against the current backend source during Frontend Integration Phase 7. Historical direct-write descriptions elsewhere in this document are not an enabled dashboard workflow.

## Requests and responses

| Method and endpoint | Input | Successful response and frontend use |
| --- | --- | --- |
| `GET /api/dashboard/summary` | No parameters | `200 { ok: true, data: Summary }`. Five financial cards display API-provided values (today's sales, expenses, payments received, new credit, and total outstanding); `businessName` and optional `recentTransactions` are also consumed. A successful `data: null` means the summary is unavailable. Zero is a valid amount. |
| `GET /api/customers` | No parameters | `200 { ok: true, data: Customer[] }`. Search filters the loaded records by name or phone. An empty array means the service returned no customers. |
| `GET /api/customers/:id` | URL-encoded customer ID from the list | `200 { ok: true, data: CustomerDetail }`. The response ID must match the requested ID. An empty nested `transactions` array is valid. HTTP `404` shows the missing-customer state. |
| `GET /api/transactions` | `page`, `limit`, optional `type`, `customerId`, `from`, `to` | With query parameters, `200 { ok: true, data: { transactions, total, page, limit, totalPages } }`; the legacy no-query route can return an array. Dashboard uses five rows for its preview and ten per expanded page. |
| `POST /api/preview` | Authenticated business context; `{ transcript: string }` | `201 { ok: true, data: TransactionPreview }`. Source inspection confirms interpretation and in-memory preview creation do not commit a transaction. |
| `GET /api/preview/:id` | Authenticated; ID in path | `200 { ok: true, data: TransactionPreview }`, or `404` unknown/foreign-business, `410` expired. Source checks business ownership but does not check preview creator ownership within a business. |
| `POST /api/preview/:id/cancel` | Authenticated; ID in path; no body | Intended `200 { ok: true, data: TransactionPreview }` for pending previews; `410` expired; `409` non-pending; `404` invalid/foreign. **Do not call from frontend yet:** controller invokes cancellation before checking business and does not check creator ownership. |
| `POST /api/preview/:id/confirm` | Authenticated business context; ID in path; no body | On success `{ ok: true, data: TransactionPreview, result }`. Errors include `400` for invalid/read-only/incomplete intents, `404` invalid ID, `409` state/context conflicts, `410` expired and `500` commit failure. **Current dashboard confirmation remains disabled** pending backend parser, customer identity, amount, persistence, and reconciliation fixes listed below. |

The server also has `GET /api/customers/:id/transactions`, `POST /api/customers`, and `GET /api/transactions/summary`. The Open Ledger dashboard does not use these routes.

### Response fields

| Object | Fields the current UI expects |
| --- | --- |
| `Summary` | `businessName` string and numeric/decimal `todaysSales`, `todaysExpenses`, `paymentsReceived`, `newCredit`, and `totalOutstanding`; `recentTransactions` is consumed when present and must be a valid transaction list. The dashboard displays API-provided values and does not calculate authoritative balances. An empty shop should use real zero totals. |
| `Customer` | `id` and `name` strings, numeric `outstandingBalance` and `transactionCount`, optional `phone` string or `null`. The backend also returns `createdAt`. |
| `CustomerDetail` | `id` and `name` strings, numeric `outstandingBalance`, required `transactions: Transaction[]`, optional `phone` string or `null`. `transactionCount` is unnecessary here. |
| `Transaction` | `id`, `description`, `type`, and `createdAt` as strings, with finite numeric `amount`. Dates must be parseable ISO timestamps with a UTC offset. Types currently returned are `CREDIT`, `PAYMENT`, `SALE`, and `EXPENSE`. The optional or nullable `customer` relation supplies a `name` string where present. The UI uses `General` when the relation is absent. |
| `TransactionPreview` | `id`, `businessId`, `createdByUserId`, `intent`, `confidence`, `missingFields`, `readyForConfirmation`, `state`, and `createdAt`; optional `customerName`, numeric `amount`, `type`, and `description`. Current response has no expiry timestamp and identifies customer by name rather than stable customer ID. |

### Preview workflow and safety status

`POST /api/preview` accepts only `{ transcript: string }`. The route is protected by `authenticate`; handlers use authenticated `businessId` and `userId` as tenant context. The service interprets the transcript and stores its result in `InMemoryPreviewStore`; source explicitly treats interpretation as pure and does not create a transaction. The response `data` is a `TransactionPreview`.

`GET /api/preview/:id` reads the server-held preview. `POST /api/preview/:id/cancel` accepts no body and changes only a pending preview to `cancelled`; success returns the updated preview. `POST /api/preview/:id/confirm` accepts no client transaction fields: it commits from the stored preview and authenticated context. It validates business and creator match, intent, confidence, required fields, readiness, expiry, and atomically claims the in-memory state before calling the transaction service. Success returns `{ ok: true, data: confirmedPreview, result }`.

The TTL defaults to 15 minutes and can be configured with `PREVIEW_TTL_MS`; the response contains no `expiresAt`. The store is process-local, so restart loses previews and multiple server instances do not share them. On a commit exception the service releases `confirming` back to `pending` and returns `COMMIT_FAILED` with `retryable: true`; it cannot prove that an exception means the database did not commit. The dashboard therefore permits preview creation and local dismissal only. It does not call the cancel or confirmation endpoints until cancellation owner checks and confirmation safety are fixed. Its displayed interpretation is an unverified suggestion, not a saved transaction.

Preview customer identity is a name, not a customer ID. The parser has known complete misclassifications, including negated commands and Devanagari repayment. The transaction service applies `Math.round(input.amount)` while the database schema has a decimal amount column. These make live confirmation unsafe. Manual-entry preview is unavailable because the endpoint accepts transcripts only; the frontend must not synthesize a transcript from structured form values.
## Errors, loading, and retries

- Return JSON failures as `{ ok: false, message: string }` and use the preview controller's status mapping: `400` invalid/read-only/incomplete intent, `404` invalid or foreign preview, `409` state/context conflict, `410` expired, and `5xx` server failure. No route-level preview rate limiter (`429`) was found. The shared client handles auth/business headers, network and malformed responses, cancellation, `401`, and `403`.
- Dashboard GETs load independently; Retry repeats only its panel. Customer-detail and transaction requests are cancelled or ignored when their identifier, filters, page, session, or business changes.
- Preview creation is a non-committing authenticated POST. The client bounds waiting time, aborts on timeout or context change, and ignores late responses. Preview creation can be repeated without creating a financial transaction, though abandoned in-memory previews remain until expiry.
- The dashboard's Clear preview action only removes the local review; it explicitly tells the user that the server-held preview remains until its configured expiry. It does not call the cancellation endpoint because its current controller mutates the preview before checking business ownership and does not verify creator ownership.
- The dashboard does not call the confirmation endpoint. If later enabled, timeout, connection loss, and inconclusive server errors must remain uncertain. Do not retry confirmation until durable idempotency and outcome reconciliation exist; current `retryable: true` on commit failure is not proof that no ledger mutation occurred.
- Read-only interpretations are not executed as balance enquiries through preview. No direct financial `POST /api/transactions` is used by the dashboard.
## Ordering, history scope, and customer identity

Dashboard transaction history uses backend-supported pagination and filters. The backend currently sorts by `createdAt` descending; add an agreed deterministic tie-breaker for equal timestamps before relying on a stable order. Paginated totals describe matching returned records, but frontend should not claim database-wide completeness unless the backend contract guarantees it.

Customer list/search and customer ledger navigation use stable customer IDs. Voice previews still return a customer name only. Duplicate names cannot be resolved safely from the current preview contract. The backend must resolve and return an authorized customer ID or explicit ambiguity state before a preview can be confirmable.

## Backend and database release requirements

1. **Critical — parser correctness.** The checked-in parser and prior diagnostic show incorrect classification for negation, repayment, and some ambiguous Hindi/Hinglish/Devanagari utterances. Return an explicit unresolved outcome for ambiguity; add tests for all four write types, negation, missing fields, and recorded local-language utterances. Frontend must not guess intent.
2. **Critical — durable preview and confirmation outcome.** Replace process-local storage with shared durable state; expose authoritative expiry; provide durable idempotency and a status/reconciliation result after response loss. Do not label commit failures retryable unless the backend can prove the transaction did not commit.
3. **High — customer identity.** Resolve customer names to authorized IDs server-side and reject/clarify duplicate matches before a preview can be confirmable. Return enough identity for the user to verify the intended customer.
4. **High — money precision.** Align transaction-service rounding, schema precision, validation limits, and the amount representation returned to clients. Test decimal boundaries.
5. **High — authorization and tenant isolation.** Verify preview read, cancel, confirm, and ledger access for two synthetic businesses. Client business headers are request context, not authorization proof.
6. **High — integration verification.** On isolated staging, verify persisted credit, repayment, sale, and expense against summary/history; cross-business denial; concurrent confirmation; expiration/cancellation races; and lost-response recovery. Use synthetic records only.
Reviewed sources include [`frontend/app/dashboard/page.tsx`](../frontend/app/dashboard/page.tsx), [`backend/src/server.ts`](../backend/src/server.ts), [`backend/src/controllers/transactionController.ts`](../backend/src/controllers/transactionController.ts), [`backend/src/controllers/customerController.ts`](../backend/src/controllers/customerController.ts), [`backend/src/services/ai/intentService.ts`](../backend/src/services/ai/intentService.ts), and [`prisma/schema.prisma`](../prisma/schema.prisma).

## Signup and onboarding status

Self-service account signup and first-business creation are now implemented in backend source. See [signup-onboarding-api-requirements.md](signup-onboarding-api-requirements.md) and the current frontend handoff for exact contracts. This does not change the Open Ledger financial endpoints or enable any financial writes. Live staging verification remains blocked until the onboarding migration is applied and a real OTP delivery provider is configured.
