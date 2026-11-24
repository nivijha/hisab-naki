# HisabNaki frontend acceptance handoff

**Status:** Frontend acceptance passed for the tested routes and mocked interactions. New-user live onboarding remains blocked by staging OTP verification returning HTTP 500.

## Completed frontend behavior

- Signup preserves password fields after failed or uncertain registration and clears them after a confirmed successful registration response.
- The verification page restores the signup phone after reload, retains the entered code after an uncertain result, explains that verification may have completed, and directs the user to try signing in before requesting another code.
- Resend is paced by a 60-second client-side cooldown after success or an uncertain outcome. The cooldown survives reload in session storage. Backend rate limits remain authoritative.
- Login normalizes common Indian phone input to the canonical form used by signup. Email and unrecognized identifiers are trimmed and passed through.
- First-business setup retains its same-key uncertain retry behavior. Business selection remains explicit.
- Voice interpretation remains suggestion-only. Financial confirmation and cancellation are unavailable; the dashboard does not issue direct financial transaction writes.

## Verification performed

- Frontend contract tests: **34 passed, 0 failed** (`node --test frontend/lib/*.test.cjs`).
- TypeScript: passed (`npx.cmd tsc --noEmit`).
- Production build: passed (`npm.cmd run build`).
- `git diff --check`: passed.
- Edge route smoke: **30/30 passed** for landing, login, signup, verification, business selection, and dashboard protection. No protected API request occurred while unauthenticated.
- Edge signup/OTP mock checks: **21 assertions passed**, covering keyboard focus visibility, duplicate registration prevention, password retention, accessible error feedback, OTP recovery, cooldown persistence, and verification error handling.
- Edge responsive route checks: **24 assertions passed** at 390×844, 768×1024, and 1440×900 for signup, OTP verification, login, and mocked business selection.
- Edge mocked dashboard checks: **21 assertions passed** for responsive overflow, customer ledger interaction and focus restoration, voice status, and disabled financial confirmation. **Zero financial writes** were observed.

These browser checks used a local production build and deterministic API/speech mocks where noted. They do not establish backend persistence.

## Accessibility and device coverage

- Keyboard focus visibility was checked on signup. Customer deletion confirmation places focus on Cancel, Escape dismisses it, and focus returns to its opener. This is an inline confirmation section, not a modal dialog.
- Signup/OTP errors use alert semantics. Voice status uses a polite live region. Accessible names and form labels were checked in browser.
- Actual screen-reader behavior was not tested.
- Edge exposed speech-recognition and media-device APIs, but microphone permission remained `prompt` and the enumerated audio input had no device identity. Physical microphone capture and real Hindi/Hinglish recognition were not tested; mocked speech events were used for UI behavior.

## Live staging evidence and blocker

The live staging flow previously verified registration (`202`), OTP delivery/resend (`202`), reload recovery, and invalid-code feedback (`400`). Submitting the delivered valid code returned `500` with a backend `PrismaClientKnownRequestError`; no account or business was created. The frontend team must not retry the live OTP flow until the backend team confirms a fix.

Therefore, new-user login after OTP, zero-membership onboarding against the new account, first-shop creation, OWNER membership persistence, and the new user's dashboard remain **not verified live**. Existing-user login, two-business switching, and logout were verified separately against staging in the preceding staging run.

## Remaining work

- Backend owner: resolve the valid OTP verification `500` and confirm the fix in isolated staging.
- Frontend: rerun the real signup → verification → login → first shop → explicit selection → dashboard journey after backend confirmation. No additional frontend work is currently identified from the tested flows.
- Release: do not treat the signup journey as production-ready until live verification and the backend's OTP delivery/security prerequisites are confirmed.
