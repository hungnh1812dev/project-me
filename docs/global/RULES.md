---
summary: Rules every change must keep in every app; rules shared by several flows name those flows
replaces: §5 Naming rules, §5 Constants placement, §10 no literals and shared tooling, §13 Always / Ask first / Never
---

# Global rules

Part of the [project spec](../../SPEC.md). Rules for one app: `docs/apps/<app>/RULES.md`; rules for one flow: `docs/flows/<flow>/RULES.md`. A section that covers only some flows names them in an `Applies to:` line; no line means all flows. A decision id (`D..`) is listed in [DECISIONS.md](DECISIONS.md) with the file that holds it.

## Boundaries

- **Always:** write tests with each task · run Prettier, lint and typecheck before committing · use constants/config, not literals · route every record payload through the serializer · use parameterized SQL · keep `.env.example` in step with config.
- **Ask first:** adding any dependency not listed in §3 · DB schema changes outside the current task · changing a canonical value in §6 · changing a decision in §7 · CI/deploy changes · deleting files.
- **Never:** make the site public (public DNS record, public ingress or announced URL) before the launch gate (phase LG, above) has passed and the user has approved the launch in writing · read or edit `.env*` (except `.env.example`) · commit secrets · interpolate identifiers or slugs into SQL · build v2 backlog items · trust client-supplied permissions/`_maskedFields` · log OTPs, tokens or passwords in production · add AI attribution to commits.

## Naming

Naming rules (ADR 0008, user decisions 2026-10-25/26, revision 3 accepted 2026-10-26 with Q-FN12..Q-FN16): one format in every TypeScript package (cms-api, cms-admin, web, form-commons, e2e, base-config), for `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs` only; other file types (CSS, JSON, Markdown, shell scripts, images) keep their conventions (Q-FN13). The general rule is `code-standards` §4.5 "File and folder names" (agent layer, project-agnostic; each project has its own copy, naming nothing from this repo, Q-FN15): folders `kebab-case`; files `<use><PascalCase>.<feature>.<ext>`, `<use>` only when the main export is one React hook, `<feature>` one optional word only when needed, never by habit. Repo specifics:

- Framework folder syntax kept (Next.js `[param]`, `(group)`, `_private`); e.g. `content-engine/`, `bulk-action-bar/`.
- Files `<PascalName>.<feature>.<ext>` when a word is needed (`Health.controller.ts`, `TransactionRunner.port.ts`, `ApiTokenExpiry.rules.ts`), else `<PascalName>.<ext>`. `<PascalName>` never repeats its word (`Security.errors.ts`, not `SecurityError.errors.ts`); error files `<Feature>.errors.ts`, or `<Flow>.errors.ts` when a feature has several (`Login.errors.ts`). Hooks: `use<PascalName>.<ext>`, no hook word (`useSetupStatus.ts`, `useCurrentUser.ts`, `useHumanCheck.tsx`; Q-FN12); a word only if the general rule needs one (tool/config selects by it, or it separates same-named files in a folder), none today. Hook words `query`, `mutation`, `state` are retired; task FN-hook-rename drops them from the 16 hook files still carrying them.
- Word test (first match decides): one hook → `use<PascalName>.<ext>`; several TanStack hooks of one feature → `<Feature>.queries.ts`, no `use`; one React component (pages included) → no word, file = component name (`LoginPage.tsx`, `Button.tsx`); cms-api and apps/e2e files always carry a word (Nest roles, layer rules, Playwright / Jest globs select by it); otherwise only when a tool/config selects by it or it separates same-named files in a folder.
- Open word set (revision 3): the table below is the vocabulary in use, not an allow-list; one meaning, one word. If no row fits, the builder picks one plain lower-case word, never vague (`helper`, `util`, `utils`, `misc`, `common`, `types`, `component`), lists it in the unit record, and the planner adds the row. No guard or constants file lists the words.
- Tests: package suffix on the full name, `.spec.ts` in cms-api and e2e (e2e `tests/`), `.test.ts(x)` elsewhere and for the e2e `node:test` checks in `apps/e2e/src/` (`AccessPolicy.service.spec.ts`, `useSetupStatus.test.ts`, `LoginPage.test.tsx`); scenario splits add one lower-case variant before the suffix (`AccountMenu.login.test.tsx`).
- Kept as is: framework-fixed names (`index.ts`, `main.ts(x)`, `.d.ts`, Next.js `page.tsx` / `layout.tsx` / `not-found.tsx`, `proxy.ts`, `instrumentation.ts`), package-root tool configs (`vite.config.ts`, `eslint.config.mjs`, ...), generated code. Types-only and re-export-only files merge into their nearest neighbour (`code-standards` §4.4).
- Check: ESLint rule `abyss/file-names` (owner `@abyss/base-config/eslint`), on via `baseEslint({ fileNames })` for `src/`, `test/`, `tests/` of each package passing `fileNames` (all six after FN-lint-*; ADR 0008 revision 3). It checks `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs` (Q-FN13): shape (no word list), kebab-case folders, `use` prefix <-> one exported React hook, a word repeating its name, the required word (cms-api, e2e), test suffix per folder. Each package passes only its options (framework file names, route-segment folders, test suffixes, word required). Whether a word was needed is a review check, not lint. Until FN-lint-api / -ui / -e2e land, the per-package `FileNames.architecture.spec.ts` / `.test.ts` guards stay.
- A `.port.ts` sits in a cms-api module's `application/`, in `src/infrastructure/` (role `port`: `application/` may import it), or in a `src/common/` pipeline folder as a seam the app binds (its folder's role, e.g. `pipeline`: only `http/` may import it; `ThrottleSubject.port.ts`). One endpoint map per frontend in `src/config/` (`Api.endpoints.ts`), one for e2e in `apps/e2e/src/Api.endpoints.ts` (FN-e2e-2).

The word vocabulary and the project tree: [reference/project-structure.md](reference/project-structure.md).

## Constants and literals

Constants placement (Q-A1): a constant lives next to its one owning module or feature, in `<Module>.constants.ts` (cms-api) or `features/<feature>/<Feature>.constants.ts` (frontends; lower-case names until phase FN renames them); others read it through the owner's `index.ts`. cms-api `common/constants/` and frontend `config/` hold only values shared by several modules or the app shell (env, endpoints, routes, HTTP, auth, copy).

- No literals for routes, limits, headers, cookie names or URLs: they live in the owning module's `*.constants.ts`, in `common/constants/*.constants.ts` when shared, or in config (§5 constants placement; project `code-standards` skill).

## Shared tooling

- Prettier, ESLint and Oxlint from `@abyss/base-config` (`/prettier`, `/eslint`, `/oxlint`): the base holds the shared rules; each project extends it locally with its own plugins and rules (React, Next, Nest, Playwright). Built with `tsc` to `dist/` (ESM + `.d.ts`), exports point at `dist/`; turbo builds it before any consumer task (D3).

## Production config and security headers (D17)

1. With `NODE_ENV=production`, config fails fast on `MAIL_PROVIDER=console`, a missing secret, or a secret under 32 bytes; the boot config summary redacts secrets (D17, criterion 15).
2. Every app sends HSTS, CSP, `X-Content-Type-Options: nosniff` and `Referrer-Policy`, and no `X-Powered-By` (D17). Each app's CSP: `docs/apps/<app>/RULES.md`.

## Client IP and rate limits (D7)

Applies to flows: `sign-in`, `password`, `two-factor-setup`, `owner-setup`, `reviewer`, `backups`, `public-site` (every rate-limited route).

1. `TRUST_PROXY_HOPS` (default `1`), never `true`; `CF-Connecting-IP` through `CLIENT_IP_HEADER` when Cloudflare is in front (D7).
2. Rate limits key on the real IP **and** the account or email (D7, criterion 8).
3. The web BFF derives the visitor IP by the same rules and sends cms-api exactly one `X-Forwarded-For: <ip>`, so limits stay per visitor, never per web pod (D7).

## Browser tokens and CSRF (D14)

Applies to flows: `sign-in`, and every flow used from cms-admin (each sends the Bearer token).

1. The refresh cookie is accepted only on `/api/v1/auth/refresh` and `/logout`, and only with `Origin` in the allowlist (D14).
2. cms-admin keeps the access token in memory and sends it as a Bearer header; the web browser holds no token at all (D14, D21).
3. cms-admin stays on its own subdomain, so XSS in public content cannot run in the admin origin (D14).

## Richtext (D13)

Applies to flows: `content-editing`, `public-site`.

1. Sanitize richtext on the server when it is written (`sanitize-html` allowlist) and again on web when it is rendered (DOMPurify) (D13, criterion 14).
2. No global "XSS pipe" that rewrites all input (D13).

## Versions, change log, DevOps patches

1. Every release has a [CHANGELOG.md](../../CHANGELOG.md) entry with the repo version, the version of each app and package, and its features, changes, fixes and DevOps patches ([FLOW.md](FLOW.md) "Versions and change log").
2. An app's version changes only in a release that changes that app; `base-config` and `form-commons` change only when they are released themselves.
3. A change that needs the deploy repo to change updates `docs/deployments/` to the new target state and ships a `patch-<name>-<repo version>.md` in the doc folder of its app, flow or module. Never describe a DevOps change only in a patch, or only in `docs/deployments/`.
