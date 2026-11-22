# Handoff: hotfix-cms-admin-nginx

## Direct requests

### HF-1 Fix cms-admin image build, pin nginx-unprivileged 1.30.6-alpine

Goal: the v0.3.1 release image build failed because `nginxinc/nginx-unprivileged:1.30.7-alpine` does not exist on Docker Hub (404). Pin the existing `1.30.6-alpine`, but only if it carries the Nginx2root fix.

Decisions (user, 2026-11-22):
- SUPERSEDES the 1.30.6 decision (user, 2026-11-22): `nginxinc/nginx-unprivileged` is archived on Docker Hub. Use the maintained repo `nginx/nginx-unprivileged:1.30.7-alpine` (exists on Docker Hub; the repo was updated 2026-11-18). No accepted risk, no 1.30.6 note needed. Do not use `1.30-alpine` or any other tag without asking the user.
- The earlier 1.30.6 risk text in CHANGELOG.md (line 31) and docs/deployments/release.md (line 18), and the bug-fix entry that says "pinned to the existing 1.30.6-alpine" (CHANGELOG.md line 35), must be rewritten to the new image.
- HTTP/2: not enabled in apps/cms-admin/nginx.conf (plain HTTP on 8080 behind Traefik). Keep nginx.conf unchanged.
- Do not move, re-tag or re-push `v0.3.1`. The fix goes out as release 0.3.2 after this hotfix PR.
- Update `CHANGELOG.md` (`## Unreleased`) and `docs/deployments/release.md` to the chosen tag.

Acceptance:
1. Replaced by the user's decision above: do not confirm Nginx2root in 1.30.6; the risk is accepted. Write in current.md that the user accepted it.
2. `apps/cms-admin/Dockerfile` line 6: `ARG NGINX_IMAGE=nginxinc/nginx-unprivileged:1.30.6-alpine`.
3. `CHANGELOG.md` Unreleased entry (around line 31) names 1.30.6, not 1.30.7; it records the build fix for the failed v0.3.1 image build.
4. `docs/deployments/release.md` (around line 18) shows `nginxinc/nginx-unprivileged:1.30.6-alpine`; replace the stale "1.29 mainline" wording so the row matches.
5. Do NOT change any version in package.json files (the 0.3.2 bump is done by the release skill on develop).
6. `.claude/bin/module-index --check` prints nothing.
Verify: `docker manifest inspect nginxinc/nginx-unprivileged:1.30.6-alpine` succeeds (or `docker pull`); `docker build -f apps/cms-admin/Dockerfile --build-arg VITE_API_BASE_URL=https://example.test --build-arg VITE_TURNSTILE_SITE_KEY=test .` from the repo root; `grep -rn "1.30.7" apps docs CHANGELOG.md` returns nothing.
Files: apps/cms-admin/Dockerfile, CHANGELOG.md, docs/deployments/release.md.

## In progress / next

Next: `build-HF-1` (core-builder, model sonnet), task HF-1.
