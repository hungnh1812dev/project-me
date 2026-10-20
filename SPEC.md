# Spec: Abyss Headless CMS & Portfolio (v1)

Status: **Approved 2026-10-20** · Date: 2026-10-20 · Supersedes: `CMS_Requirements_And_Architecture_Spec.html`, `CMS_Implementation_Planning.html`, `CMS_Project_Tasks.html` (kept for history; where they disagree with this file, this file wins).

Related: [tasks/plan.md](tasks/plan.md) · [tasks/todo.md](tasks/todo.md)

---

## 0. Assumptions (correct these before implementation starts)

1. One owner (the portfolio author), plus a few invited editors/admins. Not multi-tenant.
2. One VPS, K3s + Traefik, **one replica per app in v1**. In-memory caches are acceptable only where marked, and each one says what changes at more than one replica.
3. PostgreSQL 16, running in-cluster with a PVC. The separate deploy repo owns backups, and this repo documents what they must cover.
4. Public self-registration is **off**. Accounts are created by invitation.
5. v1 scope is cut down (see §2). GraphQL, Group 2 runtime DDL, reviewer write sandbox, S3 and Yup move to v2.
6. Domains: `domain.com` (web + API under `/api/v1`) and `admin.domain.com` (cms-admin).

---

## 1. Objective

Build a headless CMS that:
1. **Content hub:** the owner manages and publishes CV/portfolio content defined by JSON schemas (root + up to 3 nested component levels), served over REST.
2. **Technical showcase:** it shows ERP-grade concerns that actually hold up under attack: hybrid RBAC + field-level permissions with `***` masking, draft/publish with optimistic concurrency and diff/merge, an always-on security audit, and a safe "Login as Reviewer" experience.

Users and actors (threat model):

| Actor | How they get in | Can do (v1) |
|---|---|---|
| Anonymous | none | Read **published** content through the `public` role's field profile |
| Reviewer | Self-service session (Turnstile + rate limit), 24h, when Owner enables it | Read published content through the `reviewer` role's field profile, browse preset media. **No writes, no drafts.** |
| Editor (rank 30) | Invitation | Permissions granted to their role |
| Admin (rank 40) | Invitation | Manage accounts/roles/tokens **strictly below** rank 40, plus their role's content permissions |
| Owner (rank 100) | `owner:bootstrap` CLI only | Everything |
| API token | Created by an Admin/Owner session | ≤ creator's **current** permissions, content endpoints only |

Success means every item in §12 has a passing automated test.

---

## 2. Scope

### Capability map

| Module id | Responsibility | Depends on |
|---|---|---|
| `platform` | Monorepo, tooling, config/env validation, HTTP pipeline, health, Docker | — |
| `ui-kit` | `@abyss/form-commons`: shadcn base + form components, built to `dist/` | platform |
| `content-engine` | JSON schema → validated definition → SQL migrations for `content` schema, tree repository | platform |
| `identity` | Owner bootstrap, invitations, login, refresh rotation, OTP, TOTP 2FA, password lifecycle, rate limits | platform |
| `access` | Roles, permissions, policy evaluation, field projection/masking, write allowlist, revocation versions, API tokens, security audit | identity |
| `documents` | Document CRUD, OCC/409, draft/publish deep clone, presence, bulk (collections) | content-engine, access |
| `media` | Upload pipeline, Cloudinary adapter, file library, safe delete | access |
| `reviewer` | Reviewer toggle, session creation, field profile, owner log, cleanup | access, media |
| `admin-app` | cms-admin UI | ui-kit + the API modules it uses |
| `web-app` | Public CV site, login, reviewer entry | ui-kit, documents, reviewer |

Build order: `platform` → (`ui-kit`, `content-engine`, `identity`) → `access` → (`documents`, `media`) → `reviewer` → app slices. UI work goes into each vertical slice; it is not a separate phase.

### In scope (v1)
Everything in the map above. Collections get bulk create/publish/unpublish/delete.

### Out of scope (v2 backlog — do not build in v1)
GraphQL gateway · Group 2 owner-private runtime DDL · reviewer write sandbox · S3 adapter · Yup support · SSO across unrelated domains · multi-replica deployment.

---

## 3. Tech Stack

| Area | Choice |
|---|---|
| Package manager / build | pnpm workspaces + Turborepo |
| API | NestJS 11 on **Express**, TypeScript strict |
| Core persistence | Prisma (PG schema `public`, system tables only) via `@prisma/adapter-pg` |
| Content persistence | Generated SQL migrations in PG schema `content`; queries through **Kysely** with parameters only (decision D10; confirm, since it's a new dependency) |
| Auth | Passport-JWT, `argon2` (Argon2id), `otplib` (TOTP) |
| Frontends | React 19 + Vite, Redux Toolkit (session/UI), TanStack Query (server data), Axios |
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
│   ├── prettier-config/          # @abyss/prettier-config
│   └── form-commons/             # @abyss/form-commons, exports ./dist only
│       └── src/{components/ui, components/forms, constants}
├── apps/
│   ├── cms-api/                  # @abyss/cms-api
│   │   ├── prisma/               # core schema + migrations (public)
│   │   ├── content/              # schemas/*.json + generated migrations/
│   │   ├── src/
│   │   │   ├── config/           # env.schema.ts (Zod), app-config.ts (frozen IAppConfig)
│   │   │   ├── common/           # constants/, filters/, guards/, pipes/, serializers/
│   │   │   ├── infrastructure/   # database/, mail/, media/, turnstile/
│   │   │   └── modules/          # identity/, access/, content-engine/, documents/, media/, reviewer/, health/
│   │   └── test/                 # e2e/, fixtures/
│   ├── cms-admin/src/{config, store, lib, features}
│   ├── web/src/{config, store, lib, features}
│   └── e2e/                      # @abyss/e2e Playwright
└── docs/{adr, modules, deployment}
```

Naming rules: files are `kebab-case.ts`, and constants files end in `.constants.ts`. There is one endpoint map per frontend at `src/config/endpoints.ts`.

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
| Core tables | `accounts`, `roles`, `permissions`, `refresh_tokens`, `otp_codes`, `api_tokens`, `reviewer_sessions`, `file_library`, `content_types`, `audit_logs`, `app_settings` |
| Refresh cookie | `__Secure-abyss_rt`, host-only `domain.com`, `Path=/api/v1/auth`, `HttpOnly; Secure; SameSite=Strict` |
| Origins | web + API: `https://domain.com` · admin: `https://admin.domain.com` (the only CORS origin, credentials on) |

---

## 7. Security Decisions (fixes for review findings C1–C8 and related)

**D1 Owner bootstrap (C1).** No "first verified user becomes owner". The `owner:bootstrap` CLI takes `OWNER_EMAIL` and an interactive password, runs in a transaction with `pg_advisory_xact_lock`, and refuses if an owner exists. A partial unique index `ON accounts ((1)) WHERE role_slug = 'owner' AND deleted_at IS NULL` enforces a single owner. Self-registration endpoints don't exist in v1.

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
- `SecurityAuditService` is always on and writes in the same transaction for login success and failure, 2FA changes, password changes, role, permission and account changes, token create and revoke, reviewer toggle and media delete.
- Activity tracking (content edits) stays pluggable (`none | database`).
- Audit metadata never stores field values, only field names.

**D16 Presence.** Requires `update` permission on the document. Returns `{ accountId, displayName, state, lastSeenAt }` only. In-memory store (single replica, documented).

**D17 Production guards (config fail-fast).**
- With `NODE_ENV=production`, Zod rejects `MAIL_PROVIDER=console`, any missing secret, and secrets shorter than 32 bytes.
- The boot config summary redacts secrets.
- Headers: HSTS, CSP per SPA (set by each app's nginx; the API sends `default-src 'none'`), `X-Content-Type-Options`, `Referrer-Policy`.

---

## 8. Data Model

### 8.1 Core (`public`, Prisma)
Every table has `id` (int identity PK), `created_at` and `updated_at`. User-facing tables also have `document_id` (UUIDv7, unique). `created_by`/`updated_by` reference `accounts(id)` **ON DELETE SET NULL**.

| Table | Key columns |
|---|---|
| `accounts` | email UK (citext), password_hash, display_name, role_id FK, status (`invited\|active\|disabled`), token_version int, is_2fa_enabled, two_fa_method (`totp\|email`), totp_secret_enc, totp_last_step, deleted_at |
| `roles` | slug UK, name, rank, is_system, policy_version int |
| `permissions` | role_id FK, subject (content type slug or system subject), action, readable_fields jsonb (null = all), writable_fields jsonb (null = all), conditions jsonb (DSL §8.3) |
| `refresh_tokens` | account_id FK, family_id uuid, token_hash UK, replaced_by_id, user_agent, ip, expires_at, revoked_at |
| `otp_codes` | account_id FK, purpose, code_hmac, attempts, expires_at, used_at |
| `api_tokens` | name, token_prefix, token_hash UK, created_by_id FK (not null, ON DELETE CASCADE), scope jsonb, expires_at, revoked_at, last_used_at |
| `reviewer_sessions` | account_id FK (ephemeral `reviewer` account), visitor_role, purpose_tags jsonb, notes (≤ 500 chars, plain text), ip_hmac, user_agent, expires_at, last_active_at |
| `file_library` | file_name, mime_type, size, width, height, alt, storage_key UK, sha256, url, thumbnail_url, provider (`cloudinary\|preset`), is_reviewer_preset, deleted_at |
| `content_types` | slug UK, kind (`single\|collection`), draft_and_publish bool, definition jsonb, definition_hash |
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
| Accounts | `GET/POST /accounts` (invite) · `PATCH /accounts/:id` · `POST /accounts/:id/disable` · `POST /accounts/:id/sessions/revoke` |
| Roles | `GET/POST /roles` · `PATCH/DELETE /roles/:id` · `PUT /roles/:id/permissions` |
| API tokens | `GET/POST /api-tokens` · `PATCH /api-tokens/:id` · `POST /api-tokens/:id/revoke` |
| Content types | `GET /content-types` (filtered to subjects the actor can read) · `GET /content-types/:slug` |
| Documents | `GET /documents/:slug` (`status=draft\|published`, filter/sort/page) · `GET /documents/:slug/:documentId` · `POST /documents/:slug` · `PUT /documents/:slug/:documentId` (`version`) → `409 DOCUMENT_VERSION_CONFLICT { currentVersion, server, submitted, diff }` (masked) · `POST …/:documentId/publish` (`expectedVersion`) · `POST …/:documentId/unpublish` · `DELETE …/:documentId` |
| Bulk (collection only) | `POST /documents/:slug/bulk/create` · `/bulk/publish` · `/bulk/unpublish` · `/bulk/delete`, each `{ atomic, items }` → per-item results |
| Presence | `POST /documents/:slug/:documentId/presence` → active editors |
| Media | `POST /media` (multipart) · `GET /media` · `PATCH /media/:id` (alt) · `DELETE /media/:id` |
| Reviewer | `GET /reviewer/status` · `POST /reviewer/sessions` (Turnstile) · `GET /reviewer/sessions` (owner) · `PUT /reviewer/settings` (owner) |
| Audit | `GET /audit-logs` (owner) |

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

- No literals for routes, limits, headers, cookie names or URLs. They live in `common/constants/*.constants.ts` or in config (project `code-standards` skill).
- Services take an explicit `ActorContext`. Policy checks live in `access`, never inline `role === 'x'`.
- DTOs are validated with Zod (`nestjs-zod`). One schema per DTO, and the shared schema types are exported for the frontends.
- Prettier from `@abyss/prettier-config`. ESLint + Oxlint per project.

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

1. `owner:bootstrap` succeeds once. A second run fails. No HTTP route can create an owner.
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
| Q2 | Confirm self-registration is removed in v1 (invite-only)? | Yes | T09 · **Answered: Yes, invite-only** |
| Q3 | Should email-OTP 2FA be allowed, or TOTP only? Email-as-2FA means email compromise = account takeover. | Allow it, show a warning, recommend TOTP | T13 · **Answered: TOTP + email OTP, with warning** |
| Q4 | Real domain names, and is Cloudflare in front (affects `CLIENT_IP_HEADER` and Turnstile keys)? | — | T04, T31 |
| Q5 | Which fields in `cv-page.json` are sensitive (masked for `public`/`reviewer` by default)? Candidates: `reference.phone`, any salary fields. | — | T30 |
| Q6 | Should reviewers see anything beyond published content in v1 (e.g. read-only admin UI tour)? | Read-only admin UI with masked data, no drafts | T32 |
