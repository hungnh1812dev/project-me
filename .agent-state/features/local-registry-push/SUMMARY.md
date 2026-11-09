# Summary - local-registry-push

Base: f34d4a12f3d10ce8d5ed96f587a07a804a03d8cb · Head: 6389f91d

## Overview

`scripts/local-registry-push.sh` builds the cms-api, cms-admin and web images and pushes them to the local k3d registry, so the user's k3d cluster can pull them. Local test deploys only; production images stay on GHCR (see `docs/deployments/release.md`). Dev tooling only; no product behaviour change.

## Sub-features

- Build and push script with preflight checks: unknown app, missing `VITE_API_BASE_URL`, empty site key and unreachable registry each refuse before any docker call (LRP-1).
- Docs: `docs/deployments/local-registry.md`, linked from `kubernetes.md`, CHANGELOG Unreleased entry (LRP-2).

## Structure

- scripts/: `local-registry-push.sh`, `local-registry-push.test.sh` (stub docker, 29 checks)
- docs/deployments/: `local-registry.md`, `kubernetes.md` (link)
- CHANGELOG.md

## Commits

- c4fbb494 feat(scripts): add local k3d registry build and push script (LRP-1)
- 00e55a5d docs(scripts): document the local k3d registry push (LRP-2)
- 6389f91d chore(agent-state): record local-registry-push tier 3 checks

## Checkpoint LRP-A

All 18 rows pass (`checklists/LRP-A.md`). Tier 3 ran against the registry on host port 5001, which the user set up because port 5000 was taken on the Mac.

- LRP-A-10: script pushed all three images; registry lists the tag.
- LRP-A-11: user ran the pod pull check by hand (cluster write approved by the user). Pod pulled and was deleted.
- LRP-A-12: `SMOKE_E2E=1 pnpm smoke` passed (315 passed, 1 skipped).
- LRP-A-18 (security): the Turnstile test key echo in the web Dockerfile is informational, not a leak.

## Issues resolved

| Issue | Problem | Impact | Root cause | Fix applied |
|---|---|---|---|---|
| qc-1 | LRP-A-11 needed a write to the user's cluster and was blocked by the permission classifier. | Tier 3 pull check could not run. | Pod create is a cluster mutation with no allow rule. | User ran the three kubectl commands with the `!` prefix; row passes. |

## Open risks

None. The image tag is `00e55a5d-dirty`: the tree had uncommitted changes during the run. Images remain in the local registry.
