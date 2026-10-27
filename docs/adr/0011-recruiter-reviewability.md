# ADR 0011: Recruiter reviewability (one-command demo, CV page, README)

- Status: accepted for planning (2026-10-27). User answers Q-RV2..Q-RV9 are recorded under "Questions". Q-RV1 (the LICENSE copyright holder's name) is still open; only the LICENSE file waits for it.
- Date: 2026-10-27
- Asked by: the user (handoff "Recruiter reviewability", 2026-10-27), from the qc audit `.claude/state/findings/audit-2026-10-27-qc.md`. User decisions in force: license MIT; no seeded or published demo account (recruiters use the existing reviewer flow); T30 is unarchived and replanned against CT3 and ADR 0010; order demo setup -> CV page -> README.
- Amends: SPEC §4 (new command), §5 web tree (CV page file names), §14 (Q5, Q-G6, Q-G7 recorded as answered). Builds on ADR 0004 (web on Next.js), ADR 0003 (GraphQL), ADR 0010 (site content types).

## Context (checked on the repo, 2026-10-27)

### Audit F4 re-verified

The audit says a fresh clone cannot use `pnpm dev:stack` because it depends on the git-ignored `.localEnv.agent`. That part is wrong: `scripts/dev-stack.sh` `load_local_env` calls `create_local_env` when the file is missing and fills it with generated dev-only values (ports and the four secrets). What a fresh clone really hits:

| Gap                                                                                                                       | Effect for a first-time visitor                                              |
| ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| `docs/local-run.md` never mentions `pnpm dev:stack`; it describes the 10-step manual way and the smoke stack only         | the one-command path is invisible                                            |
| no check that Docker is running or that `pnpm install` was run; the script fails deep inside `compose` or `pnpm --filter` | an unclear error                                                             |
| a port already in use (5173, 5174, 3100) is not detected; the stack prints "ready" (handoff follow-up, 2026-10-26)        | the browser shows another app                                                |
| reviewer access is off on a new database (`app_settings` row `reviewer.enabled` missing = off)                            | the "Reviewer access" button is hidden, so the reviewer flow cannot be tried |
| no content: no `resume`, `cv-contact` or `cv-page` document exists                                                        | the web and the admin content lists are empty                                |
| the owner password is random per run and only written to `.dev-stack/e2e-vars.sh` (mode 600); nothing tells the user      | the person who ran the command cannot open the admin; kept that way (Q-RV3)  |

### Audit F3 is stale

T31-T33 are done: the web header has "Reviewer access" (Turnstile dialog, 24 h read-only session, `apps/web/src/features/reviewer`) and web sign-in; cms-admin has the reviewer banner and the owner's reviewer sessions page. What the reviewer can look at on web is the CV page, which does not exist yet (T30).

### T30 today

T30 was skipped by the user and archived (board archive). Its text (tasks/todo.md Phase 6) predates four later changes:

1. Q-G6 and Q-G7 were answered by the user on 2026-10-21 (archive/handoff-archive.md "GraphQL answers"), but SPEC §14 still shows them as open. Q5 was confirmed the same day (`reference.phone`, `company` root and `experience.company`, `github`, `email`) and is also still open in SPEC §14.
2. CT3 (ADR 0010) added `resume` (the user's newer CV model: `name`, `skills`, `experiences.roles.projects`, `educations`, `languages`, `referees`), `cv-contact` (name, address, phone, email, linkedin, github, avatar), `header` (site name, nav with `requiresRole`, login/logout button text) and `common-text` (one `json` field). `cv-page` stays. T30 must pick which type it shows (Q-RV4) and which of the others it renders (Q-RV5).
3. File naming (ADR 0008, SPEC §5 vocabulary): `*.graphql.ts` for GraphQL documents, `*.server.ts` for server-only code, PascalCase files. The old T30 paths (`cv.query.ts`, `lib/graphql/graphql-fetch.server.ts`, `render-richtext.ts`) break the rule.
4. File granularity (`code-standards` §4.4): the old T30 was one M task with 12 product files and one file per section; it is split below.

Masking: the `public` and `reviewer` system roles get one wildcard row `*: read` with all fields (`access/domain/SystemRoles.entity.ts`). The definition key `sensitive` is parsed and shown by `GET /content-types`, but nothing turns it into a masked field (no code reads it for permissions). So today an anonymous visitor would read every field, including phone numbers. SPEC D2 says the reviewer field profile "starts with every sensitive field masked". This is a gap between SPEC and code (Q-RV6, Q-RV7).

## Decision

### 1. One command: `pnpm demo`

`pnpm demo` starts the existing dev stack and adds what a visitor needs to look around. It is a subcommand of `scripts/dev-stack.sh`, not a new stack: same compose project `abyss-dev`, same `.localEnv.agent`, same stop command (`pnpm dev:stack:stop`). The dev stack stays the tier 2 test stack; `pnpm dev:stack` behaves exactly as before.

```
pnpm install      # once
pnpm demo         # Docker must run; about 30 s on a warm machine
pnpm dev:stack:stop
```

`scripts/dev-stack.sh demo` = `start` plus, in this order:

1. Pre-flight before anything starts (both `start` and `demo`): Docker answers (`docker info`), `node_modules/` exists (else it runs `pnpm install --frozen-lockfile`), and each host port (API, admin, web, Mailpit, Postgres) is free; a taken port stops the run with the port and the key in `.localEnv.agent` that moves it. This also closes the "ready although the port is taken" follow-up.
2. Turns reviewer access on as the stack's owner (`PUT /api/v1/reviewer/settings`, the existing owner-only route, so it is audited like any toggle).
3. Seeds sample content (task RV-demo-2): every file in `scripts/demo/content/` is created through the REST API as the owner (`POST /api/v1/documents/<slug>`) and published (`POST .../publish`). No SQL, no new CLI: the data passes the same validation, sanitizing and audit as editor input.
4. Prints the web, admin and Mailpit URLs, the line "Reviewer access is on: open the web and choose Reviewer access", and the stop command. It prints nothing about the owner login (Q-RV3): signing in to the admin locally needs a separate owner setup (`docs/local-run.md` section 3), which the README says.

The Turnstile widget uses Cloudflare's public always-pass test keys, as today; it still needs internet access to load the widget script (stated in the docs).

Module ownership:

| Responsibility                                     | Owner (one file)                                                                                       |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| stack lifecycle, pre-flight, ports, summary output | `scripts/dev-stack.sh` (existing)                                                                      |
| reviewer toggle and sample content through the API | `scripts/lib/demo-seed.sh` (new, sourced; one function per step)                                       |
| the sample documents                               | `scripts/demo/content/<slug>.json` (data only, one file per content type, body = the REST create body) |
| how to run it                                      | `docs/local-run.md` section 1 "Quick start" (existing file)                                            |

Extension path: sample data for another content type is one more `scripts/demo/content/<slug>.json`; the seed loop needs no change. A further demo step is one function in `demo-seed.sh` called from the `demo` branch.

Names: `demo` (command and subcommand), `demo-seed.sh`, `scripts/demo/content/`. Shell and JSON files keep their own conventions (SPEC §5 naming rules cover TypeScript only). The seed uses only tools the stack already needs (bash, curl, Node for JSON parsing, openssl); no `jq`.

Not done: a hosted live demo (no deploy target is set up; D1 open), a published account, GitHub Pages for the architecture HTML, a GIF (Q-RV9).

### 2. CV page (T30 replanned)

Q-G6 (answered 2026-10-21): no GraphQL client library; `fetch` on the server, the existing Axios client in the browser; `graphql` is already a web devDependency for the SDL contract test.

Q-G7 (answered 2026-10-21 for `cv-page`, applied to `resume` per Q-RV4): the page shows the published document with `isMain = true`, the newest `updatedAt` if several; none -> an empty state. The query is `resumeList(filter: { isMain: { eq: true } }, sort: [{ field: updatedAt, direction: DESC }], pageSize: 1)`, plus `cvContact` (single type), in one request; `header` and `common-text` are not rendered in this phase (Q-RV5) (2 root fields, within the GQ3 limits).

Module ownership (web, SPEC §5 web layers):

| Responsibility                                                                  | Owner                                                          |
| ------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| GraphQL transport, server side (`API_INTERNAL_URL`, no auth, cache)             | `apps/web/src/lib/Graphql.server.ts` (`server-only`)           |
| GraphQL transport, browser side (Bearer from the session)                       | `apps/web/src/lib/Graphql.client.ts`                           |
| richtext sanitizing (DOMPurify, allowlist mirrors cms-api)                      | `apps/web/src/lib/SafeRichtext.rules.ts`                       |
| the CV query documents and result types                                         | `apps/web/src/features/cv/Cv.graphql.ts`                       |
| actor-keyed refetch (anonymous vs signed in vs reviewer)                        | `apps/web/src/features/cv/useCvContent.ts`                     |
| client boundary that holds the server data as `initialData`                     | `apps/web/src/features/cv/CvView.tsx`                          |
| contact block (cv-contact) and the masked placeholder                           | `apps/web/src/features/cv/ContactCard.tsx`                     |
| resume sections (summary, skills, experiences, educations, languages, referees) | `apps/web/src/features/cv/ResumeSections.tsx`                  |
| route: fetch on the server, empty and error states                              | `apps/web/src/app/page.tsx`, `app/error.tsx` (framework files) |
| system status card (today's home page)                                          | moves to `apps/web/src/app/status/page.tsx` (Q-RV8)            |
| default masking of sensitive fields                                             | cms-api `access` (Q-RV7)                                       |

`features/cv` imports only `features/session` (SPEC §5 web layers), through its `index.ts`. File count: `features/cv` 6 files (5 + `index.ts`), `lib/` +3; every new file holds one use case or one component group, none under 30 lines except `index.ts` and the framework route files. `Cv.graphql.ts` holds both documents and their hand-written result types (no types-only file). Words used: `graphql`, `server`, `client`, `rules` (all in the SPEC §5 vocabulary; no new word).

Extension path: another section from another type (for example `header` later, Q-RV5) is one more selection in `Cv.graphql.ts`, one more component file in `features/cv`, and one line in `CvView.tsx`; the transport files and the route stay. Another page (for example a project list) is a new feature folder that reuses `lib/Graphql.server.ts` and `lib/Graphql.client.ts`.

Security rules carried over from the old T30 unchanged: the server fetch sends no `Authorization`, cookie or client-IP header (D14); the server HTML and the RSC payload carry only what the `public` role receives; masked values render a "Sign in to view" placeholder; richtext is sanitized before render on the server and the client (§12-14); a fetch failure renders the error state, never cached data of another actor.

### 3. Root README and LICENSE

- `LICENSE`: the standard MIT text, `Copyright (c) 2026 <holder>`; the holder is the name the user gives for Q-RV1 (open; not the git author name). Root `package.json` gains `"license": "MIT"`; the private workspace packages stay unlicensed fields (they are not published).
- `README.md` (root), short, for a first-time visitor. Sections in this order: one-line pitch and what Abyss is (SPEC §1); screenshots (below); feature highlights as bullets linked to their proof (field masking -> `docs/modules/access-control.md`, draft/publish with optimistic concurrency, security audit, reviewer access, GraphQL read API -> `docs/modules/graphql.md`, clean-architecture layers -> ADR 0006); tech stack (SPEC §3, one line per app); Quick start (the three commands from section 1 above, link to `docs/local-run.md`, and one sentence that a local admin sign-in needs a separate owner setup, Q-RV3); "Where to look" (SPEC.md, `docs/adr/`, `docs/modules/`, `docs/architecture/*.html` with the note that GitHub shows HTML as source and how to open it locally, CI in `.github/workflows/`, e2e in `apps/e2e`); repository map with one line for `tasks/` and `.claude/` (the agent workflow that built the project, audit F5) instead of hiding them; license line. No live demo link (none exists) and no credentials.
- Screenshots: PNG files only in `docs/screenshots/` (Q-RV9), captured by qc from `pnpm demo` after the CV page lands: (1) web CV page, anonymous, with masked placeholders; (2) the same page in a reviewer session; (3) admin content editor on the resume document; (4) admin role editor with field permissions; (5) admin security audit or reviewer sessions page. For the owner screens qc signs in with the stack owner from `.dev-stack/e2e-vars.sh` (qc's own access; never shown in an image or printed by `pnpm demo`). Each image has alt text in the README. No real personal data in any image (sample content only, Q-RV2).
- `apps/cms-admin/README.md` "So far" summary is stale (audit F6); a small ui-builder task brings it in line with `src/features/` so the README links do not land on outdated text.

## Consequences

- One new root script (`demo`), one new sourced shell file, a sample-data folder, and a pre-flight that also protects the tier 2 runs.
- The web home page becomes the CV page; the status card keeps a route (Q-RV8). e2e specs that open `/` for the status card move to `/status` (qc).
- Until RV-mask (Q-RV7) is built, the CV page would show every field to anonymous visitors. The CV page tasks therefore wait for the masking task, and the sample content contains no real personal data.
- SPEC §14 rows Q5, Q-G6 and Q-G7 are marked answered; D18's "pending" note is updated.

## Questions

Answered by the user (2026-10-27):

- **Q-RV2** Sample content: a made-up person (`example.com` emails, `555` phone numbers); no real personal data in the repo or the screenshots.
- **Q-RV3** Owner login: `pnpm demo` prints nothing about it (no email, password or credentials path). The README says that a local admin sign-in needs a separate owner setup (`docs/local-run.md`).
- **Q-RV4** The CV page shows `resume`; Q-G7's rule (published, `isMain = true`, newest `updatedAt`, else an empty state) applies to it. `cv-page` stays as a type and is not rendered.
- **Q-RV5** The page renders `resume` and `cv-contact`. `common-text` and `header` are not rendered in this phase; the web header keeps its current shell.
- **Q-RV6** Fields that start masked for `public` and `reviewer`: `cv-contact.phone`, `cv-contact.email`, `cv-contact.address`, `cv-contact.github`, `resume.referees.phone`, `resume.experiences.company`. `linkedin`, `name` and `avatar` stay public.
- **Q-RV7** Option (a): the fields get `sensitive: true` in their definitions (a definition-only content migration), and an access rule makes a wildcard `*` content row of the `public` and `reviewer` roles not cover `sensitive` fields; a type-specific row the owner adds still decides on its own (SPEC D2). Task RV-mask, Security gate.
- **Q-RV8** The status card moves to its own route `/status`, not linked from the header.
- **Q-RV9** PNG screenshots only; no GIF, no GitHub Pages; the architecture HTML is linked as files.

Open:

- **Q-RV1** LICENSE copyright holder: a name other than the git author, to be given by the user. The LICENSE file in RV-doc-1 waits for it; the README part of RV-doc-1 does not. The name is never guessed.

## Addendum: launch gate (user, 2026-10-27)

The project goes live for real, so security must hold for any public visitor, not only for recruiters. A launch gate phase LG follows RV3 (SPEC §13 "Launch gate"; tasks LG-0, LG-dep, LG-2, LG-1, LG-fix-*, LG-3 in `tasks/todo.md`). No public DNS record, ingress or announced URL until LG passes and the user approves the launch in writing.

Ownership: the read-only live check is one script, `scripts/launch-check.sh`, with one `scripts/launch-check/<group>.sh` per group (headers, transport, auth, masking, injection), the same layout as `scripts/smoke/`. It also runs inside `pnpm smoke`, so tier 3 keeps it green. Extension path: a new check is one function in its group file; a new group is one file plus one call. The whole-project review and the live walk produce findings files; fixes become LG-fix tasks.

User answers:

- **Q-LG1** The live check runs on the production config before the site is public; a staging host with the production config is allowed.
- **Q-LG2** The user deploys and gives a throwaway admin account with 2FA on, disabled after LG-3.
- **Q-LG3** Write probes: yes, before public only; the test data is deleted afterwards.
- **Q-LG4** multer advisory: a pnpm override (LG-dep), kept only if unit, integration and tier 3 pass.
- **Q-LG5** OWASP ZAP passive baseline allowed; the user is asked again right before it runs.

Still open: Q-RV1 (LICENSE copyright holder name).
