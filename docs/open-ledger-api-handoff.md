# HisabNaki Open Ledger API handoff

The dashboard at `/dashboard` uses the Express API below. The contracts in this document describe the current integration. The release requirements describe work for the backend and database teams to review before a real shop uses the ledger.

The browser uses the build-time `NEXT_PUBLIC_API_URL` and falls back to `http://localhost:4000`. Set the intended HTTPS API origin for staging and production. Requests carry no auth header and do not opt into cross-origin cookies. JSON POSTs send `Content-Type: application/json`. The local QA preview intercepts requests in the browser and uses synthetic records.

## Requests and responses

| Method and endpoint | Input | Successful response and frontend use |
| --- | --- | --- |
| `GET /api/dashboard/summary` | No parameters | `200 { ok: true, data: Summary }`. Four cards display API-provided values. A successful `data: null` means the summary is unavailable. Zero is a valid amount. |
| `GET /api/customers` | No parameters | `200 { ok: true, data: Customer[] }`. Search filters the loaded records by name or phone. An empty array means the service returned no customers. |
| `GET /api/customers/:id` | URL-encoded customer ID from the list | `200 { ok: true, data: CustomerDetail }`. The response ID must match the requested ID. An empty nested `transactions` array is valid. HTTP `404` shows the missing-customer state. |
| `GET /api/transactions` | No parameters | `200 { ok: true, data: Transaction[] }`. Recent transactions shows the first five. Expanded history uses the same response and displays the number of entries returned. |
| `POST /api/ai/interpret` | `{ transcript: string }` | `200 { ok: true, data: Interpretation }`. The frontend displays the transcript separately and treats eligible write interpretations as suggestions for review. This endpoint should remain side-effect free. |
| `POST /api/transactions` | Read-only intent payload below | `200 { ok: true, data: <query result>, responseText: string }`. Nonblank `responseText` is required for the dashboard to display and speak an answer. |
| `POST /api/transactions` | Confirmed write payload below | `201 { ok: true, data: { transaction, customer, outstandingBalance }, responseText?: string }` after a committed write. The frontend uses the success envelope and optional `responseText`, then refreshes the three dashboard panels. |

The server also has `GET /api/customers/:id/transactions`, `POST /api/customers`, and `GET /api/transactions/summary`. The Open Ledger dashboard does not use these routes.

### Response fields

| Object | Fields the current UI expects |
| --- | --- |
| `Summary` | `businessName` string and numeric `todaysSales`, `todaysExpenses`, `paymentsReceived`, `totalOutstanding`. The implementation also returns `newCredit` and `recentTransactions`, which this page does not consume. An empty shop should use real zero totals. |
| `Customer` | `id` and `name` strings, numeric `outstandingBalance` and `transactionCount`, optional `phone` string or `null`. The backend also returns `createdAt`. |
| `CustomerDetail` | `id` and `name` strings, numeric `outstandingBalance`, required `transactions: Transaction[]`, optional `phone` string or `null`. `transactionCount` is unnecessary here. |
| `Transaction` | `id`, `description`, `type`, and `createdAt` as strings, with finite numeric `amount`. Dates must be parseable ISO timestamps with a UTC offset. Types currently returned are `CREDIT`, `PAYMENT`, `SALE`, and `EXPENSE`. The optional or nullable `customer` relation supplies a `name` string where present. The UI uses `General` when the relation is absent. |
| `Interpretation` | Recognized `intent` string and required `missingFields: string[]`. Optional `customerName`, `amount`, and `description` depend on the intent. The current `confidence` score is recorded by the backend and unused for approval because it reflects field presence. |

### Transaction payloads

Both branches use the same JSON POST endpoint. On read-only requests, the browser omits `type` and omits undefined fields during JSON serialization.

| Intent | Required input and current result |
| --- | --- |
| `GET_BALANCE` | `intent` and `customerName`. Returns `data` with `customerName`, `outstandingBalance`, and `balanceText`, plus spoken `responseText`. |
| `GET_CUSTOMER_TRANSACTIONS` | `intent` and `customerName`. Returns `data` as transaction rows plus `responseText`. The visible customer ledger uses the separate ID-based GET instead. |
| `GET_TOTAL_OUTSTANDING` | `intent`. Returns `totalOutstanding` and `totalOutstandingText` in `data` plus `responseText`. |
| `GET_TODAY_TRANSACTIONS` | `intent`. Returns the current server-day transaction rows in `data` plus `responseText`. |

The browser forwards `amount` and `description` on enquiries if the parser supplies them. The read branches do not need either field. Their intent dispatch must have no financial side effects. The current default-user lookup can provision a demo user when none exists, which should be removed from protected read paths when authentication is introduced.

The confirmed write payload contains `intent`, `customerName`, numeric `amount`, `description`, and `type`. The UI requires a nonblank customer name and positive finite amount for review, and supplies `Ledger update` if the parser omitted a description. Opening or cancelling the confirmation sends no financial write.

| Suggested intent | `type` sent after Confirm |
| --- | --- |
| `ADD_CREDIT` | `CREDIT` |
| `RECORD_PAYMENT` | `PAYMENT` |
| `ADD_SALE` | `SALE` |
| `ADD_EXPENSE` | `EXPENSE` |

The server still needs to authoritatively validate intent and type consistency, amount bounds and precision, and the intended customer before it writes. The frontend formats API-supplied INR values and does not calculate a balance. The current database stores integer amounts and the write service rounds inputs. Agree on the amount unit, permitted precision, and shop time zone before integration. The current summary uses the server's day boundary and supplies a hard-coded business name.

## Errors, loading, and retries

- Return JSON failures as `{ ok: false, message: string }` with the appropriate non-2xx status. Use `404` for a missing customer. The app handles transport errors, invalid JSON, and failed HTTP responses. Messages shown to users should avoid raw database or stack details.
- Dashboard GETs load independently. Initial loads show placeholders. Successful empty results display empty states. A pending or failed refresh may retain old dashboard data with an explicit freshness label. Retry issues only the relevant GET.
- Customer detail requests are keyed by ID. Switching customers cancels the old request. The frontend discards late responses and rejects mismatched IDs.
- A structured `400` with `ok: false` on a write is the existing definitive validation rejection. Timeouts, network loss, 5xx responses, and other inconclusive failures need uncertain-save handling. The browser does not automatically retry a write. It refreshes transaction history by GET and offers a link to inspect it. The absence of a row cannot establish that a write failed.
- A successful write triggers the three dashboard GETs in parallel. A read-only enquiry does not refetch the dashboard. Consider how quickly committed rows become visible across the summary, customer list, and history if reads use replicas.

## Ordering, history scope, and customer identity

Dashboard history and customer history preserve API order. The current backend orders rows by `createdAt` descending. Add an agreed deterministic tie-breaker before relying on ordering for equal timestamps. The expanded view displays the entries returned, and the current API supplies no total count, cursor, date coverage, or completeness metadata. Agree on a contract before adding truncation, pagination, or server-side filters.

List rows, duplicate-name display, and customer ledger navigation use stable customer IDs. The current voice read and write payloads still identify a customer by name. Customer lookup uses case-insensitive name matching within the current user scope. Two customers with the same name remain ambiguous for voice writes and balance enquiries. Before release, define explicit resolution to an authorized stable ID and a way for the user to choose or clarify when the name matches multiple records.

## Backend and database release requirements

1. **Parser safety.** “Raju ne 200 rupaye de diye” can return `ADD_CREDIT` with `confidence: 0.9` and all write fields present. “Raju ka kitna udhaar hai?” can return `ADD_CREDIT` with a missing amount. The frontend can block incomplete interpretations and label complete results as suggestions, but a complete misclassified result can still be confirmed. Fix intent precedence and customer extraction. Return an explicit unresolved outcome for ambiguous requests and test it with recorded Hindi and Hinglish transcripts. The frontend journey tests supply the intended parser response as a mock.
2. **Authentication and isolation.** The current Express app uses unrestricted CORS and resolves ledger records through a default user. Agree on the session or token contract before frontend integration, including credential transport, allowed origins, `401` and `403` handling, expiry, and cookie protections where applicable. The server must derive shop scope from verified membership and authorize every GET and POST. Verify customer IDs, writes, and aggregate results with two isolated shops. Keep ledger responses out of shared caches.
3. **Idempotency and uncertain outcomes.** The browser prevents repeated Confirm clicks in the open dialog. The current API has no durable write idempotency key or status lookup. Agree on a shop-scoped operation identifier, atomically persist its outcome with the ledger mutation, return the same result when the exact request is replayed, and reject reuse with different data. Provide a reliable way to reconcile a request after a lost response. Until then, an uncertain transaction stays uncertain even if it is absent from history.
4. **PostgreSQL verification.** On isolated staging, reconcile the exact persisted credit and repayment rows with the customer ledger and dashboard totals, confirm that enquiries create no ledger entries, and test concurrent writes, invalid inputs, scope enforcement, and lost responses. Verify ordering and local-day totals, including a day-boundary case. Use synthetic records throughout QA.

Reviewed sources include [`frontend/app/dashboard/page.tsx`](../frontend/app/dashboard/page.tsx), [`backend/src/server.ts`](../backend/src/server.ts), [`backend/src/controllers/transactionController.ts`](../backend/src/controllers/transactionController.ts), [`backend/src/controllers/customerController.ts`](../backend/src/controllers/customerController.ts), [`backend/src/services/ai/intentService.ts`](../backend/src/services/ai/intentService.ts), and [`prisma/schema.prisma`](../prisma/schema.prisma).
