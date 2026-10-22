# Current Unit: OS1
## OS1 Owner setup API (/setup/status, /setup/owner) + shared bootstrap audit
Status: ready-for-checks
What was built: Public `GET /api/v1/setup/status` and `POST /api/v1/setup/owner` in the identity module, open only while `OWNER_SETUP_TOKEN` is set and no live owner exists. Token compared by SHA-256 digest + timingSafeEqual before body parse or Argon2; in-process latch; closed submit answers the unknown-route 404. `bootstrapOwner()` takes optional `{ channel, ip }` and writes `owner.created` in its transaction (CLI passes `cli`, system actor). `owner.setup_rejected` written standalone. Optional env key with production 32-byte check, redacted in the boot summary; boot/post-setup warning while the token is still set.
Changed files:
- apps/cms-api/src/modules/identity/owner-setup.{controller,service,requests}.ts, setup-token.ts - new route, service (latch, mapping, audit), pure token compare
- apps/cms-api/src/modules/identity/{owner-bootstrap.ts,cli/owner-bootstrap.ts,identity.constants.ts,identity.module.ts} - audit options, shared schema export, constants, wiring
- apps/cms-api/src/modules/access/security-audit.constants.ts - OWNER_CREATED, OWNER_SETUP_REJECTED, channels, reasons
- apps/cms-api/src/common/constants/{api,error,limits}.constants.ts - SETUP routes, 2 error codes, SETUP_SUBMIT / SETUP_STATUS policies
- apps/cms-api/src/config/{env.schema,app-config}.ts (+ spec) - OWNER_SETUP_TOKEN
- apps/cms-api/src/modules/identity/{setup-token.spec,owner-setup.service.spec}.ts, apps/cms-api/test/integration/owner-setup.spec.ts - tests
- apps/cms-api/{.env.example,README.md}, docs/modules/success-criteria.md - docs
Behaviour to verify:
- GET /setup/status - no token configured: `{open:false}`; token + no owner: `{open:true}` (no credentials, no-store); owner exists: false; 31st call per minute per IP -> 429
- POST /setup/owner, no token configured or owner exists - 404 with the unknown-route body (message `Cannot POST /api/v1/setup/owner`), token or not
- POST wrong/missing/non-string/over-256 token - 401 SETUP_TOKEN_INVALID, `owner.setup_rejected` {reason: bad_token}, no Argon2, no account; wrong token + invalid body is still 401
- POST valid token, valid body - 201 `{email}`, no Set-Cookie, no token in body; account active role owner with argon2id hash; `owner.created` {channel: setup_page}, actor = new owner, targetId, ip; then login works
- Invalid body with right token - 400 field paths only; existing email - 409 OWNER_EMAIL_TAKEN, account not promoted; roles unseeded - 503
- 5 parallel submits + 1 CLI call - exactly one owner, the rest 404 / `owner.exists`; CLI after setup refuses; page after CLI 404; CLI row is system actor `{channel: cli}`
- 6th submit per IP in 15 min -> 429; forged leading X-Forwarded-For entries do not change the key
Security-relevant: new unauthenticated write route that creates the owner (identity module). Token check order, constant-time compare, closed = 404 (no oracle), latch, advisory lock + single-owner index, throttles (5/15 min submit, 30/min status), audit rows with no token/password/email, no session issued, env secret not in summary/logs. Status route is public by user decision (Q-OS2). No new dependencies.
Checks needed: qc-cli (`pnpm --filter @abyss/cms-api test:integration` owner-setup.spec.ts; curl status/submit against a running API with OWNER_SETUP_TOKEN set)
Risk: high (identity module; new unauthenticated route that creates the owner; Security gate: yes)
Verification: format pass · build/type-check pass (typecheck, build, lint) · unit tests pass (940) · integration pass (473, incl. 19 new) · docs apps/cms-api/README.md, apps/cms-api/.env.example, docs/modules/success-criteria.md
Proposed commit: |
  feat(apps/cms-api): add one-time owner setup route guarded by a setup token

  GET /setup/status and POST /setup/owner create the single owner while
  OWNER_SETUP_TOKEN is set and no owner exists (ADR 0005). The token is
  checked in constant time before the body is parsed or a password is
  hashed; closed answers the unknown-route 404. The route and the
  owner:bootstrap CLI share bootstrapOwner(), which now writes an
  owner.created audit row; rejected attempts write owner.setup_rejected.

  Affected:
  - apps/cms-api
  - docs
Deletions needing approval: none
Fix log:
- security answer: displayName max 100 -> OWNER_DISPLAY_NAME_MAX_LENGTH in the shared ownerInputSchema (setup route and CLI); unit + integration tests added; closed 404 body unchanged

## OS3 Smoke stack creates the owner through the setup route; deploy and local docs
Status: ready-for-checks
What was built: smoke.sh creates the owner with curl against `/setup/owner` (status open, wrong token 401, valid 201, no cookie/accessToken, status closed, second submit 404), then `owner:bootstrap` refuses. The test token is only in `scripts/stack/cms-api.env`; smoke.sh reads it from there. Docs: setup page is the primary owner path, CLI the fallback.
Changed files:
- scripts/stack/cms-api.env - test `OWNER_SETUP_TOKEN` (>= 32 bytes)
- scripts/smoke.sh - setup-route assertions replace "owner:bootstrap creates the owner"
- scripts/lib/stack-seed.sh - removed unused `OWNER_CREATED`
- docs/deployment/k3s-traefik.md - "First install: the owner" rewritten (token, setup page, remove token; CLI fallback)
- docs/deployment/k3s-secrets-sops.md - `OWNER_SETUP_TOKEN` in secrets table, notes, template, rotate table
- docs/local-run.md - both owner paths, optional key
Behaviour to verify:
- `SMOKE_E2E=1 pnpm smoke` - passes (ran: 106/106 e2e, 7 new setup lines print ok)
- token appears only in scripts/stack/cms-api.env and not in the smoke log (checked: 0 log hits)
- OS4 note: setup submit throttle is 5 per 15 min per IP; smoke uses 3 submits, so a spec adding a submit has 2 left
Security-relevant: none new in product code; adds a test setup token to the smoke stack env (public test value, smoke only); docs describe removing the token after setup.
Checks needed: qc-cli (SMOKE_E2E=1 pnpm smoke)
Risk: normal
Verification: format pass · build/type-check n/a · unit tests n/a (smoke 106 passed) · docs docs/deployment/k3s-traefik.md, docs/deployment/k3s-secrets-sops.md, docs/local-run.md
Proposed commit: |
  feat(scripts,docs): create the smoke owner through the setup route

  smoke.sh now creates the owner with POST /setup/owner using a test
  OWNER_SETUP_TOKEN from scripts/stack/cms-api.env, asserts the status,
  wrong-token, closed and second-submit cases, then checks that
  owner:bootstrap refuses. The k3s and local-run docs describe the setup
  page as the primary owner path and the CLI as the fallback.

  Affected:
  - scripts
  - docs
Deletions needing approval: none
Fix log:

## OS2 Admin owner setup page + login notice
Status: ready-for-checks
What was built: Public `/setup` page (OwnerSetupPage) that redirects to `/login` when `GET /setup/status` is closed, and creates the owner through `POST /setup/owner`; error mapping per status (401 token field, 400 field issues, 409 email, 404 to login with notice, 429/other alert). Login page shows an info notice + "Set up the owner account" link while the status is open, and accepts two new notices (owner created with email prefilled; setup already complete). New `setup.api.ts` (public, `skipAuthRefresh`), context provider, `useSetupStatus` hook (key `['setup','status']`).
Changed files:
- apps/cms-admin/src/features/auth/{OwnerSetupPage.tsx,setup.api.ts,setup-api-context.tsx,use-setup-status.ts,setup-error.ts} - new page, API, status hook, error mapping
- apps/cms-admin/src/features/auth/{LoginPage.tsx,login-notice.ts} - setup prompt, two notices, email prefill from router state
- apps/cms-admin/src/features/access/access-error.ts - exports `apiIssuesOf` (additive)
- apps/cms-admin/src/{app/App.tsx,app/AppProviders.tsx,app/app-services.ts} - route and provider wiring
- apps/cms-admin/src/config/{routes,endpoints,http.constants,auth.constants,copy.constants}.ts - SETUP route/endpoints, OWNER_EMAIL_TAKEN, limits, copy
- apps/cms-admin/src/features/auth/{OwnerSetupPage.test.tsx,setup-error.test.ts,LoginPage.test.tsx} - tests
- apps/cms-admin/README.md - `/setup` documented
Behaviour to verify:
- Fresh DB, token set: `/login` shows "This console has no owner yet." and the "Set up the owner account" link to `/setup`; the sign-in form still works
- `/setup` when an owner exists: redirects to `/login` (no notice, no setup prompt)
- Wrong token: error "This setup token is not valid." on the token field, other fields kept
- Short/invalid values: inline errors; repeat password mismatch blocks submit with no request
- Valid submit: lands on `/login` with "Owner account created. Sign in, then turn on two-factor in Security settings." and the email prefilled; the owner signs in; `/setup` then redirects to `/login`
- Setup closed while the form is open (owner created elsewhere): submit goes to `/login` with "Setup is already complete. Sign in."
- Token is not in the URL, localStorage, sessionStorage; token and passwords are password-type fields; network tab shows no `repeatPassword`; no console errors or CSP violations
- Status call failing on `/setup`: warning + "Try again"; on `/login`: nothing extra
Security-relevant: Unauthenticated page that sends the setup token and the owner password to `POST /setup/owner` (HTTPS via the API base URL). Token and passwords only in react-hook-form state, cleared on success; token never in URL, storage or Redux; requests use `skipAuthRefresh` and no Bearer. Server issue messages are shown as field text (React-escaped). No new dependencies.
Checks needed: qc-browser (setup open/closed on a fresh DB: login notice, wrong token, validation, success to login with prefilled email, owner login, /setup redirect, storage and URL clean, console clean)
Risk: high (apps/cms-admin/src/features/auth; owner creation and setup token handling)
Verification: format pass · build/type-check pass (typecheck, lint, build) · unit tests pass (310; 36 files) · docs apps/cms-admin/README.md
Proposed commit: |
  feat(apps/cms-admin): add owner setup page and login notice

  Public /setup page creates the single owner through POST /setup/owner
  while cms-api reports the setup open; it redirects to /login when
  closed. The login page links to it while open and shows a notice with
  the email prefilled after the owner is created. The setup token and
  passwords stay in form state only.

  Affected:
  - apps/cms-admin
Deletions needing approval: none
Fix log:

