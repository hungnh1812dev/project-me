# Handoff - local-registry-push
Updated: 2026-11-09 after LRP-2

## In progress / next
User answer (2026-11-09): tier 3 may run (LRP-A-10..12; cluster preflight still asks before any write). qc-LRP-A-t3 stopped at preflight, no rows run. Blockers for the user: (1) registry port: the running k3d registry is on host port 5000, the script/doc default is 5001 (qc suggests LOCAL_REGISTRY=k3d-registry.localhost:5000 for this run and a doc note); (2) permissions not in the allowlist: script run, curl to k3d-registry.localhost, k3d registry list, kubectl pod create/describe/delete on k3d-local-k3s (cluster write, ask before each), inline export VITE_API_BASE_URL=http://localhost/api/v1 (value already approved in Q-LRP3); (3) SMOKE_E2E=1 pnpm smoke rebuilds the full stack (LRP-A-12, stack stopped after). Manager does not edit permissions; user decides. USER ANSWERS (2026-11-09): (1) recreate the k3d registry on host port 5001 (user does it; wait for the user's "ready" before dispatch); (2) allow the listed commands for this run (cluster writes still ask each time); (3) SMOKE_E2E=1 pnpm smoke may run. Preflight 2 (qc-LRP-A-t3r) stopped again: registry still on :5000 (5001 no answer); allow patterns not in .claude/settings.local.json (user must add them; manager does not edit); NEXT_PUBLIC_TURNSTILE_SITE_KEY not in shell env (needs a throwaway test value from the user). USER ANSWERS (2026-11-09, 2nd): registry: recreate on 5001 (user does it; wait for "ready"). Settings: user will add the allow rules to .claude/settings.local.json (asked how; manager explains, does not edit). Turnstile key: qc may use a throwaway test value (inline export, not a real secret). 
Next: qc, name qc-LRP-A-t3r, model sonnet, `CHECK LRP-A tier=3`, Notes: registry on host port 5001 (user said ready), allow rules saved in .claude/settings.local.json, NEXT_PUBLIC_TURNSTILE_SITE_KEY throwaway test value inline, VITE_API_BASE_URL inline http://localhost/api/v1, SMOKE_E2E=1 pnpm smoke may run (stop port-8080 stack after), cluster writes ask the user each time. Then sec-LRP-A-t3 (security-qc, sonnet, `CHECK LRP-A tier=3 base=f34d4a12f3d10ce8d5ed96f587a07a804a03d8cb`). Earlier plan text follows: qc tier 3 again (qc-LRP-A-t3r, sonnet, `CHECK LRP-A tier=3`), then sec-LRP-A-t3. Was: ask the user whether tier 3 may run: LRP-A-10 needs the k3d registry up, LRP-A-11 writes to the user's cluster (pod check). On yes: qc `CHECK LRP-A tier=3` (qc-LRP-A-t3, sonnet; stack per test-tiers), then sec-LRP-A-t3 (security-qc, sonnet, `CHECK LRP-A tier=3 base=f34d4a12f3d10ce8d5ed96f587a07a804a03d8cb`). On no: stop at tier 1 and ask the user how to close LRP-A.
- Tier 1 complete: qc pass (LRP-A-1..4, 7..9, 14, 15; LRP-A-7 repaired by qc, checked pass), sec pass (LRP-A-5, 6, 13, 16, 17). Rows LRP-A-10, 11, 12 todo. (security-qc, sonnet, `CHECK LRP-A tier=1 base=f34d4a12f3d10ce8d5ed96f587a07a804a03d8cb`); then tier 3 the same way (qc-LRP-A-t3, sec-LRP-A-t3, stack per test-tiers, user asked first for the cluster write in LRP-A-11). No red or waiting tests.
- LRP-A checklist drafted: checklists/LRP-A.md (qc rows LRP-A-1..4, 7..9, 10..12 at T3, 14, 15; security rows 5, 6, 13, 16, 17 at T1 static). Draft of qc and security done; no rows run yet.
- LRP-1 done (c4fbb494)
- LRP-2 done (00e55a5d); phase 1 tasks all done; next: checkpoint LRP-A

## User answers (2026-11-09)
- Q-LRP1 build now, reviewer-console waits: approved
- Q-LRP2 tag = short git hash, plus -dirty when the tree has changes; LOCAL_IMAGE_TAG overrides: approved
- Q-LRP3 VITE_API_BASE_URL: local hosts are localhost (use localhost in the doc example; value from the caller's env, never a file)
- Q-LRP4 root package.json alias: dropped (user, "keep it isolated"); usage is `bash scripts/local-registry-push.sh`

## Direct requests
(none)

## Follow-ups
(none)

## qc

- qc-1 · row LRP-A-11 · pod pull check needs a write to the user cluster, asked-before rule · status: closed · user ran the pod check; LRP-A-11 pass
