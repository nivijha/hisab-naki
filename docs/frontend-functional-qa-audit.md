# HisabNaki frontend functional and user experience audit

> **Phase 8 status:** The report below records a prior audit snapshot and is not current for routes or defects that changed during Frontend Integration Phases 2–7. The authoritative current inventory, verification results, and readiness assessment are in [Phase 8 final verification](#phase-8-final-verification-and-integration-handoff). Phase 8 supersedes the earlier readiness classifications where they conflict. Current Phase 8 browser checks used synthetic API and speech fixtures; they do not verify live backend behavior.

## Decision

The approved frontend is suitable for a mocked demo and frontend QA. It has verified navigation, customer search, ledger and history views, and a confirmation flow that keeps uncertain writes from being automatically retried. It needs corrections before use with real financial records. A malformed customer response can crash the dashboard, malformed totals can render `₹NaN`, a stalled request can strand the voice flow, and the mobile menu can hide keyboard focus. Parser safety, authenticated shop isolation, the Prisma contract, and durable save reconciliation remain integration gates.

### Scope and environments

- **Local functional baseline.** Headless Microsoft Edge 158.0.4370.33 controlled with the Chrome DevTools Protocol. The retained approved Next.js production build served on localhost. Hashes for all application and component files matched the current workspace. API and speech events were mocked in the browser, including delays, malformed responses, and lost save responses. Synthetic records were used throughout.
- **Deployed frontend.** Edge received HTTP 200 for `/` and `/dashboard` on the public Vercel site. Desktop anchor and dashboard navigation, Find customer, Back to site, and the mobile Use Cases anchor were exercised. Network rules blocked `*/api/*`, so dashboard errors seen during that run were expected. The web-fetch tool could not open the deployment, and Edge provided the direct browser evidence. [Deployment](https://hisab-naki.vercel.app/) · [Navigation evidence](../node_modules/.cache/hisabnaki-full-audit/Navigation/results.json) · [Deployed interaction evidence](../node_modules/.cache/hisabnaki-full-audit/Live-Observers/results.json)
- **Separate diagnostics.** The current parser ran in memory on supplied strings. Prisma model metadata was read locally without a database connection. A native microphone probe opened one live browser input track and immediately stopped it. No speech was supplied, saved, or sent. Physical speech recognition, audible playback, a real mobile keyboard, screen-reader speech, other browsers, real shopkeeper sessions, staging integration, and production financial behavior remain unverified.
- **Audit boundary.** The audit changed no application, dependency, backend, parser, or database files. No real transactions were created. The browser suites and screenshots are local evidence artifacts under `node_modules/.cache/hisabnaki-full-audit/`. No deployment or Git operation that changes history was performed.

## 1. Routes and feature inventory

| Route or screen | Discovered contents | Browser observation |
| --- | --- | --- |
| `/` | Fixed navigation, hero and sample ledger, three-step walkthrough, problem and solution, features, use cases, final CTA, footer | Six content sections and the footer rendered. The sample confirmation and waveform are static examples. Illustrations and controls use SVG icons. There were no image elements on the landing page. |
| `/dashboard` | Sticky header, voice controls and live feedback, four financial cards, Customers, expandable customer details, Recent transactions, expandable history, confirmation dialog | Populated and conditional screens rendered with mocks, subject to the malformed-response and stalled-request findings below. |
| Unknown URL | Default Next.js 404 | A deliberately unknown local URL showed the 404 document and no recovery control. There is no custom recovery page. |
| External repository | Footer uses a new tab for GitHub | Edge created the configured destination tab. The public repository was independently reachable. [Repository](https://github.com/nivijha/hisab-naki) |

The `frontend/app` route scan found two application pages and no separate login, settings, customer detail page, manual transaction form, or dedicated history route. Customer detail and history are inline dashboard states. The UI has no edit, delete, pagination, export, or manual entry controls. Some of those capabilities appear in current backend source and have no frontend integration.

### Interactive control inventory

Grouped controls were individually opened or activated where they share a row below. Dashboard entries describe local mock coverage unless a deployed check is explicitly identified.

| Page | Element | Expected behavior | Actual browser behavior | Status |
| --- | --- | --- | --- | --- |
| Landing | Navigation logo and footer logo | Return home and clear the section fragment | Both separately returned to the top of `/` from Features | Pass |
| Landing | Desktop links for How it works, Features, Who it’s for | Bring the corresponding heading below the fixed header | Each anchor reached the correct section. Features also worked on the deployed page | Pass |
| Landing | Desktop Open ledger | Open `/dashboard` | Dashboard rendered with mocks. The deployed shell opened with API calls blocked | Pass |
| Landing | Hero Open your ledger | Open `/dashboard` | Keyboard and emulated touch both reached the dashboard | Pass |
| Landing | See how it works | Scroll to the walkthrough | `#how-it-works` reached the visible section below navigation | Pass |
| Landing | Sample View ledger | Open the real dashboard view | Reached `/dashboard` | Pass |
| Landing | Sample Confirm and waveform | Explain the workflow visually | Static text and decorative motion, with no interactive element or microphone action | Informational |
| Landing | Mobile Open menu and Close menu toggle | Toggle the visible menu | Both directions worked | Pass |
| Landing | Mobile backdrop and Escape | Close menu and restore trigger focus | Both restored the trigger | Pass |
| Landing | Three mobile anchor links | Reach the target and dismiss menu | All three worked locally. Use Cases worked on the deployed mobile shell | Pass |
| Landing | Mobile Open ledger | Close menu and navigate to dashboard | Opened `/dashboard` | Pass |
| Landing | Tab after the final mobile menu item | Keep focus visible | Focus moved to Open your ledger behind the backdrop | Fail, A11Y-01 |
| Landing | Final Open HisabNaki and footer Open dashboard | Open `/dashboard` | Each independently opened the dashboard | Pass |
| Landing | Three footer section links | Scroll to their named sections | Each independently reached its anchor below the fixed header | Pass |
| Landing | GitHub repository | Open project in another tab | New tab reached configured public URL | Pass |
| Both routes | Browser Back, Forward, and refresh | Preserve valid page navigation | Back and Forward traversed landing and dashboard. Dashboard reload restored the mocked panels. Deployed landing reload also worked | Pass |
| Dashboard | Brand logo and Back to site | Return to `/` | Both worked locally. Deployed Back to site worked with financial API blocked | Pass |
| Dashboard | Start voice and Stop listening | Start and stop recognition and reflect state | Mock start displayed listening and the waveform. Stop returned to idle. Repeating the cycle sent no interpretation request | Pass with mocked speech |
| Dashboard | Voice feedback and transcript | Announce state, display recognized input separately, clear old transcript on restart | All verified. Unsupported, permission, silence, recognition-network, and interpretation failure states recovered when an error event or response arrived | Pass with mocked speech |
| Dashboard | Voice while an interpretation is pending | Allow recovery if the operation stalls | Processing stayed visible and the microphone stayed disabled during a held request | Fail, FE-03 |
| Dashboard | Find customer | Scroll and focus Customers | Landed below the sticky header without a new GET. Same shortcut worked in the deployed shell | Pass |
| Dashboard | Four financial cards | Show real returned values, distinguish pending and genuine zero | Normal, zero, empty, 503, and stale states behaved independently. Incomplete successful data rendered `₹NaN` | Fail on malformed input, FE-02 |
| Dashboard | Customer search, Clear search, Escape | Filter loaded data and preserve field focus when clearing | Full and partial names, case, Devanagari, formatted phone searches, duplicate IDs, no matches, true empty, and up to 3,003 rows were checked. Clear and Escape restored input focus | Pass |
| Dashboard | View ledger, reactivation, Close, Escape | Open by ID, show details, close and restore opener | All worked. A 404, failed transport, retry, mismatched ID, and delayed previous response were exercised. Search stayed intact on close | Pass |
| Dashboard | View history, Hide history, Close, Escape | Expand beyond five, close and restore opener | Preview showed five of eight mock rows. Expanded view showed all eight in order. Reopening used the previously loaded list | Pass |
| Dashboard | Back to voice in history | Return to visible voice heading | Restored focus to the voice heading and issued no request | Pass |
| Dashboard | Retry summary, Customers, recent transactions, expanded history, and customer ledger | Retry only the intended GET | Tested independent errors and retries. A retry retained applicable old data with a freshness label. Customer detail retry used the same ID | Pass with valid envelopes |
| Dashboard | Check transaction history after uncertain save | Open history and keep the outcome uncertain | History opened. Escape returned to this shortcut. Timeout, 503 and lost response sent no second write | Pass |
| Dashboard | Confirm | Review customer, amount and direction, send one write, lock pending actions | Credit, repayment, sale, and expense passed with explicit mock intents. Repeated clicks sent one write. Structured validation rejection and uncertain outcomes had different feedback. A held request had no recovery path | Fail on stalled request, FE-03 |
| Dashboard | Cancel and Escape confirmation | Cancel with no write and return to microphone | Both worked before submit. Initial focus, containment, and post-close restoration worked. During a pending write both actions stayed blocked | Pass with pending limitation FE-03 |

## 2. Test results

| Suite | Passed | Failed |
| --- | ---: | ---: |
| Approved dashboard, voice, ledger, layout, polish, motion, responsive, and journey assertions rerun | 377 | 0 |
| New route, link, menu, and external-navigation assertions | 28 | 1 |
| New search, speech, response, timing, and reliability edge cases | 22 | 5 |
| Measured shopkeeper journeys | 8 | 0 |
| Additional deployed navigation and runtime observer checks | 10 | 0 |
| Additional ledger and history close controls | 3 | 0 |
| **Total browser assertions** | **448** | **6** |

The in-memory parser diagnostic is separate from the browser counts. Of 13 cases, nine met the fixture's intent or safety expectation and four did not. The native microphone availability probe and performance measurements are separate observations. Browser inspection on valid local fixtures recorded the expected 404 for the deliberately unknown route and a separate favicon 404. The malformed-customer fixture produced a real client-side exception. [All browser results](../node_modules/.cache/hisabnaki-full-audit/) · [Parser cases](../node_modules/.cache/hisabnaki-full-audit/parser-diagnostic.json)

## 3. Measured shopkeeper journeys

The following runs used the 390 × 844 emulated viewport, reduced motion, and mock speech and financial events. An action is a tap, key press, one text entry, one supplied utterance, or a deliberate scroll. Distance is the sum of absolute within-page scroll changes at each step, including anchor and focus movement. Scroll resets on route changes are excluded. Counts depend on this fixture and the chosen path. They are not estimates of real shopkeeper behavior.

| Journey | Actions | Scroll distance | Deliberate scroll actions | Outcome and friction |
| --- | ---: | ---: | ---: | --- |
| J1 First visit | 1 | 0 px | 0 | The hero CTA opened the dashboard with the microphone and instructions visible. First-time comprehension needs a participant test. |
| J2 Record credit | 4 | 0 px | 0 | Landed, started voice, supplied the mock utterance, and confirmed. Transcript, direction, save feedback, and refresh worked. |
| J3 Record repayment | 4 | 0 px | 0 | Same path with an explicit payment intent. The contact and direction were readable and the expected payment request was sent once. |
| J4 Check a customer balance | 6 | 1,008 px | 1 | Used Find customer, typed, opened the correct ledger, inspected an entry, and closed it. The retained query and focus supported return. |
| J5 Find an older transaction | 4 | 2,437 px | 2 | Reached the eighth mock entry after opening history. Returning to the opener accounts for part of the measured movement. |
| J6 Recover from uncertain save | 5 | 1,995 px | 0 | Checked history using the direct shortcut and returned to the persistent warning. Automatic navigation accounted for the movement. |
| J7 Mobile counter sequence | 11 | 3,172 px | 1 | Customer lookup, history, return to voice, and confirmed mock credit completed. Switching between stacked panels remained scroll-intensive. |
| J8 Keyboard only | 33 | 1,728 px | 0 | Menu, Dashboard, independent retry, search, missing ledger, history, voice review, and Escape all completed. This path selected a menu item before the focus-escape defect tested separately. |

[Step-by-step action log and screenshots](../node_modules/.cache/hisabnaki-full-audit/Shopkeeper/results.json) · [Desktop and mobile voice and ledger journeys](../node_modules/.cache/hisabnaki-full-audit/Journeys-After/results.json)

## 4. Responsive, accessibility, and voice evidence

- **Widths.** Checked 320, 375, 390, 430, 639, 640, 641, 767, 768, 769, 1023, 1024, 1025, 1279, 1280, 1281, 1440, and 1920 CSS pixels. Existing responsive tests covered long customer names, large INR values, long descriptions, loading and errors, mobile navigation, touch targets, and short dialogs. No horizontal overflow was observed on the valid fixtures. [Responsive evidence](../node_modules/.cache/hisabnaki-full-audit/Responsive/results.json)
- **Keyboard and semantics.** Edge exposed a named search input, a polite voice status, and a named modal. Dialog focus started on Cancel, cycled within the modal, and returned to the microphone. Ledger and history dismissal returned focus to their openers. Hidden mobile menu focus and modal field-label contrast are exceptions. No full WCAG conformance claim or screen-reader speech check was made.
- **Reduced motion.** The active waveform had 32 animated bars in normal motion and zero in reduced motion. Listening status remained visible in both. The reduced-motion dialog stayed static. The decorative landing waveform stayed static. [Motion evidence](../node_modules/.cache/hisabnaki-full-audit/After/results.json)
- **Voice safety.** Explicit mock credit, repayment, sale, and expense intents reached review and sent the expected request when confirmed. A balance query used the read-only POST branch and performed no financial write. Mock unknown, negated-as-unresolved, and missing-field responses asked for clarification. The current parser can instead emit a complete unsafe draft for certain inputs. Successful media-track access verifies audio input availability in this environment. It does not verify real Hindi/Hinglish recognition, language selection, ambient-noise handling, or speech output.

## 5. Performance and reliability measurements

| Measurement | Observation |
| --- | --- |
| First Load JS from the approved build | Landing 100 kB, dashboard 98.9 kB |
| Local dashboard DOMContentLoaded | Approximately 24–37 ms across four unthrottled viewport and motion samples |
| Local initial layout shift | Dashboard CLS 0 at 390 px and up to 0.00470 at 1440 px. Landing up to 0.000044 |
| Throttled landing | 150 ms latency, 100,000 bytes/s download, and cache disabled. DOMContentLoaded 789 ms, load event 3,144 ms |
| Search input to rendered unique result | Medians 2.2 ms for 103 records, 12.5 ms for 1,003, and 33.5 ms for 3,003. Three samples each. Largest sample 52.8 ms. Initial rendering and paint are outside this input-to-DOM timing |
| API request count | Initial dashboard 3 GETs. Search, opening already-loaded full history, and successful read-only enquiry add 0 GETs. Confirmed save starts 3 parallel GETs. An uncertain save refreshes only transactions. Opening a customer ledger adds 1 ID-based GET |
| Background refresh at 390 px | An already-visible customer row moved 21 px in the delayed failure fixture. Retry completion moved that row 52 px as the status disappeared, while document scroll stayed fixed during completion |
| React commit sample | No extra commits during a 1.5-second settled window on landing and the listening dashboard at both reference sizes |
| Repeated interaction cleanup | 15 normal-motion recording cycles created and disconnected 15 waveform observers and returned tracked visibility listeners to baseline. Ten combined voice/history cycles added one measured JS listener and about 0.27 MB measured heap after GC. That small before/after sample is inconclusive for a memory leak |

Measurements describe the test machine, not field performance. Current measurements do not justify blanket memoization or a virtualized list. Retest search on a low-end device and with representative shop sizes if the 3,003-row stress case matches expected use. [Timing and search evidence](../node_modules/.cache/hisabnaki-full-audit/Edge-Cases/results.json) · [Observer and commit evidence](../node_modules/.cache/hisabnaki-full-audit/Live-Observers/results.json) · [Refresh evidence](../node_modules/.cache/hisabnaki-full-audit/Journeys-After/results.json)

## 6. Frontend API integration audit

Use the existing [Open Ledger API handoff](open-ledger-api-handoff.md) for request and response fields. The table below records the audited runtime behavior and source changes that the handoff should absorb after scope approval.

| Request | Frontend input and expected response | Failure and retry behavior |
| --- | --- | --- |
| `GET /api/dashboard/summary` | No query. `{ok:true,data:{businessName,todaysSales,todaysExpenses,paymentsReceived,totalOutstanding}}` or `data:null` | Initial skeleton and successful zero tested. Failed refresh retains data with a notice. A partial success object currently reaches currency formatting. |
| `GET /api/customers` | No query. `{ok:true,data:Customer[]}`. Each row has `id`, `name`, `outstandingBalance`, `transactionCount`, and optional `phone` | `[]` is a true empty list. Transport errors have independent retry. A malformed object currently reaches the search filter and crashes the page. |
| `GET /api/customers/:id` | URL-encoded selected customer ID. `{ok:true,data:{id,name,phone?,outstandingBalance,transactions}}` | 404, empty history, wrong ID, network error, retry, cancelled request, and stale response handled in browser tests. |
| `GET /api/transactions` | No query. `{ok:true,data:Transaction[]}` with stable IDs, API order, ISO `createdAt`, numeric `amount`, string `type` and `description`, optional customer name | Preview takes the first five. Expanded view lists the returned array in order. Malformed rows are handled as an error. Current frontend does not request pagination or filters. |
| `POST /api/ai/interpret` | `{transcript}`. `{ok:true,data:{intent,missingFields,customerName?,amount?,description?}}` | Transport failure and incomplete interpretation are handled when a result arrives. A held request lacks a deadline or in-place recovery. The frontend does not treat backend confidence as proof. |
| `POST /api/transactions` read branch | `{intent,customerName?,amount?,description?}`, with no `type`. `GET_BALANCE` and `GET_CUSTOMER_TRANSACTIONS` require a name. Other read intents are `GET_TOTAL_OUTSTANDING` and `GET_TODAY_TRANSACTIONS`. Nonblank `responseText` is required for success feedback | No write confirmation or repeated GET. API errors and missing `responseText` display errors. Voice lookup still relies on names. |
| `POST /api/transactions` write branch | `{intent,customerName,amount,description,type}` after Confirm. Type maps to `CREDIT`, `PAYMENT`, `SALE`, or `EXPENSE`. A successful `201` envelope can include `responseText` | Structured `400` is definite. Loss, 408, 5xx, and inconclusive outcomes are uncertain. Duplicate submission is prevented within the current dialog. There is no frontend idempotency key and no automatic retry. |

### Current source and handoff differences

- The backend now has process-local preview create, get, cancel and confirm routes. The frontend still sends the legacy direct transaction POST, so preview behavior and the preview store are outside this frontend flow. A database `idempotencyKey` field exists in the checked-in schema, but the audited direct write path does not accept or persist a key and the schema does not establish uniqueness for that key. A recovery contract remains open. [Preview route](../backend/src/routes/preview.ts) · [Preview controller](../backend/src/controllers/previewController.ts) · [Schema](../prisma/schema.prisma)
- The no-query transactions route preserves the legacy array. Supplying any supported history query parameter now returns a paged object with `transactions`, `total`, `page`, `limit`, and `totalPages`. Transaction detail and customer update/delete routes also exist without frontend controls. The old handoff's history metadata statement applies to the no-query dashboard shape. Existing repos sort by `createdAt` descending without a tie-breaker. [Transaction routes](../backend/src/routes/transactions.ts) · [Transaction controller](../backend/src/controllers/transactionController.ts)
- CORS is configurable through `CORS_ORIGIN` with `*` as fallback, and the dashboard service resolves a business name from the service or fallback setting. The current frontend adds no auth header or cross-origin cookie credentials. Current handlers still use a default user and show no authenticated business selection. Authentication/session mechanics and per-shop authorization need an agreed and tested contract. [Server](../backend/src/server.ts) · [Dashboard service](../backend/src/services/dashboard/dashboardService.ts)
- The checked-in database schema models business ownership and decimal amounts. The generated local client and current repositories still use legacy `userId` on Customer and Transaction. The local generated transaction amount is `Int`, while the schema declares `Decimal(14,2)` and allows a nullable description. No database was connected. Agree on schema/client alignment and normalize amount precision and serialized response shape before live integration. The current frontend validates numeric transaction amounts and requires a string description. [Static shape diagnostic](../node_modules/.cache/hisabnaki-full-audit/prisma-shape-review.json) · [Transaction repository](../backend/src/repositories/transactionRepository.ts)
- Validators now return `400 {ok:false,message:'Validation failed',errors:[{path,message}]}`. The dashboard displays the top-level message in a definite write rejection. Field-level detail is available for a later UX decision. The parser paragraph in the old handoff needs revision to reflect the current diagnostic below. [Validation middleware](../backend/src/middleware/validate.ts)

## 7. Prioritized issues

### Confirmed frontend defects

| ID and severity | Feature, reproduction, expected result | Actual result and impact | Evidence, owner, and smallest correction |
| --- | --- | --- | --- |
| **FE-01 · High** | Dashboard. Return `200 {ok:true,data:{customers:[]}}` from `GET /api/customers`. Expected an isolated Customers error with retry | `filter is not a function` crashed the page and hid the summary, history, and microphone | [Screenshot](../node_modules/.cache/hisabnaki-full-audit/Edge-Cases/malformed-customers.png) · [Dashboard source](../frontend/app/dashboard/page.tsx). Frontend: validate array and required row fields at the response boundary and reuse the existing error view. |
| **FE-02 · High** | Summary. Return `200 {ok:true,data:{businessName:'Partial response'}}`. Expected unavailable amounts and a retry | Four `₹NaN` amounts and no summary retry. A shopkeeper cannot tell whether the data is invalid or the ledger calculated a value | [Screenshot](../node_modules/.cache/hisabnaki-full-audit/Edge-Cases/malformed-summary.png) · [Dashboard source](../frontend/app/dashboard/page.tsx). Frontend: validate all displayed amounts as finite numbers while preserving valid zero and `null` semantics. |
| **FE-03 · High** | Voice. Hold interpretation, or confirm and hold a save response. Expected a bounded, understandable recovery path | After six seconds, interpretation stayed disabled with no recovery control. Save stayed open with Confirm and Cancel disabled. Source inspection found no frontend deadline on either path. Users can abandon work or later repeat a possibly committed write | [Interpretation screenshot](../node_modules/.cache/hisabnaki-full-audit/Edge-Cases/stalled-interpreter.png) · [Save screenshot](../node_modules/.cache/hisabnaki-full-audit/Edge-Cases/stalled-save.png) · [Dashboard source](../frontend/app/dashboard/page.tsx). Frontend: add deadline and late-response protection. Let interpretation retry safely. Route a timed-out save to the existing uncertainty view and avoid resubmission. Backend: provide durable reconciliation. |
| **FE-04 · Low** | Landing. Load the local page with the network log open. Expected a site icon or no failed favicon request | Browser requested `/favicon.ico` and received 404. A standalone console error and missing site icon were visible | [Browser log](../node_modules/.cache/hisabnaki-full-audit/Navigation/results.json) · [App layout](../frontend/app/layout.tsx). Frontend: supply the existing brand mark through route metadata or a local favicon asset. |

### Accessibility issues

| ID and severity | Reproduction and expected result | Actual result and impact | Evidence, owner, and correction |
| --- | --- | --- | --- |
| **A11Y-01 · High** | At 390 px, open the landing menu by keyboard and press Tab five times. The focused control should be visible | Focus landed on hero Open your ledger while the mobile `Close navigation` backdrop covered it. A keyboard user can lose their place | [Screenshot](../node_modules/.cache/hisabnaki-full-audit/Navigation/mobile-menu-keyboard.png) · [Navbar](../frontend/components/sections/navbar.tsx). Frontend: dismiss the overlay when focus leaves or constrain keyboard navigation while it is open. Preserve Escape and opener restoration. [W3C focus visibility guidance](https://www.w3.org/WAI/WCAG22/Understanding/focus-not-obscured-minimum.html) |
| **A11Y-02 · Medium** | Open a mocked credit confirmation and inspect the 14 px Amount label on its white surface. Expected at least 4.5:1 | Browser-computed and composited contrast was **2.82:1**. Faint field labels make a financial review harder to scan | [Screenshot](../node_modules/.cache/hisabnaki-full-audit/Edge-Cases/confirmation-label-contrast.png) · [Dashboard source](../frontend/app/dashboard/page.tsx). Frontend: use the existing muted or forest text token on these labels and remeasure. [W3C minimum text contrast](https://www.w3.org/WAI/WCAG22/Understanding/contrast-minimum.html) |

### UX and performance observations

| ID and severity | Reproduction, expectation, and finding | Impact and proposed response |
| --- | --- | --- |
| **UX-01 · Medium** | At 390 px, run J5 for the eighth entry and J7 for several counter tasks. The expected ability to complete both flows held. The observed round trips moved **2,437 px** and **3,172 px** respectively | Repeated context changes can interrupt counter work. Frontend: test a single nearby return or history shortcut with users before changing layout or adding controls. [Measured journeys](../node_modules/.cache/hisabnaki-full-audit/Shopkeeper/results.json) |
| **UX-02 · Low** | Request an unknown route. The default 404 explained the error and offered zero navigation actions | A mistyped or stale link requires the browser Back button or address bar. Frontend: consider a minimal Home and Open Ledger recovery path using existing styles. [404 screenshot](../node_modules/.cache/hisabnaki-full-audit/Navigation/not-found.png) |
| **PERF-01 · Observation** | Filter a 3,003-record mock list. It returned the correct ID, with a 33.5 ms median input-to-DOM time and 52.8 ms worst sample | No verified deployment performance blocker. Retest on lower-end hardware before considering changes to rendering or server search. [Search timings](../node_modules/.cache/hisabnaki-full-audit/Edge-Cases/results.json) |

### Backend, database, and integration blockers

| ID and severity | Reproduction and expected behavior | Observed finding, impact, and next owner |
| --- | --- | --- |
| **INT-01 · Critical** | Run the current in-memory parser on an electricity bill, a negated credit phrase, a bare sale, and a Devanagari repayment. Expected correct intent and verified identity or safe clarification | Electricity became `ADD_CREDIT` at 0.9 confidence. “Raju ko 450 rupaye udhaar mat dena” became a complete `RECORD_PAYMENT` draft at 0.9. The bare sale invented `Aaj Hui`, and the Devanagari repayment fell into `GET_BALANCE` with a missing name. The previously flagged exact Romanized repayment and balance phrases classified correctly in this checkout. Backend: test current and prior utterances, honor negation, and explicitly return unresolved identity or intent. A complete wrong draft can be confirmed. [Parser diagnostic](../node_modules/.cache/hisabnaki-full-audit/parser-diagnostic.json) · [Parser source](../backend/src/services/ai/intentService.ts) |
| **INT-02 · Critical** | Trace dashboard GETs and writes to current route registration. Expected authenticated shop scope and authorization at each route | The browser sends no credentials beyond default same-origin behavior, and reviewed routes resolve the default user. There is no verified production cross-shop access test. Backend and integration: agree session transport, isolate shops on the server, and test with two synthetic shops. [Server](../backend/src/server.ts) · [Transaction controller](../backend/src/controllers/transactionController.ts) |
| **INT-03 · Critical** | Inspect generated Prisma metadata against `schema.prisma` and repository queries. Expected one consistent owner and amount model | Generated models and repositories use legacy `userId`. Current schema uses `businessId` and `createdByUserId` and stores decimal amounts. A regenerated client and migrated database require alignment. Database and backend: verify fresh generation and migration on isolated staging and agree serialized amounts, nullable descriptions, and date semantics. No database execution was performed. [Shape evidence](../node_modules/.cache/hisabnaki-full-audit/prisma-shape-review.json) · [Schema](../prisma/schema.prisma) |
| **INT-04 · High** | Follow the direct write path after an uncertain result. Expected a durable operation identity and status/replay semantics | The legacy browser POST has no operation ID and the direct route does not wire the schema's optional key into the write. Preview storage is process-local and unused by this frontend. Backend and database: agree durable per-shop deduplication and reconciliation before enabling retry. [Handoff](open-ledger-api-handoff.md) · [Preview controller](../backend/src/controllers/previewController.ts) |
| **INT-05 · High** | Run a same-name customer scenario. Expected voice read and write access to use unambiguous authorized identity | Browser ledger details correctly use IDs. Voice query and write payloads still use `customerName`, and the current service resolves by name. Backend and frontend integration: agree an ID-resolution flow that requests clarification for multiple matches. [Customer service](../backend/src/services/ledger/customerService.ts) · [Frontend journey evidence](../node_modules/.cache/hisabnaki-full-audit/Journeys-After/results.json) |

## 8. Correction plan and readiness

1. **Frontend financial resilience.** Approve boundary validators for Customers and Summary, read-request deadlines, and safe uncertain-save timeouts. Add regression cases for malformed 200s, delayed responses, navigation during recovery, and duplicate prevention.
2. **Frontend accessibility.** Keep mobile menu focus visible and raise confirmation field-label contrast using existing tokens. Repeat keyboard checks across mobile and breakpoint widths and verify with real assistive technology if available.
3. **Backend and database handoff.** Fix parser ambiguity and identity, align repositories with the checked-in schema, and agree on session and write reconciliation contracts. Reconcile existing handoff drift before integrating preview or pagination. Use synthetic shops on isolated staging.
4. **Usability and final release verification.** Observe real shopkeepers and test physical Hindi/Hinglish recognition, audible playback, low-end mobile, and actual assistive technology. Validate whether shorter history round trips or a 404 recovery link merit changes. Rerun the suite on the release candidate, including real authorized API and PostgreSQL reconciliation in staging.

| Major area | Classification | Basis |
| --- | --- | --- |
| Landing and route navigation | Working and verified | Local route, CTA, anchor, footer, Back/Forward, and separate deployed shell checks |
| Mobile keyboard menu | Broken | Keyboard focus moved behind the active backdrop |
| Dashboard normal, loading, empty, stale and HTTP error handling | Working with limitations | Malformed successful summary and customers responses fail safely only where validation exists. The two discovered failures need correction |
| Search, ID-based customer ledger, and returned transaction history | Working and verified | Mocked responses and browser interaction. Successful results are scoped to the API response |
| Voice UI and financial confirmation | Working with limitations | Mocked normal and error flows passed. The stalled-request path and label contrast need correction |
| Real voice intent and transaction safety | Blocked by backend/database | Unsafe parser outputs, name ambiguity, scope, schema alignment, and durable reconciliation |
| Physical browser input availability | Working with limitations | A native audio track opened and was released. Speech recognition and playback accuracy are unverified |
| Production financial operations, shopkeeper comprehension and screen-reader speech | Not verified | Production financial API was blocked and no real participant or assistive technology run was conducted |

### Evidence index

- [Landing 390 × 844](../node_modules/.cache/hisabnaki-full-audit/Navigation/landing-390x844.png) · [Landing 1440 × 900](../node_modules/.cache/hisabnaki-full-audit/Navigation/landing-1440x900.png)
- [Dashboard 390 × 844](../node_modules/.cache/hisabnaki-full-audit/Journeys-After/dashboard-390x844-full.png) · [Dashboard 1440 × 900](../node_modules/.cache/hisabnaki-full-audit/Journeys-After/dashboard-1440x900-full.png)
- [Credit review](../node_modules/.cache/hisabnaki-full-audit/Journeys-After/credit-review-390x844.png) · [Repayment review](../node_modules/.cache/hisabnaki-full-audit/Journeys-After/payment-review-390x844.png) · [Uncertain-save history](../node_modules/.cache/hisabnaki-full-audit/Journeys-After/uncertain-history-390x844.png)
- [Deployed landing](../node_modules/.cache/hisabnaki-full-audit/Navigation/deployed-landing.png) · [Deployed dashboard with API blocked](../node_modules/.cache/hisabnaki-full-audit/Navigation/deployed-dashboard.png) · [Deployed mobile menu](../node_modules/.cache/hisabnaki-full-audit/Live-Observers/deployed-mobile-menu.png)

Audit complete. Implementation requires approval.

## Phase 8 final verification and integration handoff

**Audit date:** 22 Nov 2026. **Scope:** current checkout, frontend only. No application UI or backend code was changed during Phase 8. Phase 8 deliverables are this report, the corrected dashboard summary description in [the API handoff](open-ledger-api-handoff.md), and the authentication/membership contract test files `frontend/lib/api-client.auth.test.cjs` and `frontend/lib/membership-contract.test.cjs`. Existing Phase 2–7 implementation remains in the shared working tree and is preserved.

### Current route and feature inventory

Routes discovered from `frontend/app` and loaded in the isolated local production build:

| Route | Current UI and controls | Phase 8 evidence |
| --- | --- | --- |
| `/` | Brand links, desktop navigation anchors, mobile menu/backdrop, hero CTAs, sample ledger (illustrative), walkthrough, problem/solution, features, use cases, final CTA, footer section links and external repository link | Edge loaded landing at 390×844 and 1440×900; mobile Escape/focus restoration and dashboard CTA were exercised. Other section links were source-inspected in this Phase 8 run; historical deployed-navigation evidence is in the prior audit above. |
| `/login` | Email/phone identifier, password visibility toggle, required-field feedback, submit/loading, invalid-credential/network/rate-limit feedback | Mocked Edge flow covered invalid credentials, visibility toggle, successful login, membership fetch and login route transitions. Auth client contract tests covered malformed JSON, 401, 429, and credential URL exclusion. Network retry, live auth, and actual 429 display were not exercised in the browser run. |
| `/business/select` | Membership loading/error/empty states, explicit membership selection by membership/business IDs, retry and logout | Mocked Edge selected Shop Alpha then switched to Shop Beta; duplicate business names are covered in contract tests by IDs. Zero memberships, malformed response, revoked membership, and actual 403 were not browser-exercised in Phase 8. |
| `/dashboard` | Back to site, switch business, logout; voice panel/microphone, transcript and preview suggestion; Find customer; five summary metrics; customer search, Add/Edit/Delete; ledger view; transaction preview; history filters/pagination/detail actions; manual-entry review-only controls; panel retry/loading/empty/error states | Mocked Edge covered customer search and ledger, history open and type filter, manual SALE review (no submission), synthetic speech→preview, local preview dismissal, business switch, logout/protected re-entry, and 18-width overflow scan. CRUD mutations, detail route/view, all panel failure states, date/customer filters, pagination controls, real timeout behavior, and confirmation were not all exercised in Phase 8. Live confirmation is intentionally disabled. |
| Unknown path | Next.js default not-found route | Not directly opened in Phase 8; source/build only. |

The reusable source inventory includes auth provider and access boundary, shared API client, preview and transaction contract normalizers, voice waveform, cards/buttons, scroll reveal, and landing sections. Controls not explicitly listed above are not claimed as browser-tested simply because their source exists.

### Current API surface and safety

All frontend `fetch` use is centralized in `frontend/lib/api-client.ts`. Verified frontend request groups are:

| Method/path | Scope and current use | Phase 8 status |
| --- | --- | --- |
| `POST /api/auth/login` | Public login; `{ identifier, password }` | Mocked in Edge and API-client contract tests. No bearer/business headers. |
| `GET /api/auth/memberships` | Authenticated membership retrieval; bearer only | Mocked in Edge and membership contract tests. |
| `GET /api/dashboard/summary` | Authenticated selected-business summary | Mocked in Edge; API client injects bearer and `X-Business-ID`. |
| `GET/POST /api/customers`, `GET/PATCH/DELETE /api/customers/:id` | Business-scoped list and customer CRUD | List/detail reads exercised in Edge. Mutations were not exercised in this Phase 8 browser run; contract is documented in API handoff/backend routes. No PostgreSQL persistence was tested. |
| `GET /api/transactions` | Business-scoped preview/history; supported type/customer/date/page filters | History and type filter exercised in Edge. Other filter combinations and boundaries are source/contract-inspected, not browser-verified in Phase 8. |
| `GET /api/transactions/:id` | Business-scoped read-only transaction detail | Present in frontend; not opened in this Phase 8 browser run. |
| `POST /api/preview` | Authenticated transcript interpretation and server-held preview creation | Mocked Edge and contract tests. It does not commit a transaction according to backend source inspection. |
| `POST /api/transactions`, `POST /api/preview/:id/confirm`, `POST /api/preview/:id/cancel` | Financial write, confirmation, and server-side cancellation | No such request was made by the tested dashboard flow. Live confirmation and cancellation are intentionally unavailable in UI. Do not infer server authorization from client headers or route guards. |

Selected-business requests are denied by the API client until token and business context exist. Tests cover context changes, logout, and stale-response rejection for transaction/preview reads. Browser A→B synthetic fixtures verified that the request headers changed to `business-beta`, Beta data displayed, and Alpha customer text disappeared. This is frontend state isolation only, not server-side tenant authorization verification.

Authentication remains memory-only: a browser reload requires login and business selection again. Client guards improve navigation but are not a security boundary. Phase 7 preview review is a server suggestion, not a saved ledger result. The preview store's lifetime, missing stable customer ID/expiry, parser accuracy, amount-rounding mismatch, confirmation idempotency and lost-response reconciliation remain backend handoff blockers detailed in [the API handoff](open-ledger-api-handoff.md). The UI makes no direct financial write, live confirmation, or preview-cancel request.

### Executed verification and evidence

| Check | Result | Evidence/method |
| --- | --- | --- |
| Browser journeys | **17 passed, 0 failed** | Microsoft Edge 158.0.4370.33 headless via Chrome DevTools Protocol, local isolated production build on port 4174. All `/api/*` responses were intercepted with synthetic data; speech event was simulated. Results: [`results.json`](../node_modules/.cache/hisabnaki-full-audit/Phase8/results.json). |
| Responsive overflow | **36 width/page measurements; 0 px overflow in all** | Landing and dashboard at 320, 375, 390, 430, 639, 640, 641, 767, 768, 769, 1023, 1024, 1025, 1279, 1280, 1281, 1440 and 1920 px. Compared document `scrollWidth` with `clientWidth`; vertical scrollbar width is excluded. This is an overflow check, not a complete visual/touch-target audit at every width. |
| Frontend contract/state tests | **27 passed, 0 failed** | Node built-in `node:test`, six existing `frontend/lib/*.test.cjs` suites, including auth, membership, preview, transaction normalization, filtering, and stale request/client context behavior. They do not simulate all dashboard JSX journeys. |
| TypeScript | **Passed** | `npm.cmd exec --workspace frontend -- tsc --noEmit`. |
| Production build | **Passed** | `npm.cmd run build --workspace frontend`; Next.js 14.2.15. Routes built: `/`, `/business/select`, `/dashboard`, `/login`, `/_not-found`. Dashboard first-load bundle reported 109 kB. |
| Whitespace check | **Passed** | `git diff --check`; Git emitted a non-fatal LF→CRLF warning for the API handoff Markdown file. |
| Backend test startup | **Not executed** | Prior Phase 7 parser/service test invocation failed before test execution because `tsx` startup reported `uv_os_get_passwd returned ENOMEM` under Node 24.16.0. This is not a backend pass or a test assertion failure. No backend tests/database integration were run in Phase 8. |

Screenshots from the Phase 8 local mocked run:

- Landing: [390×844](../node_modules/.cache/hisabnaki-full-audit/Phase8/phase8-landing-390x844.png), [1440×900](../node_modules/.cache/hisabnaki-full-audit/Phase8/phase8-landing-1440x900.png)
- Dashboard: [390×844](../node_modules/.cache/hisabnaki-full-audit/Phase8/phase8-dashboard-390x844.png), [1440×900](../node_modules/.cache/hisabnaki-full-audit/Phase8/phase8-dashboard-1440x900.png)
- Preview suggestion: [390×844](../node_modules/.cache/hisabnaki-full-audit/Phase8/phase8-preview-390x844.png), [1440×900](../node_modules/.cache/hisabnaki-full-audit/Phase8/phase8-preview-1440x900.png)

The browser was a clean isolated production build made from the current frontend source. A stale dev server occupied the standard ports and shared the checkout's `.next`; to avoid changing or terminating it, the browser build used a temporary copy with a separate build directory and the same Inter font asset. This does not test the deployed Vercel app or a live API. The screenshot evidence files are under ignored `node_modules/.cache`, not committed product assets.

### User-journey coverage matrix

| Journey | Result and evidence class |
| --- | --- |
| A. Landing → Login → Select Business → Dashboard | **Browser-tested with mocks.** |
| B. Search → View Customer → Edit → Return | Search and view/return were **browser-tested with mocks**; edit step **not tested in Phase 8 browser run**. |
| C. Create Customer → Refresh List | **Not browser-tested** in Phase 8; create/list contract behavior is not evidence of persistence. |
| D. Delete Eligible Customer | **Not browser-tested** in Phase 8. |
| E. Customer Deletion Conflict | **Not browser-tested** in Phase 8. |
| F. Filter History → Transaction Details | History and type filter were **browser-tested with mocks**; transaction detail action **not tested in Phase 8 browser run**. |
| G. Manual Entry → Review → Understand Submission Is Disabled | **Browser-tested with mocks** for SALE; no POST to `/api/transactions` occurred. Other type form variants were not individually browser-tested. |
| H. Voice Input → Server Preview → Review Suggestion | **Browser-tested with simulated speech and mocked preview**; physical recognition and parser correctness were not tested. |
| I. Business A → B without displayed data leakage | **Browser-tested with synthetic fixtures**; no real server isolation claim. |
| J. Session Expiration → Login Recovery | API/provider contract and source reviewed; **not browser-tested end-to-end in Phase 8**. |
| K. Network Error → Retry | **Not browser-tested in Phase 8**; localized retry behavior is present in source and earlier phase evidence but is not a current-run pass. |
| L. Logout → Protected Route Re-entry | **Browser-tested with mocks.** |

### Accessibility, security, and readiness

- Browser checks confirmed mobile-menu Escape dismissal and focus restoration, login password visibility, and protected route redirection after logout. Prior completed dialog-focus/reduced-motion work is preserved, but the current Phase 8 browser run did not retest full screen-reader announcements, modal tab cycling, all short-height views, or reduced-motion across every route.
- No physical microphone input, Hindi/Hinglish speech recognition accuracy, text-to-speech playback, screen-reader speech, real touch device, other browser engine, or real shopkeeper usability session was tested in Phase 8.
- No staging credentials/API/database were available to this run. Authentication enforcement, membership revocation, actual tenant isolation, CRUD persistence, transaction ordering/completeness, and database reconciliation remain unverified against a live backend.
- In-memory JWT means refresh loses auth. Preview creation is a non-committing operation per source inspection, but process-local preview state and unsafe parser/confirmation/reconciliation guarantees block real financial confirmation. No real financial use should be approved from this Phase 8 evidence.

| Area | Phase 8 classification | Basis |
| --- | --- | --- |
| Landing/login/business selection/dashboard navigation | **Verified in browser with mocks** | Edge run described above. |
| Login and membership contracts | **Verified through automated contract tests** | 7 auth/membership-focused cases among 27 total. |
| Dashboard reads, search, customer ledger, history type filter | **Verified in browser with mocks** | Synthetic data only; not a live API claim. |
| Customer CRUD persistence and transaction-detail journey | **Implemented but unverified** | Not exercised in current Phase 8 browser run and no staging DB. |
| Authenticated backend and shop isolation | **Blocked by backend / not verified live** | Header/client behavior is tested; server authorization not tested. |
| Voice capture and preview UI | **Verified in browser with simulated speech and mocked API** | Real microphone/parser accuracy not verified. |
| Financial confirmation, preview cancellation, manual transaction write | **Intentionally unavailable** | Frontend safety gate; no write calls from tested workflows. |
| Responsive horizontal overflow at tested widths | **Verified in browser with mocks** | 36 measurements at 18 widths across landing/dashboard. Other responsive affordances not fully retested at every width. |
| Real financial deployment readiness | **Blocked by backend/database** | Parser, identity, money precision, durable preview, authorization, idempotency and reconciliation remain outstanding. |

### Prioritized release blockers and handoff

1. **Critical — backend parser safety:** classify CREDIT/PAYMENT/SALE/EXPENSE reliably, honor negation, and return explicit unresolved/clarification states for ambiguity and missing identity. Do not use frontend keyword guessing.
2. **Critical — durable confirmation outcome:** persist previews across processes, publish authoritative expiry, guarantee idempotency, and provide a reconciliation/status path after lost responses. A retryable server error alone is not proof that no commit occurred.
3. **Critical — real authorization and tenant isolation:** validate bearer sessions and active membership server-side for every scoped route; test two synthetic businesses and revoked memberships on isolated staging.
4. **High — customer identity and amount semantics:** previews should identify a stable authorized customer ID or explicit ambiguity; align rounding/precision/limits and nullable response fields with the database contract.
5. **High — live integration:** backend/database team to provide staging URL, synthetic accounts/businesses, migration/generated-client confirmation and response examples; run safe login, membership, dashboard, CRUD and read-only history checks. No production writes.
6. **Frontend follow-up before broader user validation:** run the untested CRUD/detail/error/retry journeys, full keyboard/modal/reduced-motion matrix, real browser/device testing, and test a changed response under network delay. Current Phase 8 found no new confirmed frontend defect; untested areas are not passes.

**Readiness verdict:** the current frontend builds and its tested mocked navigation, business context transitions, read-only dashboard interactions, review-only manual flow, and preview suggestion are suitable for continued integration testing. It is **not ready for real financial use or production financial deployment** until backend authorization, parser correctness, persistence, precision, idempotency, and lost-response reconciliation are verified, and the listed untested frontend journeys are run against an approved staging environment.
