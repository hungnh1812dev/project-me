# Run the checks locally

The checks CI runs ([ci-cd.md](../deployments/ci-cd.md)), on your machine. Needs Node >= 24, pnpm 11 and Docker (running) for the integration tests and the smoke stack. Running the apps themselves: [local-run.md](local-run.md).

## CI checks

```sh
pnpm install --frozen-lockfile
pnpm turbo run typecheck lint test --filter=@abyss/<cms-api|cms-admin|web>
pnpm --filter @abyss/cms-api test:integration         # Docker must be running
pnpm --filter @abyss/cms-api content:generate -- --check
pnpm --filter @abyss/cms-api graphql:print-schema -- --check
pnpm --filter @abyss/cms-api contract:print -- --check
pnpm turbo run build --filter=@abyss/<app>
pnpm format:check
pnpm audit --prod --audit-level high
bash .github/scripts/affected.test.sh
bash .github/scripts/pins-check.sh
bash .github/scripts/pins-check.test.sh
bash .github/scripts/build-args.test.sh
```

`content:generate --check` exits non-zero when the content type schemas changed without a committed migration: run `pnpm --filter @abyss/cms-api content:generate` and commit the result.

## e2e (local only)

GitHub CI never runs Playwright. Before pushing to `staging` or `main`, run the suite against the local smoke stack:

```sh
pnpm --filter @abyss/e2e browsers:install     # first time only
SMOKE_E2E=1 pnpm smoke                        # build the stack, run the checks and the suite, tear down
SMOKE_KEEP=1 SMOKE_E2E=1 pnpm smoke           # keep the stack running
pnpm e2e:spec <spec> [-g <name>]              # one spec against a kept stack
```

Details: [apps/e2e/README.md](../../apps/e2e/README.md).

## Image guards

The publish job's guards, against an image you built:

```sh
docker build -f apps/cms-admin/Dockerfile --build-arg VITE_API_BASE_URL=https://domain.com/api/v1 -t cms-admin:ci .
bash .github/scripts/image-user.sh cms-admin:ci
bash .github/scripts/bundle-check.sh cms-admin:ci https://domain.com/api/v1
```
