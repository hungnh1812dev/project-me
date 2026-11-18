# Summary - stack-accounts

Base: 4326fb952010add2aff7e05449f2e9d6f0f35b29 · Head: 2071042f

## Overview

Dev and smoke stacks keep their account logins stable. The eight STACK_* keys are generated once, kept in `.localEnv.agent`, and reused on every stack start. The stored 2FA account is put back after the two-factor e2e spec, also when a step fails, so a kept stack's stored logins stay valid. Dev tooling only; no product behaviour or flow spec change (ADR 0020).

## Sub-features

- Stable stack accounts: `stack_load_accounts` reads and reuses the STACK_* keys; dev and smoke stacks share it (SA-1).
- 2FA account restore: TwoFactor.e2e restores the stored 2FA account in an after hook (SA-2).

## Structure

- scripts/: `lib/stack-seed.sh`, `smoke.sh`, `dev-stack.sh`, `stack/cms-api.env`
- apps/cms-api/: `.env.example`, `README.md`, config constants and spec, identity http constants, rate-limit architecture spec (test-stack override for the 2FA manage limit)
- apps/e2e/: `.env.example`, `README.md`, `tests/TwoFactor.e2e.spec.ts`
- docs/: `guidelines/local-run.md`, `deployments/configmaps.md`, `adr/0020` (ignored by git, local only)
- CHANGELOG.md

## Commits

- be4e9f64 chore(root): keep stack account logins in .localEnv.agent (SA-1)
- 793762dd test(e2e): restore the stored 2FA account after the two-factor spec (SA-2)
- 41578cc2 fix(root): redact the owner password in smoke bootstrap failures (SA-A fix)
- 2071042f fix(cms-api): add a test-stack override for the 2fa manage limit (SA-A fix)

## Issues resolved

| Issue | Problem | Impact | Root cause | Fix applied |
|---|---|---|---|---|
| SA-A-qc-1 | The TwoFactor e2e afterAll restore failed with "Too many attempts" in the full smoke suite, leaving the stored 2FA account on email codes and the changed password. | The stored 2FA account could not log in on a kept stack (ADR 0020 decision 6). | Setup, enable and disable share a 5 per 15 min IP limit with no test-stack override; the restore disable was the sixth call in the window. | Added test-stack-only override TWO_FACTOR_MANAGE_RATE_LIMIT_IP (raised on smoke and dev stacks), spec budget comment corrected; fixed in 2071042f. |

Security issue SA-A-security-1 (smoke owner password in bootstrap failure output) was fixed in 41578cc2; no resolved record kept.

## Open risks

None. Skipped at checkpoint SA-A by user decision: forced seed-failure check for CSA-A-13 (2026-11-07).
