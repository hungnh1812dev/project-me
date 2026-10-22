# CI/CD

GitHub Actions, built from the template in `.github_template/` (reference only). Workflows live in `.github/workflows/`, helper scripts in `.github/scripts/`.

## Flow

```
push to develop / staging / main
  -> changes (turbo query affected, .github/scripts/affected.sh)
  -> repo          format:check + dependency audit (always runs)
  -> cms-api       Checks -> Build   (when cms-api is affected)
  -> cms-admin     Checks -> Build   (when cms-admin is affected)
  -> web           Checks -> Build   (when web is affected)
  -> e2e           added by T37f
  -> publish       added by T37e (images, deploy bump)
```

The app flows never depend on each other, so one failing app does not skip another. Docker compose is local-test only (`docker-compose.smoke.yml`); no CI workflow or script runs or references it.

## Jobs

| Job                | What it runs                                                                                                                                                          |
| ------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `changes`          | Lists affected apps (`apps`, `<app>_affected`, `<app>_image`) and resolves the branch target. Routing is tested by `bash .github/scripts/affected.test.sh`.           |
| `repo`             | `pnpm format:check`, `pnpm audit --prod --audit-level high`                                                                                                           |
| `cms-api` Checks   | `turbo run typecheck lint`, `test:unit`, `test:integration` (Testcontainers on the runner's Docker), `content:generate -- --check`, `graphql:print-schema -- --check` |
| `cms-admin` Checks | `turbo run typecheck lint`, `pnpm --filter @abyss/cms-admin test`                                                                                                     |
| `web` Checks       | `turbo run typecheck lint`, `pnpm --filter @abyss/web test`                                                                                                           |
| `<app>` Build      | `pnpm turbo run build --filter=@abyss/<app>` (no Docker image here)                                                                                                   |

## Change detection

`turbo.json` `build.inputs` excludes docs and tests, so a docs or test only change runs checks and build but gets no new image (`<app>_image=false`). A change to `.github/workflows/<app>.yml` re-runs that app; `ci.yml`, `_publish.yml` and `.github/scripts/**` re-run all apps. A new branch or force push treats every app as affected.

Branches: `develop` runs checks and build only; `staging` and `main` are the publish targets (T37e). Nothing assumes they exist yet. `pull_request` is commented out in `ci.yml`.

## Run the checks locally

```
pnpm install --frozen-lockfile
pnpm turbo run typecheck lint test --filter=@abyss/<cms-api|cms-admin|web>
pnpm --filter @abyss/cms-api test:integration         # Docker must be running
pnpm --filter @abyss/cms-api content:generate -- --check
pnpm --filter @abyss/cms-api graphql:print-schema -- --check
pnpm turbo run build --filter=@abyss/<app>
pnpm format:check
pnpm audit --prod --audit-level high
bash .github/scripts/affected.test.sh
```

`content:generate --check` exits non-zero when the content type schemas changed without a committed migration; fix it by running `pnpm --filter @abyss/cms-api content:generate` and committing the result.
