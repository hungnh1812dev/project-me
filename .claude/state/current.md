# Current Unit: API-HEADERS
## API-HEADERS cms-api sends HSTS, nosniff, Referrer-Policy
Status: ready-for-checks
What was built: securityHeadersMiddleware now sets the full header set from one map (API_SECURITY_RESPONSE_HEADERS) next to the existing CSP; values mirror apps/web. No new config key, so no .env.example change.
Changed files:
- apps/cms-api/src/common/constants/Http.constants.ts - header map and HSTS max-age constant
- apps/cms-api/src/common/middleware/SecurityHeaders.middleware.ts - loops over the map
- apps/cms-api/src/common/middleware/SecurityHeaders.middleware.spec.ts - pins the exact header set
- apps/cms-api/README.md - security headers paragraph lists all four
Behaviour to verify:
- Any API response (200, error, POST /graphql) carries CSP "default-src 'none'; frame-ancestors 'none'", Strict-Transport-Security "max-age=63072000; includeSubDomains", X-Content-Type-Options "nosniff", Referrer-Policy "strict-origin-when-cross-origin"; no X-Powered-By; Traefik does not duplicate or alter them.
- test/integration/SecurityHeaders.integration.spec.ts still passes (checks CSP only; could add the new three).
Security-relevant: response headers only; no new endpoints, input, deps. HSTS is sent over plain HTTP in dev (browsers ignore it on http).
Checks needed: qc-cli tier 3 (headers through Traefik on the full stack; HTTP config changed)
Risk: normal
Verification: format pass · build/type-check pass · unit tests pass (1533) · lint pass · docs apps/cms-api/README.md (docs/modules/access-control.md names no headers, unchanged)
Proposed commit: |
  feat(apps/cms-api): send HSTS, nosniff and Referrer-Policy headers

  The API sent only the CSP. SPEC §7 requires HSTS, nosniff and
  Referrer-Policy on every app. Values match apps/web. A unit test pins
  the set.

  Affected:
  - apps/cms-api
Deletions needing approval: none
Fix log:
