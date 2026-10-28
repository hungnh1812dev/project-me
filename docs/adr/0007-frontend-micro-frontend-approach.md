# ADR 0007: Micro-frontend approach for cms-admin and web

- Status: proposed (2026-10-25). Options for the user to pick (Q-MF1, Q-MF2). No task is written until an option is chosen.
- Date: 2026-10-25
- Related: SPEC §2 "Frontend directions", §3 tech stack, §5 structure; ADR 0004 (web on Next.js App Router); ADR 0008 (file naming)

## Context

The user asked for a micro-frontend structure in cms-admin and web, with options to pick from.

What exists today:

- **cms-admin** (React 19 + Vite SPA behind nginx): already a modular monolith. Each feature folder (`auth`, `security`, `content-types`, `access`, `media`, `content`, `reviewer`, `status`) exposes `features/<name>/index.ts` and a `feature.ts` (`Feature`: routes, nav items, API services) registered in one line of `features/registry.ts`. ESLint and `src/architecture.test.ts` enforce the tier order `auth < security < content-types < access < media < content, reviewer`. Session lives in Redux memory plus the refresh cookie. CSP comes from `nginx/security-headers.inc.template`.
- **web** (Next.js 16 App Router, standalone Node): features `session`, `auth`, `reviewer`, `status` (cv later), nonce CSP per request in `proxy.ts`, token in browser memory only (D14).
- One team, one deploy unit per app, one replica (SPEC §2 out of scope: multi-replica).
- Runtime Module Federation has no supported path for the Next.js App Router: the `nextjs-mf` plugin is deprecated by the Module Federation core team, Pages Router only, with no new development. Vercel's supported composition for Next.js is Multi-Zones (separate Next apps per path prefix).

The question to settle first is what the user wants micro-frontends for (Q-MF2): independent deploys, enforced boundaries between features, or independent builds and tests. The options differ mainly on that.

## Options

### Option A: build-time micro-frontends (one workspace package per feature)

Each feature becomes a pnpm workspace package that exports its `Feature` contract. The app (shell) imports them in its registry. One build, one deploy per app.

- cms-admin: `packages/admin-sdk` (`@abyss/admin-sdk`: the `Feature` contract, `defineApiService`, API client types, routes and nav types, shared page helpers) plus `packages/admin-<feature>` per feature (`@abyss/admin-media`, `@abyss/admin-access`, ...). The tier order becomes package dependencies (a feature can only import what its `package.json` lists). Copy sections move into the feature package that owns them.
- web: `packages/web-<feature>` consumed through `transpilePackages`; Server Component rules and `server-only` imports keep working.
- Pros: boundaries enforced by package manifests, per-feature lint/test/turbo cache, no runtime cost, no CSP change, no new dependency, works the same for Vite and Next. The `Feature` contract is the seam if Option B is wanted later (only the shell loader changes).
- Cons: about 8 admin and 4 web packages with their own tsconfig, eslint, prettier and package.json; no independent deploy; one feature per migration task (larger total effort than D).
- Cost: M per feature, about 12 tasks plus 2 SDK tasks plus e2e regression.

### Option B: runtime Module Federation for cms-admin only

The admin shell loads remote feature bundles at runtime (`@module-federation/vite`, a new dependency). Web stays as it is (no supported App Router path).

- Remotes are served from the same origin under a path (for example `/remotes/<feature>/`) so CSP `script-src 'self'` holds; react, react-dom, react-router, TanStack Query and Redux are shared singletons with pinned versions.
- Pros: independent build and deploy per admin feature.
- Cons: new dependency and version-skew risk on shared singletons; one image or nginx location per remote; smoke stack, CI publish and k8s manifests grow; a broken remote breaks a page at runtime (needs error boundaries and a fallback); only admin gets it. Little gain for one team and one replica.
- Cost: L (shell loader, each remote, nginx/CSP, smoke, CI publish, deploy docs).

### Option C: route-level split (separate apps per path prefix)

- web: Next.js Multi-Zones; for example the CV site and the reviewer entry as separate Next apps joined by rewrites. Each zone has its own `proxy.ts` nonce CSP and container.
- cms-admin: separate SPAs per area (for example content, media, settings) under path prefixes behind Traefik; moving between areas is a full page load that costs a silent refresh (the refresh endpoint is rate limited at 30/min/IP).
- Pros: independent deploys, supported by Next.js.
- Cons: hard navigations between zones, duplicated shell and session bootstrap per app, more containers, auth and CSP repeated per app. Web has only a few pages today.
- Cost: L.

### Option D: keep the in-app feature modules (baseline)

Keep today's feature folders, registry and lint guards; only improve what the side-menu work (`docs/modules/admin-navigation.md`) needs. Mentioned so the choice is explicit.

- Pros: no cost. Cons: not micro-frontends; boundaries stay lint-enforced inside one package.

## Recommendation

Option A for both apps, if the goal (Q-MF2) is enforced boundaries and independent build and test per feature. It fits one team, one replica and the strict CSP, needs no new dependency, and keeps the door open: the `Feature` contract in `@abyss/admin-sdk` is what a Module Federation remote would expose, so moving admin to Option B later changes only the shell's loader.

If the goal is independent deploys, Option B for admin (web stays on A or D, because App Router has no supported federation).

## Module ownership, names, extension path (Option A)

- **Ownership:** `@abyss/admin-sdk` owns the shell contract (`Feature`, `FeatureRoute`, `FeatureNavItem`, `defineApiService`, nav section ids) and nothing feature-specific. Each `@abyss/admin-<feature>` owns its pages, API, queries, constants and copy. The app (`apps/cms-admin`) owns the store, providers, shell layout and the registry. Same split for web with `@abyss/web-<feature>`; `session` stays the lowest web feature.
- **Key names:** packages `@abyss/admin-sdk`, `@abyss/admin-<feature>`, `@abyss/web-<feature>`; each package's main export is `<feature>Feature` (for example `mediaFeature`), as today.
- **Extension path:** a new admin feature is one new package plus one line in `apps/cms-admin/src/features/registry.ts` (or its successor) and one dependency line in `apps/cms-admin/package.json`.

## Open questions

- **Q-MF1: which option.** Recommended: A for both apps. Trade-offs above.
- **Q-MF2: what is the main goal.** (a) enforced feature boundaries and per-feature build/test (points to A), (b) deploy one feature without redeploying the app (points to B for admin, C for web), (c) other. Recommended answer: (a), because there is one team and one replica.
- **Q-MF3 (only for A): order.** Recommended: admin first (it has 8 features and the registry already exists), web after the CV page returns, since web has 4 small features today.
