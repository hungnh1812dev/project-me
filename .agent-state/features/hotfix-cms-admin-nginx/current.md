# Current Unit: build-HF-1
## HF-1 Pin nginx/nginx-unprivileged 1.30.7-alpine
Status: ready-for-checks
What was built: cms-admin image base moved to `nginx/nginx-unprivileged:1.30.7-alpine` (maintained repo; `nginxinc/nginx-unprivileged` is archived). Supersedes the earlier 1.30.6 pin; no accepted-risk wording remains.
Changed files:
- apps/cms-admin/Dockerfile - ARG NGINX_IMAGE now nginx/nginx-unprivileged:1.30.7-alpine
- CHANGELOG.md - Unreleased: change entry (line 31) and bug-fix entry (line 35) rewritten to the new image
- docs/deployments/release.md - nginx row rewritten to the new image; exception wording removed (table re-aligned by prettier)
Behaviour to verify:
- docker build of apps/cms-admin/Dockerfile - passes; runtime stage starts from nginx/nginx-unprivileged:1.30.7-alpine
Security-relevant: base image repo change (nginxinc -> nginx org, official maintained repo); no code change.
Checks needed: none (image tag pin, verified by docker build)
Risk: normal
Verification: format pass · build/type-check pass (docker build exit 0) · unit tests n/a · docs CHANGELOG.md, docs/deployments/release.md · module docs pass (module-index --check empty)
Proposed commit: |
  fix(cms-admin): use nginx/nginx-unprivileged 1.30.7-alpine

  nginxinc/nginx-unprivileged:1.30.7-alpine does not exist (the repo is
  archived) and broke the v0.3.1 image build. Pin the maintained
  nginx/nginx-unprivileged:1.30.7-alpine. Update CHANGELOG and release doc.
Deletions needing approval: none
Fix log:

## Verification (HF-1 Verify step)
- `docker build -f apps/cms-admin/Dockerfile --build-arg VITE_API_BASE_URL=https://example.test --build-arg VITE_TURNSTILE_SITE_KEY=test .`: exit 0.
- Runtime stage 1/5 is `FROM docker.io/nginx/nginx-unprivileged:1.30.7-alpine@sha256:0c53a1f2890c3526bfd201440f0fd3970e5b78f80630f58284aad0d34b5ec7bd`: confirmed.
- No version changed in package.json files; nginx.conf unchanged; nothing committed.
