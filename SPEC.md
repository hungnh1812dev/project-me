# Spec: Abyss Headless CMS & Portfolio (v1)

Status: **Approved 2026-10-20**, amended 2026-10-21 (web on Next.js, GraphQL read API: §2, §3, §5, D17, D18, §9; D18 details pending Q-G1..Q-G7), amended 2026-10-22 (one-time owner setup route: §1, §2, D1, D15, D17, §9, §12-1, Q2; details pending Q-OS1..Q-OS4), amended 2026-10-23 (smoke seed CLI: D1, D15, D17, Q2), amended 2026-10-23 (R1-00 module directions from the audit: §2, §5, §10 constants line) · Date: 2026-10-20 · Supersedes: `CMS_Requirements_And_Architecture_Spec.html`, `CMS_Implementation_Planning.html`, `CMS_Project_Tasks.html` (kept for history; where they disagree with this file, this file wins).

Related: [tasks/plan.md](tasks/plan.md) · [tasks/todo.md](tasks/todo.md)

---

## 0. Assumptions (correct these before implementation starts)

1. One owner (the portfolio author), plus a few invited editors/admins. Not multi-tenant.
2. One VPS, K3s + Traefik, **one replica per app in v1**. In-memory caches are acceptable only where marked, and each one says what changes at more than one replica.
3. PostgreSQL 16, running in-cluster with a PVC. The separate deploy repo owns backups, and this repo documents what they must cover.
4. Public self-registration is **off**. Accounts are created by invitation.
5. v1 scope is cut down (see §2). GraphQL mutations/subscriptions (a read-only GraphQL query API is in v1, D18), Group 2 runtime DDL, reviewer write sandbox, S3 and Yup move to v2.
6. Domains: `domain.com` (web + API under `/api/v1`) and `admin.domain.com` (cms-admin).

---

## 1. Objective

Build a headless CMS that:
1. **Content hub:** the owner manages and publishes CV/portfolio content defined by JSON schemas (root + up to 3 nested component levels), served over REST, with a read-only GraphQL query API for document reads (D18).
2. **Technical showcase:** it shows ERP-grade concerns that actually hold up under attack: hybrid RBAC + field-level permissions with `***` masking, draft/publish with optimistic concurrency and diff/merge, an always-on security audit, and a safe "Login as Reviewer" experience.

Users and actors (threat model):

| Actor | How they get in | Can do (v1) |
|---|---|---|
| Anonymous | none | Read **published** content through the `public` role's field profile |
| Reviewer | Self-service session (Turnstile + rate limit), 24h, when Owner enables it | Read published content through the `reviewer` role's field profile, browse preset media. **No writes, no drafts.** |
| Editor (rank 30) | Invitation | Permissions granted to their role |
| Admin (rank 40) | Invitation | Manage accounts/roles/tokens **strictly below** rank 40, plus their role's content permissions |
| Owner (rank 100) | One-time setup page with the setup token while no owner exists, or the `owner:bootstrap` CLI (D1) | Everything |
| API token | Created by an Admin/Owner session | ≤ creator's **current** permissions, content endpoints only |

Success means every item in §12 has a passing automated test.

---

## 2. Scope

### Capability map

| Module id | Responsibility | Depends on |
|---|---|---|
| `platform` | Monorepo, tooling, config/env validation (`src/config`), HTTP pipeline and shared helpers (`src/common`), adapters behind ports (`src/infrastructure`: activity, database, mail, media storage, Turnstile), Prisma client (`src/generated`), Docker | — |
| `ui-kit` | `@abyss/form-commons`: shadcn base + form components, built to `dist/` | platform |
| `content-engine` | JSON schema → validated definition → SQL migrations for `content` schema, tree repository | platform |
| `health` | Liveness and readiness endpoints | platform |
| `access` core | Policy evaluation, actor context, system roles and default permissions, subject catalog, field projection/masking, record serializer, write allowlist, revocation versions, permission and API-token guards, rank rules | platform, content-engine |
| `security-audit` | Security audit log (D15): `SecurityAuditService`, `writeAuditLog`, audit actions and reasons, email HMAC | platform, access core (types only) |
| `identity` | Owner bootstrap (CLI + one-time setup route), smoke seed CLI, invitation acceptance, login, refresh rotation and session revocation, access-token issuing (incl. reviewer tokens), OTP, TOTP 2FA, password lifecycle, rate limits | platform, access core, security-audit |
| `access` management | Accounts, roles and API tokens: their admin endpoints, services, requests and constants (`access/management/`) | platform, access core, identity, security-audit |
| `access` document auth | `DocumentAuthGuard` for document reads (JWT, API token or anonymous), in its own small module (`access/document-auth.*`) | platform, access core, identity |
| `content-types` | Read-only content-type catalog, filtered by the caller's permissions (feeds the admin permission matrix) | platform, content-engine, access core, identity (auth guard only) |
| `media` | Upload pipeline, storage port use, file library, media references, safe delete | platform, content-engine, access core, identity (auth guard only), security-audit |
| `documents` | Document CRUD, OCC/409, draft/publish deep clone, presence, bulk (collections) | platform, content-engine, access core, access document auth, media |
| `graphql` | Read-only GraphQL over document reads (D18): schema generated from content definitions, same authz and serializer as REST | platform, content-engine, access core, access document auth, documents |
| `reviewer` | Reviewer toggle, session creation, field profile, owner log, cleanup | platform, access core, identity, security-audit |
| `admin-app` | cms-admin UI | ui-kit + the API modules it uses |
| `web-app` | Public CV site (Next.js), login, reviewer entry; reads content through `graphql` | ui-kit, graphql, identity, reviewer |

Dependency order (lowest first): `platform` → (`ui-kit`, `content-engine`, `health`) → `access` core → `security-audit` → `identity` → (`access` management, `access` document auth, `content-types`, `media`, `reviewer`) → `documents` → `graphql` → app slices. UI work goes into each vertical slice; it is not a separate phase.

### Module directions (cms-api)

Amended 2026-10-23 (R1-00, audit G6): the map above follows the code and the approved R1 fixes. It is the one authority for which module may import which.

- A file in module A may import from module B only when B is in A's "Depends on" cell. There are no cycles. `apps/cms-api/src/architecture/module-edges.constants.ts` (`ALLOWED_MODULE_EDGES`, R1-03) mirrors the cms-api rows of the table row for row; a change to one is a change to both.
- `platform` (`src/common`, `src/config`, `src/infrastructure`, `src/generated`) never imports `src/modules/**`. The composition root (`app.module.ts`, `app.setup.ts`, `bootstrap.ts`, `main.ts`) may import any module.
- `access` is one folder with three parts. Core is every file in `access/` except `access/management/**` and `access/document-auth.*`. Core never imports `identity`; only management and document auth do. `AccessModule` (core) imports `ContentEngineModule`.
- "types only" means `import type` (security-audit uses the `ActorContext` and `SystemSubject` types). "auth guard only" means the JWT guard and `AuthenticatedRequest` and nothing else.
- Other modules use a module through its `index.ts` (public interface), never its internal files (R1-11, R1-14).
- Edges the code still has but the table does not allow are listed in `KNOWN_VIOLATIONS` (R1-03) until the R1 task that removes them; R1-14 ends with that list empty. Today these are: `identity` -> `access` files outside core (security audit, management requests, role seeds) and `access` core -> `identity` (R1-04, R1-05, R1-06, R1-10), `media -> identity` beyond the auth guard (`ClientMeta`, `clientMetaOf`; R1-06), `common -> identity` (R1-08), `media -> documents` (R1-13), and `documents -> identity` / `graphql -> identity` (R1-12). `reviewer -> media` was in the map before and is dropped; the code has no such edge.
- Adding a module: add one row to this table and one entry to `ALLOWED_MODULE_EDGES` in the same change.

### Frontend directions

- **cms-admin layers** (higher may import lower, never the reverse): `main.tsx` → `app/` (composition root: store, providers, shell, routes) → `features/*` → `components/`, `lib/` → `config/`. `lib/` and `components/` import no feature and no `app/`; features import no `app/`. Only `app/` imports `features/auth/app-wiring.ts`.
- **cms-admin feature order** (a feature imports only features to its left, through their `index.ts`): `auth` < `security` < `content-types` < `access` < `media` < `content`, `reviewer`. `status` imports no other feature. `content-types` owns the `ContentType` / `ContentTypeField` model and `getContentTypes`, which `access`, `media`, `content` and `reviewer` read.
- **web layers**: `app/` (routes, providers, shell incl. `AccountMenu`) → `features/*` → `features/session` → `lib/` → `config/`. `auth` and `reviewer` never import each other; both use `session` and `lib/`. `status` (and `cv`, when it is built) import no feature other than `session`. Cross-feature imports go through `index.ts`.

### In scope (v1)
Everything in the map above. Collections get bulk create/publish/unpublish/delete.

### Out of scope (v2 backlog — do not build in v1)
GraphQL mutations, subscriptions and non-document reads · Group 2 owner-private runtime DDL · reviewer write sandbox · S3 adapter · Yup support · SSO across unrelated domains · multi-replica deployment.

---

## 3. Tech Stack

| Area | Choice |
|---|---|
| Package manager / build | pnpm workspaces + Turborepo |
| API | NestJS 11 on **Express**, TypeScript strict |
| Core persistence | Prisma (PG schema `public`, system tables only) via `@prisma/adapter-pg` |
| Content persistence | Generated SQL migrations in PG schema `content`; queries through **Kysely** with parameters only (decision D10; confirm, since it's a new dependency) |
| Auth | Passport-JWT, `argon2` (Argon2id), `otplib` (TOTP) |
| GraphQL (cms-api) | `graphql` (graphql-js) with an in-house handler inside the Nest pipeline, no Apollo/Yoga (D18; dependency pending Q-G1) |
| Admin (cms-admin) | React 19 + Vite SPA served by nginx, Redux Toolkit (session/UI), TanStack Query (server data), Axios, REST only |
| Web (apps/web) | **Next.js 16 App Router** (pinned ≥ 16.2.5), `output: 'standalone'` run by Node (no nginx); Server Components by default; server data fetched **through GraphQL** (anonymous, from `API_INTERNAL_URL`, data cache `WEB_REVALIDATE_SECONDS`: 60 s production, 0 smoke); browser state with React context + TanStack Query + Axios, **no Redux**; DOMPurify on server and client (D13); Tailwind v4 via `@tailwindcss/postcss` |
| UI kit | shadcn/ui + Tailwind, react-hook-form + Zod, Tiptap, CodeMirror 6 |
| Media | Cloudinary, `sharp` for re-encoding, `file-type` for magic bytes |
| Bot protection | Cloudflare Turnstile (server-side verification) |
| Tests | Jest + Supertest + Testcontainers (Postgres 16) for API · Vitest + Testing Library for UI · Playwright for e2e |

---

## 4. Commands

```bash
pnpm install
pnpm turbo run build                     # builds @abyss/form-commons dist/ first, then apps
pnpm turbo run lint typecheck
pnpm turbo run test                      # unit + integration (Testcontainers needs Docker)
pnpm --filter @abyss/cms-api test:e2e
pnpm --filter @abyss/cms-api db:migrate          # Prisma core migrations (public schema)
pnpm --filter @abyss/cms-api content:generate    # schemas/*.json -> content migrations (+ dry-run diff)
pnpm --filter @abyss/cms-api content:migrate     # apply content migrations
pnpm --filter @abyss/cms-api owner:bootstrap     # one-time; fails if an owner exists
pnpm --filter @abyss/cms-admin dev
pnpm --filter @abyss/web dev
pnpm format                              # Prettier (required before every commit)
pnpm --filter @abyss/e2e test            # Playwright
```

---

## 5. Project Structure

```
abyss/
├── abyss.code-workspace          # multi-root: one folder per app/package
├── pnpm-workspace.yaml · turbo.json · tsconfig.base.json (compilerOptions only)
├── packages/
│   ├── base-config/              # @abyss/base-config: exports prettier, eslint, oxlint
│   └── form-commons/             # @abyss/form-commons, exports ./dist only
│       └── src/{components/ui, components/forms, constants}
├── apps/
│   ├── cms-api/                  # @abyss/cms-api
│   │   ├── prisma/               # core schema + migrations (public)
│   │   ├── content/              # schemas/*.json + generated migrations/ + schema.graphql (printed SDL, D18)
│   │   ├── src/
│   │   │   ├── main.ts · bootstrap.ts · app.module.ts · app.setup.ts   # composition root
│   │   │   ├── architecture/     # import-graph helper + architecture specs, module-edges.constants.ts (R1-01, R1-03)
│   │   │   ├── config/           # env.schema.ts (Zod), app-config.ts (frozen IAppConfig), config.constants.ts, config.module.ts
│   │   │   ├── common/           # constants/, filters/, guards/, middleware/, rate-limit/, sanitize/, client-ip.resolver.ts, clock.ts, uuidv7.ts
│   │   │   ├── generated/        # Prisma client (generated; never edited)
│   │   │   ├── infrastructure/   # adapters behind *.port.ts: activity/, database/, mail/, media/, turnstile/
│   │   │   └── modules/          # one folder per §2 module, each with an index.ts facade: identity/, access/ (core + management/, R1-10),
│   │   │                         # security-audit/ (R1-04), content-engine/, content-types/, documents/, graphql/, media/, reviewer/, health/
│   │   └── test/                 # integration/, fixtures/
│   ├── cms-admin/                # @abyss/cms-admin, React 19 + Vite SPA
│   │   └── src/
│   │       ├── main.tsx          # entry
│   │       ├── app/              # composition root: store.ts, query-client.ts, app-services.ts, AppProviders.tsx, App.tsx (routes), AppShell.tsx
│   │       ├── features/         # auth/, security/, content-types/, access/, media/, content/, reviewer/, status/: pages, *.api.ts, auth.slice.ts, *-queries.ts, <feature>.constants.ts
│   │       ├── components/       # app UI shared by features, no feature knowledge (Modal.tsx)
│   │       ├── lib/              # api-client.ts and other feature-free helpers
│   │       ├── config/           # env.ts, endpoints.ts, routes.ts, http.constants.ts, auth.constants.ts, copy.constants.ts
│   │       └── styles/           # app.css
│   ├── web/                      # @abyss/web, Next.js 16 App Router, standalone Node server
│   │   ├── next.config.ts · postcss.config.mjs · vitest.config.ts · Dockerfile · public/
│   │   └── src/
│   │       ├── proxy.ts          # per-request nonce + CSP header (D17)
│   │       ├── instrumentation.ts · instrumentation-node.ts
│   │       ├── app/              # routes and shell: layout.tsx, page.tsx, not-found.tsx, providers.tsx, query-client.ts, CspNonce.tsx, AccountMenu.tsx (R3-13)
│   │       ├── config/           # env.server.ts (server-only), env.client.ts (NEXT_PUBLIC_* only), require-env.ts, endpoints.ts, shared *.constants.ts
│   │       ├── lib/              # api-client.ts (browser Axios), content-security-policy.ts, api-failure.ts (R3-14); graphql/ and render-richtext.ts come with the CV page (T30)
│   │       └── features/         # session/ (who is signed in + in-memory token, R3-13), auth/ (sign-in UI), reviewer/, status/, cv/ (T30):
│   │                             # *.api.ts, *.query.ts (GraphQL documents), *.server.ts, client components
│   └── e2e/                      # @abyss/e2e Playwright
└── docs/{adr, modules, deployment}
```

Items marked with a task ID (R1-xx, R3-xx, T30) are approved but not built yet; that task creates them.

Naming rules: files are `kebab-case.ts`. React component files keep `PascalCase.tsx`; Next.js route files keep their framework names (`page.tsx`, `layout.tsx`). There is one endpoint map per frontend at `src/config/endpoints.ts`. A dotted suffix names the file's role:

| Suffix | Where | Holds |
|---|---|---|
| `.constants.ts` | all | named constants (placement below) |
| `.module.ts`, `.controller.ts`, `.service.ts`, `.guard.ts` | cms-api | Nest roles |
| `.requests.ts` | cms-api | the Zod request schemas and parsers of one controller |
| `.port.ts` | cms-api `infrastructure/` | the interface and injection token an adapter implements |
| `.routes.ts` | cms-api | one module's route group (R2-10); `common` keeps only the API prefix and shared params |
| `.architecture.spec.ts` | cms-api | structure guards (import graph, metadata) |
| `.api.ts` | cms-admin, web | one feature's HTTP calls |
| `.slice.ts` | cms-admin | a Redux Toolkit slice (only `auth.slice.ts` today) |
| `.query.ts`, `.server.ts` | web | a GraphQL document; server-only code |
| `.spec.ts` / `.test.ts(x)` | cms-api / frontends | tests |

Constants placement (Q-A1): a constant lives next to the one module or feature that owns it, in `<module>.constants.ts` (cms-api) or `features/<feature>/<feature>.constants.ts` (frontends). Other modules or features read it through the owner's `index.ts`. cms-api `common/constants/` and frontend `config/` hold only values shared by several modules or by the app shell (env, endpoints, routes, HTTP, auth, copy).

Web rules: Server Components by default; `'use client'` only for state, effects, handlers, browser APIs, TanStack Query, react-hook-form or any `@abyss/form-commons` import. Files that read server env or call `API_INTERNAL_URL` import `server-only`. The Next server never sends, receives or stores a user token (no Server Actions, Route Handlers or `cookies()` for auth, D14); authenticated calls go from the browser with the in-memory Bearer token. There is no `store/` on web.

---

## 6. Canonical Values (resolves every contradiction in the old docs)

| Item | Value |
|---|---|
| API base path / port | `/api/v1` · container port `3000` |
| Health | `GET /api/v1/health/live`, `GET /api/v1/health/ready` → `{ "status": "ok" }` only (no internals) |
| Trailing slash | Express `strict routing` off; clients strip trailing `/`; Traefik never uses StripPrefix |
| Role slugs / ranks | `public` 0 · `guest` 10 · `reviewer` 20 · `editor` 30 · `admin` 40 · `owner` 100 (lowercase everywhere) |
| Custom role rank range | 11–39 |
| Permission actions | `read` `create` `update` `delete` `publish` `unpublish` |
| Mask sentinel / key | `"***"` for string/text/richtext · `null` for other types and components · `_maskedFields: string[]` |
| Access / refresh TTL | 15 min / 7 days (rotated on every refresh) |
| OTP | 6 digits, TTL 300 s, 5 attempts per code, max 5 issued per account per hour, single-use |
| 2FA temp token | TTL 300 s, 5 attempts |
| Presence | heartbeat every 20 s, entry TTL 45 s |
| Component depth | max 3 |
| Bulk | max 50 records per request, max 200 component rows per record, body limit 1 MB |
| Upload limits | image 10 MB · pdf 20 MB · video 100 MB |
| Reviewer session | 24 h, 1 session per IP per 10 min, global cap 200 active |
| Identifier rule | `^[a-z][a-z0-9_]*$`, max **63 bytes after composition** |
| Core tables | `accounts`, `roles`, `permissions`, `refresh_tokens`, `otp_codes`, `api_tokens`, `reviewer_sessions`, `file_library`, `audit_logs`, `app_settings` (content registry lives in `content._content_types` + `content._migrations`, owned by the content engine, not Prisma — decided at T06) |
| Refresh cookie | `__Secure-abyss_rt`, host-only `domain.com`, `Path=/api/v1/auth`, `HttpOnly; Secure; SameSite=Strict` |
| Origins | web + API: `https://domain.com` · admin: `https://admin.domain.com` (the only CORS origin, credentials on) |

---

## 7. Security Decisions (fixes for review findings C1–C8 and related)

**D1 Owner bootstrap (C1).** No "first verified user becomes owner". The owner is created exactly once, by one of two paths that share one function (`bootstrapOwner`): it runs in a transaction with `pg_advisory_xact_lock`, refuses if an owner exists or the email is taken, and never promotes an existing account. A partial unique index `ON accounts ((1)) WHERE role_slug = 'owner' AND deleted_at IS NULL` enforces a single owner. Self-registration endpoints don't exist in v1. Amended 2026-10-22 (user decision, ADR 0005, design `docs/modules/owner-setup.md`):
- **Setup route (primary on k3s):** `POST /setup/owner` with `{ setupToken, email, displayName?, password }`, open only while `OWNER_SETUP_TOKEN` is configured **and** no live owner exists; otherwise `404`. The token is checked first (SHA-256 digests compared with `timingSafeEqual`), before body validation or password hashing; wrong token → `401 SETUP_TOKEN_INVALID`. Success → `201 { email }`, no session (the owner signs in through `/auth/login`). Throttled per IP. The admin console shows the setup page only while `GET /setup/status` says `open`, and never takes the token from the URL.
- **CLI (fallback):** `owner:bootstrap` takes `OWNER_EMAIL` and an interactive password (or `--password-stdin`); it works with or without a setup token.
- **Closing:** the route closes itself once an owner exists. The operator removes `OWNER_SETUP_TOKEN` from the Secret after setup; cms-api logs a warning (no value) while the token is set and an owner exists.
- **Smoke seed CLI (test stacks only; amended 2026-10-23, user decision, audit AUD-AU5-03):** `seed:account` is an identity CLI, not an HTTP route. It creates active test accounts for the smoke / e2e stack. Roles are an explicit allowlist (`admin`, `guest`); `owner`, `reviewer` and custom roles are always refused. It refuses a taken email and never updates or promotes an existing account. The password comes from stdin only. With `NODE_ENV=production` it refuses unless `ALLOW_ACCOUNT_SEED=smoke` is passed on that one invocation (never in deployed config, see D17). Each account it creates writes `account.seeded` (D15).

**D2 Reviewer isolation (C2, C3).** Reviewers are **read-only**. They see only published content, filtered through the `reviewer` role's field profile, which the Owner edits like any role and which starts with every sensitive field masked. Reviewers never see drafts. No reviewer data lands in content tables, so there is no `reviewerSessionId` column. Reviewer write sandboxes are v2 and must use a separate PG schema.

**D3 Field-level reads (C4).** Field permissions are applied **when the query is built**:
- No `read` permission on a subject → `403` (not a masked row).
- Unreadable columns are never selected; the serializer emits the sentinel and `_maskedFields`.
- Filter, sort or search on an unreadable field → `400 FIELD_NOT_READABLE`.
- Every payload that carries record data goes through the same serializer: list, detail, 409 conflict, bulk conflicts, audit metadata view and error details.

**D4 Write allowlist (C5).** The server computes writable fields from policy on each request. A masked field that comes back carrying the sentinel is dropped silently. Any other non-writable or unknown key → `400`. Client-sent `_maskedFields` is ignored.

**D5 API tokens (C6).** Effective permissions = token scope ∩ creator's **current** permissions, evaluated per request. The token stops working if its creator is deactivated or deleted. Tokens are created, updated and revoked only from a JWT session (never with another token), and the subset check runs on create **and** update. Admins manage only tokens they created; the Owner manages all. Tokens are `ak_live_` + 32 random bytes in base64url, stored as SHA-256, and the raw value is shown once.

**D6 Role hierarchy (C7).** An actor may manage an account, assign a role, or edit a role's permissions only when the target rank < the actor's rank. No "created by me" exception. System roles' slug and rank are immutable. Only one account can hold `owner`.

**D7 Client IP (C8).** `TRUST_PROXY_HOPS` (default `1`) is used instead of `true`. The deploy docs require `externalTrafficPolicy: Local` on the Traefik service, and `CF-Connecting-IP` when Cloudflare sits in front (`CLIENT_IP_HEADER`). Rate limits are keyed by real IP **and** by account/email.

**D8 Credentials and OTP.**
- Passwords use Argon2id, minimum 12 characters.
- OTPs are stored as HMAC-SHA256 with `OTP_PEPPER` and bound to `(account, purpose)`. Purposes: `INVITE_SET_PASSWORD`, `RESET_PASSWORD`, `LOGIN_2FA_EMAIL`.
- Responses for unknown emails look the same as for known ones (no enumeration).
- Password reset also requires a TOTP code when TOTP is enabled.
- Turning on 2FA requires the current password plus a valid first code.
- TOTP remembers the last used time step (no replay). The TOTP secret is encrypted with AES-256-GCM using `TOTP_ENC_KEY` and a key id for rotation.

**D9 Sessions and revocation.**
- The JWT is HS256 with the algorithm pinned. Claims: `sub`, `tv` (`accounts.token_version`), `pv` (`roles.policy_version`), `kid`.
- The guard compares claims against the DB values through an in-process cache that is invalidated on every write in the same process. With one replica that's immediate; at more than one replica it's bounded by a 5 s cache TTL.
- Refresh tokens rotate with `family_id`. Reusing a rotated token revokes the whole family and bumps `token_version`.
- A password change or reset bumps `token_version`.

**D10 Content engine.** One engine for all content types:
- JSON schema → validated definition → generated SQL migration in PG schema `content`, applied by a migration command/Job. Never at request time.
- Prisma owns only `public`, so Prisma migrate never sees content tables and never proposes a drift reset.
- Adding a schema means generate → review the migration → deploy. Nothing happens "automatically on file drop".
- Destructive changes (drop or rename a field) need an explicit `--allow-destructive` flag and a written data-migration note.

**D11 Draft/publish integrity.** Partial unique indexes allow at most one draft and one published row per `document_id`. Publish takes `expectedVersion` of the draft. Components carry a stable `component_uid` (UUID) so diff/merge can match them.

**D12 Media.**
- File type is detected from magic bytes against an allowlist (`jpeg png webp gif avif pdf mp4`). SVG and HTML are always rejected.
- Images are re-encoded with sharp, which also strips EXIF/GPS.
- Storage keys are UUIDv7, and a full SHA-256 is stored for dedupe.
- Delete is a soft delete. It's blocked (`409 MEDIA_IN_USE`) while any document references the file, and a job purges cloud objects afterwards.

**D13 Richtext/XSS.** Richtext is sanitized on the server when written (allowlist via `sanitize-html`), and the web sanitizes again when rendering (DOMPurify). There is no global "XSS pipe" that rewrites all input.

**D14 Topology and CSRF.** The API accepts the refresh cookie only on `/api/v1/auth/refresh` and `/logout`. Those endpoints also require `Origin` ∈ the allowlist. The access token lives in memory and travels as a Bearer header. Admin runs on its own subdomain so that XSS in public content can't run in the admin origin.

**D15 Audit.**
- `SecurityAuditService` is always on and writes in the same transaction for login success and failure, 2FA changes, password changes, role, permission and account changes, token create and revoke, reviewer toggle, media delete, owner creation (`owner.created`, channel `setup_page` or `cli`), rejected owner-setup attempts (`owner.setup_rejected`, no token, password or email stored) and test accounts created by the smoke seed CLI (`account.seeded`, channel `cli_seed`, metadata = role slug and channel only; D1).
- Activity tracking (content edits) stays pluggable (`none | database`).
- Audit metadata never stores field values, only field names.

**D16 Presence.** Requires `update` permission on the document. Returns `{ accountId, displayName, state, lastSeenAt }` only. In-memory store (single replica, documented).

**D17 Production guards (config fail-fast).**
- With `NODE_ENV=production`, Zod rejects `MAIL_PROVIDER=console`, any missing secret, and secrets shorter than 32 bytes.
- The boot config summary redacts secrets.
- `OWNER_SETUP_TOKEN` is optional; when set with `NODE_ENV=production` it must be at least 32 bytes (D1).
- `ALLOW_ACCOUNT_SEED` is not an app setting. The server schema does not accept it, and it never appears in `.env.example`, the smoke env file, compose or k3s manifests. Only the `seed:account` CLI reads it, passed on one invocation, and it must equal exactly `smoke` (D1).
- Headers on every app: HSTS, CSP, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, no `X-Powered-By`.
  - **API**: `default-src 'none'` on every route, `/graphql` included.
  - **cms-admin**: CSP from its nginx config (unchanged): `script-src 'self'`, `connect-src` from env, `img-src` includes Cloudinary.
  - **web (Next.js)**: CSP from `src/proxy.ts` with a fresh per-request nonce: `script-src 'self' 'nonce-<n>' 'strict-dynamic'` (+ the Turnstile origin, named constant), `connect-src` from env, `img-src` includes Cloudinary, `frame-ancestors 'none'`, `style-src` per Q-W4 (open: recommended `'self' 'nonce-<n>'` + `style-src-attr 'unsafe-inline'`). HSTS, nosniff, Referrer-Policy and `poweredByHeader: false` come from `next.config.ts`. Pages that carry the nonce render per request; the data cache still bounds calls to cms-api. `/_next/static` is outside the proxy matcher. Approved by the user 2026-10-21 (Q-W4).

**D18 GraphQL read API.** Details and the schema contract: `docs/modules/graphql.md`, ADR 0003. Status: GraphQL in v1 decided by the user; the points below are planner recommendations pending Q-G1..Q-G7.
- `POST /api/v1/graphql`, queries only, document reads only (no mutations, subscriptions, batching, GET or persisted queries). cms-admin stays on REST.
- The schema is generated by a pure function from the content definitions (object type per content type and component, offset paging `page`/`pageSize` + `meta { page, pageSize, total }`, typed filter inputs with the REST operator sets and limits, sort ≤ 3 keys). It fails on any name clash; the printed SDL is committed (`content/schema.graphql`) and checked.
- **Authz is the REST read path, not a copy:** `DocumentAuthGuard` (anonymous, JWT, API token per D5; reviewer from T32), then root resolvers call `DocumentsQueryService` unchanged (read + draft rule, row conditions, projection, `QueryGuard` → `FIELD_NOT_READABLE`, `RecordSerializer`, media embed). Nested fields only read the serialized record; no other data path (architecture test). A content type the actor cannot read fails validation exactly like an unknown field (hidden = unknown).
- **Limits** (named constants): body 32 KiB, 2 000 parser tokens, depth 8, 5 root fields per operation (aliases count), 500 field nodes; the anonymous document read throttle counts each request once. No weighted cost (DB work per root field is fixed).
- **Production:** introspection off, "Did you mean" suggestions stripped, no playground (any environment). Responses `Cache-Control: no-store`.
- **Errors:** `{ data?, errors: [{ message, path?, locations?, extensions: { code, details?, requestId } }] }`; `code` reuses REST error codes plus `GRAPHQL_PARSE_FAILED`, `GRAPHQL_VALIDATION_FAILED`, `GRAPHQL_LIMIT_EXCEEDED`; HTTP 400 for parse/validation/limit errors, 200 once executed; failures before GraphQL (401, 413, 415, 429) keep the REST error shape. Never echo submitted values or log variables.

---

## 8. Data Model

### 8.1 Core (`public`, Prisma)
Every table has `id` (int identity PK), `created_at` and `updated_at`. User-facing tables also have `document_id` (UUIDv7, unique). `created_by`/`updated_by` reference `accounts(id)` **ON DELETE SET NULL**.

| Table | Key columns |
|---|---|
| `accounts` | email UK (citext), password_hash, display_name, role_id FK, role_slug (composite FK (role_id, role_slug) → roles(id, slug), ADR 0002), status (`invited\|active\|disabled`), token_version int, is_2fa_enabled, two_fa_method (`totp\|email`), totp_secret_enc, totp_last_step, deleted_at |
| `roles` | slug UK, name, rank, is_system, policy_version int |
| `permissions` | role_id FK, subject (content type slug or system subject), action, readable_fields jsonb (null = all), writable_fields jsonb (null = all), conditions jsonb (DSL §8.3) |
| `refresh_tokens` | account_id FK, family_id uuid, token_hash UK, replaced_by_id, user_agent, ip, expires_at, revoked_at |
| `otp_codes` | account_id FK, purpose, code_hmac, attempts, expires_at, used_at |
| `api_tokens` | name, token_prefix, token_hash UK, created_by_id FK (not null, ON DELETE CASCADE), scope jsonb, expires_at, revoked_at, last_used_at |
| `reviewer_sessions` | account_id FK (ephemeral `reviewer` account), visitor_role, purpose_tags jsonb, notes (≤ 500 chars, plain text), ip_hmac, user_agent, expires_at, last_active_at |
| `file_library` | file_name, mime_type, size, width, height, alt, storage_key UK, sha256, url, thumbnail_url, provider (`cloudinary\|preset`), is_reviewer_preset, deleted_at |
| `content._content_types` (content engine, not Prisma) | slug UK, kind (`single\|collection`), draft_and_publish bool, definition jsonb, definition_hash |
| `audit_logs` | bigint PK, actor_id (SET NULL), actor_type (`account\|api_token\|system`), action, subject, target_id, metadata jsonb (no field values), ip, created_at |
| `app_settings` | key UK, value jsonb (e.g. `reviewer.enabled`) |

### 8.2 Content (`content` schema, generated)
- **Root table** `<slug>`: system columns + `document_id`, `version int`, `published_at timestamptz null`, `locale` (reserved, nullable).
  - `UNIQUE (document_id) WHERE published_at IS NULL`
  - `UNIQUE (document_id) WHERE published_at IS NOT NULL`
  - `INDEX (published_at, created_at DESC)`
- **Component table** `<slug>__<path>`, e.g. `cv_page__experience__role`:
  - columns: `id`, `component_uid uuid`, `parent_id int NOT NULL REFERENCES <parent>(id) ON DELETE CASCADE`, `order_index int`, then the fields
  - `INDEX (parent_id, order_index)`
  - **No `_lnk` tables**: components are owned exclusively, so cascade delete removes orphans by construction.
- The generator **fails** (it never truncates) when a composed name exceeds 63 bytes or two names collide after normalisation.
- `cv-page.json` produces **8 tables**: root + skill, experience, experience__role, project, education, language, reference.

### 8.3 Conditions DSL (ABAC)
JSON, whitelisted and compiled to parameterized SQL only:
`{ "all": [ { "field": "createdBy", "op": "eq", "value": "$actor.id" }, { "field": "<readable field>", "op": "in", "value": [..] } ] }`.
Operators: `eq`, `ne`, `in`. The only variables are `$actor.id` and `$actor.roleRank`. Anything else is rejected when the permission is saved.

---

## 9. API Contract (v1 outline)

All routes sit under `/api/v1`. Errors use one shape: `{ statusCode, errorCode, message, details?, requestId }`.

| Area | Endpoints |
|---|---|
| Health | `GET /health/live`, `GET /health/ready` |
| Auth | `POST /auth/login` → `{ accessToken }` or `{ requires2FA, tempToken, methods }` · `POST /auth/2fa/verify` · `POST /auth/2fa/email-challenge` · `POST /auth/refresh` (cookie) · `POST /auth/logout` (cookie) · `GET /auth/me` |
| 2FA setup | `POST /auth/2fa/totp/setup` · `POST /auth/2fa/enable` · `POST /auth/2fa/disable` (password + code) |
| Password | `POST /auth/password/request-otp` (always 202) · `POST /auth/password/reset` · `POST /auth/password/set` (invite) · `POST /auth/password/change` |
| Accounts | `GET /accounts?page=&pageSize=` (`{ data, meta { page, pageSize, total } }`) · `POST /accounts` (invite) · `PATCH /accounts/:id` · `POST /accounts/:id/disable` · `POST /accounts/:id/enable` · `POST /accounts/:id/invite/resend` · `POST /accounts/:id/sessions/revoke` |
| Roles | `GET/POST /roles` · `PATCH/DELETE /roles/:id` · `PUT /roles/:id/permissions` |
| API tokens | `GET/POST /api-tokens` · `PATCH /api-tokens/:id` · `POST /api-tokens/:id/revoke` |
| Content types | `GET /content-types` (filtered to subjects the actor can read) · `GET /content-types/:slug` |
| Documents | `GET /documents/:slug` (`status=draft\|published`, filter/sort/page) · `GET /documents/:slug/:documentId` · `POST /documents/:slug` · `PUT /documents/:slug/:documentId` (`version`) → `409 DOCUMENT_VERSION_CONFLICT { currentVersion, server, submitted, diff }` (masked) · `POST …/:documentId/publish` (`expectedVersion`) · `POST …/:documentId/unpublish` · `DELETE …/:documentId` |
| Bulk (collection only) | `POST /documents/:slug/bulk/create` · `/bulk/publish` · `/bulk/unpublish` · `/bulk/delete`, each `{ atomic, items }` → per-item results |
| Presence | `POST /documents/:slug/:documentId/presence` → active editors |
| Media | `POST /media` (multipart) · `GET /media` · `PATCH /media/:id` (alt) · `DELETE /media/:id` |
| Reviewer | `GET /reviewer/status` · `POST /reviewer/sessions` (Turnstile) · `GET /reviewer/sessions` (owner) · `PUT /reviewer/settings` (owner) |
| Audit | `GET /audit-logs` (owner) |
| Owner setup (D1) | `GET /setup/status` → `{ open }` · `POST /setup/owner` (setup token in body) → `201 { email }`; `404` once an owner exists or when no token is configured |
| GraphQL (D18) | `POST /graphql` (queries only): per content type `<type>(documentId, status)` and, for collections, `<type>List(status, page, pageSize, sort, filter)` → `{ data, meta }`; same auth, masking and error codes as the document reads |

`:slug` is always checked against the `content_types` registry before any SQL is built. It is never interpolated directly.

---

## 10. Code Style

```ts
// apps/cms-api/src/modules/documents/documents.controller.ts
@Controller(API_ROUTES.DOCUMENTS.ROOT)
export class DocumentsController {
  constructor(private readonly documents: DocumentsService) {}

  @Put(API_ROUTES.DOCUMENTS.BY_ID)
  @RequirePermission(PERMISSION_ACTIONS.UPDATE)
  async update(
    @Param() { slug, documentId }: DocumentParamsDto,
    @Body() body: UpdateDocumentDto,
    @Actor() actor: ActorContext,
  ): Promise<SerializedDocument> {
    return this.documents.update({ slug, documentId, ...body }, actor);
  }
}
```

- No literals for routes, limits, headers, cookie names or URLs. They live in the owning module's `*.constants.ts`, in `common/constants/*.constants.ts` when shared, or in config (§5 constants placement; project `code-standards` skill).
- Services take an explicit `ActorContext`. Policy checks live in `access`, never inline `role === 'x'`.
- DTOs are validated with Zod (`nestjs-zod`). One schema per DTO, and the shared schema types are exported for the frontends.
- Prettier, ESLint and Oxlint from `@abyss/base-config` (`/prettier`, `/eslint`, `/oxlint`): the base holds the shared rules; each project extends it locally with its own plugins and rules (React, Next, Nest, Playwright). The package is built with `tsc` to `dist/` (ESM + `.d.ts`) and its exports point at `dist/`; turbo builds it before any consumer task (D3).

---

## 11. Testing Strategy

| Level | Tool | Where | Required for |
|---|---|---|---|
| Unit | Jest (API), Vitest (UI) | next to source, `*.spec.ts(x)` | pure logic: policy evaluator, DSL compiler, generator, serializers, parsers |
| Integration | Jest + Supertest + Testcontainers PG16 | `apps/cms-api/test/integration` | every endpoint: happy path, 401, 403, validation, plus the §12 security cases |
| Component | Vitest + Testing Library | `packages/form-commons` | every exported component: props, a11y attributes, RHF integration |
| E2E | Playwright | `apps/e2e` | critical flows in §12 (login+2FA, edit+conflict, publish, reviewer, masking) |

Coverage target: ≥ 80 % lines on `access`, `identity`, `documents` and `content-engine`. Every task in `tasks/todo.md` lands with its own tests. There is no "test phase" at the end.

---

## 12. Success Criteria (each one is an automated test)

1. The owner can be created once: by `owner:bootstrap` or by `POST /setup/owner` with the valid setup token. A second attempt by either path fails; concurrent attempts (route + CLI) give exactly one owner. The setup route answers 401 for a wrong token, 404 when no token is configured or an owner exists. No other HTTP route can create an owner.
2. There is no self-registration route (`POST /auth/register` → 404).
3. A reviewer session can read published content only; masked fields stay `***`; `status=draft` → 403; any write → 403.
4. A role without read on a field gets `***`/`null` plus `_maskedFields`. Filtering or sorting on that field → 400. A 409 conflict body for that role contains no raw value of that field.
5. A PUT that resends `"***"` for a masked field leaves the DB value unchanged. A PUT with a non-writable, non-masked field → 400.
6. After a token's creator loses `delete` permission, the token gets 403 on delete. A disabled creator → the token gets 401.
7. An admin cannot change their own role's permissions, cannot assign `admin`/`owner`, and cannot manage another admin or that admin's tokens.
8. A spoofed `X-Forwarded-For` doesn't change the rate-limit key (with the documented hop count).
9. The 6th wrong OTP for a code fails even when correct. A 6th OTP issue within the hour → 429. Responses for unknown emails can't be told apart from those for known ones.
10. Reusing a rotated refresh token revokes the family. After a password reset, old access tokens → 401 on the next request.
11. A role/permission change takes effect on the next request (single replica).
12. Two concurrent publishes never produce two published rows (partial unique index). Publish with a stale `expectedVersion` → 409.
13. A file whose bytes don't match an allowlisted type → 415. SVG → 415. Stored images have no EXIF. Deleting a referenced file → 409.
14. Richtext `<img onerror>` / `<script>` is stripped when stored and isn't executed on web.
15. With `NODE_ENV=production`, startup fails when `MAIL_PROVIDER=console` or a secret is missing.
16. `cv-page.json` generates exactly the 8 tables in §8.2. A schema whose composed name exceeds 63 bytes fails generation with a clear error.
17. `POST /api/v1/auth/login/` (trailing slash) through the Traefik-like proxy test returns 200/401, never 3xx.
18. Every security event in D15 writes an `audit_logs` row, even when activity tracking is `none`.
19. GraphQL returns the same masked values and `_maskedFields` as REST for each role; filter/sort on an unreadable field → `FIELD_NOT_READABLE`; a hidden content type gives the same error as an unknown one; `status: DRAFT` as anonymous/reviewer → `FORBIDDEN`; introspection is refused with `NODE_ENV=production`; each D18 limit rejects an over-limit query before any SQL runs.

---

## 13. Boundaries

- **Always:** write tests with each task · run Prettier, lint and typecheck before committing · use constants/config rather than literals · route every record payload through the serializer · use parameterized SQL · keep `.env.example` in step with config.
- **Ask first:**
  - adding any dependency not listed in §3
  - DB schema changes outside the current task
  - changing a canonical value in §6
  - changing a decision in §7
  - CI/deploy changes
  - deleting files
- **Never:** read or edit `.env*` (except `.env.example`) · commit secrets · interpolate identifiers or slugs into SQL · build v2 backlog items · trust client-supplied permissions/`_maskedFields` · log OTPs, tokens or passwords in production · add AI attribution to commits.

---

## 14. Open Questions (need your answer before the tasks that depend on them)

| # | Question | Recommendation | Blocks |
|---|---|---|---|
| Q1 | Use Kysely for content queries (new dependency) instead of Prisma for content tables? | Yes: Prisma can't model runtime-defined tables safely, and Kysely keeps parameterized, typed-ish SQL | T06 · **Answered: Yes (Kysely)** |
| Q2 | Confirm self-registration is removed in v1 (invite-only)? | Yes | T09 · **Answered: Yes, invite-only** · Amended 2026-10-22: still no self-registration; the single exception is the one-time, token-guarded owner setup (D1, ADR 0005) · Amended 2026-10-23: still no self-registration route; test stacks may also create accounts through the `seed:account` CLI, which is CLI only and refused in production without a per-invocation opt-in (D1, D17) |
| Q3 | Should email-OTP 2FA be allowed, or TOTP only? Email-as-2FA means email compromise = account takeover. | Allow it, show a warning, recommend TOTP | T13 · **Answered: TOTP + email OTP, with warning** |
| Q4 | Real domain names, and is Cloudflare in front (affects `CLIENT_IP_HEADER` and Turnstile keys)? | — | T04, T31 |
| Q5 | Which fields in `cv-page.json` are sensitive (masked for `public`/`reviewer` by default)? Candidates: `reference.phone`, any salary fields. | — | T30 |
| Q6 | Should reviewers see anything beyond published content in v1 (e.g. read-only admin UI tour)? | Read-only admin UI with masked data, no drafts | T32 |
| Q7 | Re-enabling a disabled account: which status does it get? | `active` if it has a password, else `invited` (an invitee disabled before setting a password stays able to use the invite flow) | T17a · **Answered: active if password, else invited** |
| Q8 | Which permission may resend an invite? | `accounts:create` (it issues an invitation, same as invite); D6 rank rule applies | T17a · **Answered: `accounts:create`** |
| Q9 | Invite throttle values (invite + resend share one counter)? | 10 / hour per actor and 20 / hour per IP, in-memory like the other limits | T17a · **Answered: 10/h per actor + 20/h per IP** |
| Q10 | List pagination style (becomes the convention for documents, media, audit logs)? | Offset: `page` (default 1), `pageSize` (default 20, max 100), response `meta { page, pageSize, total }` | T17c · **Answered: Offset, as recommended** |
| Q11 | Paginate `GET /roles` too? The invite role picker, the matrix and the caller-access hint need the full list. | No: keep a full list and cap custom roles at 50 (`409 ROLE_LIMIT_REACHED`) | T17c · **Answered: No pagination; cap 50** |
| Q12 | Filters or search on the accounts list now? | None in v1 (few accounts); add `status` filter later if needed | T17c · **Answered: None in v1** |
| Q13 | Confirm dialogs for Enable and Resend invite in the admin UI? | None (both reversible, no data loss); keep the confirm on Disable | T18a · **Answered: No confirm** |
| Q-W4 | Web CSP `style-src` (D17) | `'self' 'nonce-<n>'` plus `style-src-attr 'unsafe-inline'` (React/Radix inline style attributes; attributes cannot run script) | T36 |
| Q-G1 | GraphQL dependency | `graphql` (graphql-js, current stable, exact pin) in cms-api only, in-house handler; no Apollo/Yoga/`@nestjs/graphql` | GQ1 |
| Q-G2 | GraphQL scope | Document reads only, queries only; admin stays on REST | GQ1 |
| Q-G3 | GraphQL pagination | Offset, same as REST (Q10); cursors later if needed | GQ1 |
| Q-G4 | GraphQL limits | Body 32 KiB, 2 000 tokens, depth 8, 5 root fields, 500 field nodes | GQ3 |
| Q-G5 | Introspection in production | Off for everyone; tooling uses the committed SDL | GQ3 |
| Q-G6 | Web GraphQL client | No client library (fetch on server, Axios in browser); `graphql` as a web devDependency for the SDL contract test | T30 |
| Q-G7 | Which cv-page the web shows (it is a collection) | The published one with `isMain = true`, newest `updatedAt` if several; none → empty state | T30 |
| Q-OS1 | After a successful setup, sign the owner in at once or send them to the login page? | Login page with the email prefilled and a "turn on two-factor" notice: one path issues sessions (throttles, login audit); costs one extra step | OS1, OS2 |
| Q-OS2 | Should `GET /setup/status` need no token? It tells anyone a fresh instance awaits setup. | Yes, no token: the console must know whether to show the page; the window is short and the submit still needs the token | OS1, OS2 |
| Q-OS3 | Persist a "setup completed" marker so setup never reopens, even if the owner row is deleted in SQL with a token still configured? | No marker (no schema change); rely on the owner row, the boot warning and removing the token after setup | OS1 |
| Q-OS4 | How does the smoke stack create its owner? | Through the setup route (curl, test token in `scripts/stack/cms-api.env`), then assert `owner:bootstrap` refuses; the CLI's create path stays covered by integration tests | OS3 |
