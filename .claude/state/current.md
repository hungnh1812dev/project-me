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
