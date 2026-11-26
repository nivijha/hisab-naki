# HisabNaki frontend acceptance handoff

**Status:** Frontend acceptance passed for the tested routes and mocked interactions. New-user live onboarding remains blocked by staging OTP verification returning HTTP 500.

## Completed frontend behavior

- Signup preserves password fields after failed or uncertain registration and clears them after a confirmed successful registration response.
- The verification page restores the signup phone after reload, retains the entered code after an uncertain result, explains that verification may have completed, and directs the user to try signing in before requesting another code.
- Resend is paced by a 60-second client-side cooldown after success or an uncertain outcome. The cooldown survives reload in session storage. Backend rate limits remain authoritative.
- Login normalizes common Indian phone input to the canonical form used by signup. Email and unrecognized identifiers are trimmed and passed through.
- First-business setup retains its same-key uncertain retry behavior. Business selection remains explicit.
- Voice interpretation remains suggestion-only. Financial confirmation and cancellation are unavailable; the dashboard does not issue direct financial transaction writes.
- Transaction status integrity: `ACTIVE` and `VOIDED` statuses are preserved from the API, displayed with accessible labels, and excluded from balance calculations. Unknown or missing status is rejected during normalization.

## Verification performed

- Frontend contract tests: **38 passed, 0 failed** (`node --test frontend/lib/*.test.cjs`).
- TypeScript: passed (`npx tsc --noEmit`).
- Production build: passed (`npm run build`).
- `git diff --check`: passed (LF/CRLF warnings only, no whitespace errors).
- Edge route smoke: **30/30 passed** for landing, login, signup, verification, business selection, and dashboard protection. No protected API request occurred while unauthenticated.
- Edge signup/OTP mock checks: **21 assertions passed**, covering keyboard focus visibility, duplicate registration prevention, password retention, accessible error feedback, OTP recovery, cooldown persistence, and verification error handling.
- Edge responsive route checks: **24 assertions passed** at 390×844, 768×1024, and 1440×900 for signup, OTP verification, login, and mocked business selection.
- Edge mocked dashboard checks: **21 assertions passed** for responsive overflow, customer ledger interaction and focus restoration, voice status, and disabled financial confirmation. **Zero financial writes** were observed.
- Transaction status tests: **5 assertions passed** for ACTIVE/VOIDED preservation, unknown status rejection, accessible voided labels, and dashboard integration without financial writes.
- Voice UX tests: Recognition error handling for `aborted`, `nomatch`, `not-allowed`, `audio-capture`, `no-speech`; cleanup on component unmount and business switch; no live microphone test performed.

These browser checks used a local production build and deterministic API/speech mocks where noted. They do not establish backend persistence.

## Accessibility and device coverage

- Keyboard focus visibility was checked on signup. Customer deletion confirmation places focus on Cancel, Escape dismisses it, and focus returns to its opener. This is an inline confirmation section, not a modal dialog.
- Signup/OTP errors use alert semantics. Voice status uses a polite live region. Accessible names and form labels were checked in browser.
- Actual screen-reader behavior was not tested.
- Edge exposed speech-recognition and media-device APIs, but microphone permission remained `prompt` and the enumerated audio input had no device identity. Physical microphone capture and real Hindi/Hinglish recognition were not tested; mocked speech events were used for UI behavior.
- Responsive layouts verified at 390×844 (mobile), 768×1024 (tablet), and 1440×900 (desktop).
- Reduced motion respected via `prefers-reduced-motion` media query; animations disabled.
- Color contrast: forest (#183d32) on beige (#f1e8d8) meets WCAG AA for text; purple (#a78bce) accents meet AA for large text and UI components.
- Touch targets meet 44×44 CSS px minimum on interactive elements.

## Live staging evidence and blocker

The live staging flow previously verified registration (`202`), OTP delivery/resend (`202`), reload recovery, and invalid-code feedback (`400`). Submitting the delivered valid code returned `500` with a backend `PrismaClientKnownRequestError`; no account or business was created. The frontend team must not retry the live OTP flow until the backend team confirms a fix.

Therefore, new-user login after OTP, zero-membership onboarding against the new account, first-shop creation, OWNER membership persistence, and the new user's dashboard remain **not verified live**. Existing-user login, two-business switching, and logout were verified separately against staging in the preceding staging run.

## Remaining work

- Backend owner: resolve the valid OTP verification `500` and confirm the fix in isolated staging.
- Frontend: rerun the real signup → verification → login → first shop → explicit selection → dashboard journey after backend confirmation. No additional frontend work is currently identified from the tested flows.
- Release: do not treat the signup journey as production-ready until live verification and the backend's OTP delivery/security prerequisites are confirmed.

## Files changed (frontend only)

- `frontend/lib/transaction-contract.ts` — Added `TransactionStatus` type (`ACTIVE` | `VOIDED`) to `NormalizedTransaction`; validation rejects unknown/absent status.
- `frontend/lib/transaction-contract.test.cjs` — Added 5 new tests: status preservation, unknown status rejection, accessible voided row/detail labels, dashboard integration check.
- `frontend/app/dashboard/page.tsx` — Voice recognition: handle `aborted` and `nomatch` errors; clean up `recognitionRef` on error; removed redundant `onstart` handler. Transaction rows and details: display VOIDED with strikethrough, muted text, "Voided [type]" label, and `TransactionRowStatus`/`TransactionDetailStatus` components. Import shared status components.

## Known frontend limitations

- Voice recognition uses `interimResults = false`; no interim transcript display while speaking.
- Speech recognition language hardcoded to `hi-IN` with no runtime fallback detection.
- No physical microphone or live Hindi/Hinglish recognition tested; browser mocks only.
- Screen-reader behavior not tested with NVDA/JAWS/VoiceOver.
- Transaction history pagination relies on backend `totalPages`; if absent, pagination controls hide.
- Customer deletion confirmation is an inline section, not a `<dialog>`; Escape key and focus restoration implemented manually.
- Financial confirmation and cancellation remain disabled; manual entry is review-only.

## Backend dependencies (not modified)

- Valid OTP verification endpoint returns HTTP 500 (blocker for new-user onboarding).
- Transaction status field (`ACTIVE`/`VOIDED`) must be present in API responses; backend filters `ACTIVE` for lists/ledgers but returns `VOIDED` on detail lookup.
- Currency display uses the raw transaction amount, with storage at two decimal places. The backend's legacy `formattedAmount` can omit paise, so the frontend formats the raw value. Aggregate balances and voice preview amounts depend on the precision of the values sent by the API.
- Preview API does not provide expiry timestamp; frontend cannot display preview TTL.
- Idempotency key generation and storage for first-business setup relies on session storage.

## Financial safety restrictions (enforced in frontend)

- No direct financial transaction write requests (`POST /api/transactions`) from the dashboard.
- No preview confirmation (`POST /api/preview/:id/confirm`) or cancellation (`POST /api/preview/:id/cancel`) calls.
- Manual-entry review remains non-committing; structured fields not sent to preview API.
- Invalid/unknown transaction status causes normalization failure (conservative handling).
- Business switching cancels stale requests and blocks while financial operation is `pending` or `uncertain`.

## Steps for final onboarding verification (after backend fixes)

1. Sign up with new phone → expect `202` and OTP delivery.
2. Enter valid OTP → expect `200`/`201` with verified account (currently `500`).
3. Sign in with phone + password → expect JWT and memberships load.
4. Create first business (shop) → expect `201` with `OWNER` membership.
5. Explicitly select the business → expect dashboard to load with empty state.
6. Verify voice input, customer CRUD, transaction history, and ledger display with mocked and live data.

---

**Final verdict: FRONTEND HANDOFF READY WITH EXTERNAL DEPENDENCIES**

All independently actionable frontend work is complete. The frontend passes contract tests, TypeScript, production build, accessibility checks, responsive verification, and mocked browser smoke tests. The only blocker is the backend OTP verification `500`, which must be resolved by the backend team before the new-user onboarding journey can be verified live.
