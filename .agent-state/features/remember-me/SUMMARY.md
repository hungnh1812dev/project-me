# Feature remember-me - summary

Base: 5f4f6bab · Head: 4326fb95 · Closed 2026-11-07

## Overview
- Phase 1 (cms-api and cms-admin sign-in): each cms-admin sign-in chooses a 30-day remembered session or a 12-hour browser session, enforced by cms-api; access token 15 min in both.
- Phase 2 (web sign-in): the public site's sign-in dialog offers the same choice through the web BFF.

## Sub-features
- REM-1: refresh tokens store remember_me; remembered 30 days, unremembered 12 hours, copied on rotation
- REM-2: login takes rememberMe, carried through 2FA; cookie Max-Age only when remembered; audit records the choice
- REM-3: cms-admin sign-in has an unticked "Keep me signed in" box sent as rememberMe; never stored
- REM-4: web login takes rememberMe, carried through 2FA and the sealed session; cookie Max-Age 30 days only when remembered; refresh keeps the choice
- REM-5: web sign-in dialog has an unticked "Keep me signed in" box sent as rememberMe; reset after a failed sign-in and on reopening
- REM-6: optional web auth rate-limit override for test stacks (BFF_AUTH_RATE_LIMIT_IP, ALLOW_BFF_RATE_LIMIT_OVERRIDE)
- REM-7: web auth limit raised on smoke and dev stacks; deploy docs say never set it
- DR1: CHANGELOG item under Unreleased for the 30-day remembered sign-in

## Structure
- apps/cms-api: 29 files
- apps/web: 24 files
- apps/e2e: 8 files
- apps/cms-admin: 7 files
- docs/modules: 4 files
- docs/global, docs/deployments, docs/apps: 2 files each
- docs/flows: 1 file; docs/adr: 1 file
- scripts: 2 files; docker-compose.smoke.yml; CHANGELOG.md

## Commits
- 8f08ecf REM-1
- ff44ec7 REM-2
- 9bb00031 REM-3
- 48ba0266 REM-A fix (integration specs, both modes)
- 9dce7edf REM-4
- cd417a98 REM-5
- dc9f0876 REM-6
- 363cb995 REM-7
- 105f0c4a REM-B fix round 1 (tier 2)
- 5e6b463f REM-B-fix (email-code send limit on test stacks)
- 6af2aef7 deploy docs: BFF rate-limit override keys never set in production
- 08565766 30-day docs and tests
- 834d4b46 cms-admin reset fix
- ca99f392 e2e timing
- e2c5b4e7 DR1 CHANGELOG
- 423afa37 QC e2e tests for remembered and unremembered modes
- 4326fb95 ADR 0018 implemented

## Issues
None (no resolved findings).
