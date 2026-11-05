---
summary: Core tables, generated content tables, conditions DSL
replaces: §8, §8.1, §8.2, §8.3
---

# Data model

Part of the [project spec](../../../SPEC.md). Reference: definitions and values only; the rules that use them are in the `RULES.md` files.

### 8.1 Core (`public`, Prisma)

Every table has `id` (int identity PK), `created_at`, `updated_at`. User-facing tables also have `document_id` (UUIDv7, unique). `created_by`/`updated_by` reference `accounts(id)` **ON DELETE SET NULL**.

| Table                                                 | Key columns                                                                                                                                                                                                                                                                                |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `accounts`                                            | email UK (citext), password_hash, display_name, role_id FK, role_slug (composite FK (role_id, role_slug) → roles(id, slug), ADR 0002), status (`invited\|active\|disabled`), token_version int, is_2fa_enabled, two_fa_method (`totp\|email`), totp_secret_enc, totp_last_step, deleted_at |
| `roles`                                               | slug UK, name, rank, is_system, policy_version int                                                                                                                                                                                                                                         |
| `permissions`                                         | role_id FK, subject (content type slug or system subject), action, readable_fields jsonb (null = all), writable_fields jsonb (null = all), conditions jsonb (DSL §8.3)                                                                                                                     |
| `refresh_tokens`                                      | account_id FK, family_id uuid, token_hash UK, replaced_by_id, user_agent, ip, expires_at, revoked_at, remember_me (boolean, NOT NULL, default `true` for rows before §16)                                                                                                                  |
| `otp_codes`                                           | account_id FK, purpose, code_hmac, attempts, expires_at, used_at                                                                                                                                                                                                                           |
| `api_tokens`                                          | name, token_prefix, token_hash UK, created_by_id FK (not null, ON DELETE CASCADE), scope jsonb, expires_at, revoked_at, last_used_at                                                                                                                                                       |
| `reviewer_sessions`                                   | account_id FK (ephemeral `reviewer` account), visitor_role, purpose_tags jsonb, notes (≤ 500 chars, plain text), ip_hmac, user_agent, expires_at, last_active_at                                                                                                                           |
| `file_library`                                        | file_name, mime_type, size, width, height, alt, storage_key UK, sha256, url, thumbnail_url, provider (`cloudinary\|preset`), is_reviewer_preset, deleted_at                                                                                                                                |
| `content._content_types` (content engine, not Prisma) | slug UK, kind (`single\|collection`), draft_and_publish bool, definition jsonb, definition_hash                                                                                                                                                                                            |
| `audit_logs`                                          | bigint PK, actor_id (SET NULL), actor_type (`account\|api_token\|system`), action, subject, target_id, metadata jsonb (no field values), ip, created_at                                                                                                                                    |
| `app_settings`                                        | key UK, value jsonb (e.g. `reviewer.enabled`)                                                                                                                                                                                                                                              |

### 8.2 Content (`content` schema, generated)

- **Root table** `<slug>`: system columns + `document_id`, `version int`, `published_at timestamptz null`, `locale` (reserved, nullable).
  - `UNIQUE (document_id) WHERE published_at IS NULL`
  - `UNIQUE (document_id) WHERE published_at IS NOT NULL`
  - `INDEX (published_at, created_at DESC)`
- **Component table** `<slug>__<path>`, `<path>` = the snake_case `component` values from the root joined by `__` (never the field names; ADR 0019, CM-4), e.g. `cv_page__experience__role` for fields `experiences` (`component: "experience"`) and `roles` (`component: "role"`):
  - columns: `id`, `component_uid uuid`, `parent_id int NOT NULL REFERENCES <parent>(id) ON DELETE CASCADE`, `order_index int`, then the fields
  - `INDEX (parent_id, order_index)`
  - **No `_lnk` tables**: components are owned exclusively, so cascade delete removes orphans by construction.
- The generator **fails** (never truncates) when a composed name exceeds 63 bytes or two names collide after normalisation.
- `cv-page.json` produces **8 tables**: root + skill, experience, experience__role, experience__role__project, education, language, reference (after migration 0006, feature `cv-page-schema`; before it, `project` was a root-level component).

### 8.3 Conditions DSL (ABAC)

JSON, whitelisted and compiled to parameterized SQL only:
`{ "all": [ { "field": "createdBy", "op": "eq", "value": "$actor.id" }, { "field": "<readable field>", "op": "in", "value": [..] } ] }`.
Operators: `eq`, `ne`, `in`. The only variables are `$actor.id` and `$actor.roleRank`. Anything else is rejected when the permission is saved.
