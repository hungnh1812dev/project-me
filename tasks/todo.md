# Todo: Monorepo Scaffold

- [x] T1: Root wiring
  - Acceptance: private root package.json (scripts build/dev/lint/test -> turbo, devDep turbo, packageManager pnpm@11.x, engines node>=24); pnpm-workspace.yaml (apps/*, packages/*); turbo.json (build, dev persistent+no cache, lint, test); .gitignore; .nvmrc = 24
  - Verify: `pnpm install` succeeds
  - Files: package.json, pnpm-workspace.yaml, turbo.json, .gitignore, .nvmrc

- [x] T2: Shared packages (empty)
  - Acceptance: @repo/typescript-config (base.json), @repo/eslint-config (base flat config), @repo/types and @repo/ui (package.json, tsconfig.json, src/index.ts = `export {}`); all private
  - Verify: `pnpm -r ls --depth -1` lists all 4
  - Files: packages/*/…

- [x] T3: apps/cms-api via `nest new`
  - Acceptance: latest Nest, name `cms-api`, no nested .git or lockfile
  - Verify: `ls -a apps/cms-api`, `jq .name,.dependencies apps/cms-api/package.json`
  - Files: apps/cms-api/** (generated)

- [x] T4: apps/cms-admin via `create-vite` (react-ts)
  - Acceptance: Vite 8 + React 19, name `cms-admin`
  - Verify: same as T3
  - Files: apps/cms-admin/** (generated)

- [x] T5: apps/frontend via `create-next-app`
  - Acceptance: Next 16.3.x, TS, Tailwind, ESLint, App Router, src/; name `frontend`; no nested .git or lockfile
  - Verify: same as T3
  - Files: apps/frontend/** (generated)

- [x] T6: Install and verify
  - Acceptance: SPEC.md Success Criteria 1–8 pass; `out/` removed afterwards
  - Verify: `pnpm install && pnpm build && pnpm lint && pnpm test`, a dev smoke test of each app, `pnpm turbo prune cms-api --docker`
  - Files: pnpm-lock.yaml (generated)
