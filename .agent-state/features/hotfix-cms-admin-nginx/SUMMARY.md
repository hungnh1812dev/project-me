# hotfix-cms-admin-nginx
Done: 2026-11-23 · Commits: 1d8f90ac..8545e429 · Apps / packages: cms-admin

## Overview
Fixes the failed v0.3.1 cms-admin image build by pinning the maintained `nginx/nginx-unprivileged:1.30.7-alpine` base image. Release 0.3.2 follows this hotfix.

## Sub-features
| Sub-feature | What it does | Tasks |
|---|---|---|
| nginx base image pin | cms-admin image builds on the maintained nginx-unprivileged 1.30.7-alpine base | HF-1 |

## Structure
```
CHANGELOG.md
apps/cms-admin/Dockerfile
docs/deployments/release.md
```

## Major issues
None
