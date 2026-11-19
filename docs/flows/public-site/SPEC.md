---
flow: public-site
replaces: D18, §14 Q5, §14 Q-G1..Q-G7
summary: The public site: the module status on `/` and `/status`, the CV from published content on `/cv`, page text from cms-api over GraphQL, the web BFF reads, the crawler files `robots.txt`, `sitemap.xml` and `favicon.ico`
---

# Public site: spec

Part of the [project spec](../../../SPEC.md). Flow `public-site`: [SPEC.md](SPEC.md) · [FLOW.md](FLOW.md) · [RULES.md](RULES.md).

## Behaviour

The public site (`domain.com`, Next.js) shows only the module status (the "Service status" card) on the homepage `/` and on `/status` (Q-PS5, user 2026-11-15) and the CV from published content on `/cv` (D21, Q-BFF2, user 2026-10-31), reached by a "CV" link in the site header (Q-WBH1, user 2026-11-05). The Next server reads content anonymously over the read-only GraphQL API (D18) on `APP_API_URL`; the browser calls only the web BFF under `/api/v1` (D21). Sensitive fields stay masked for anonymous visitors through the `public` role's field profile (D2 mechanism, [reviewer](../reviewer/RULES.md)). The full GraphQL decision is D18 in Decisions below.

Endpoints: [api-contract.md](../../global/reference/api-contract.md) rows "GraphQL (D18)" and "Web BFF". Web rules: [apps/web/RULES.md](../../apps/web/RULES.md) "Web rules".

## Requirements

D18 (Decisions below), D13 (rendering richtext), D17 (web CSP), D21 (BFF). New requirements of this flow go here with ids `PS-<n>`.

- **PS-1 Query split** (user 2026-11-08, Q-WCA3, Q-WCA8, Q-WCA10; feature `web-content-api`; changed 2026-11-15, Q-PS1a). Each part fetches its own data, within the D18 limits (5 root fields, depth 8, 500 field nodes): a page runs its own query, and a part shown on several pages (the header, the sign-in dialog) runs its own query in its own server component, through server GraphQL with `APP_API_TOKEN` (WEB-1, WEB-2). No query bundles the text of several parts, and no part fails because another part's query failed. Each answer is cached on its own (WEB-4); a page render runs the header, sign-in and page queries, in parallel.
  - `SiteHeader` (header, every page; changed 2026-11-15, PS-3): `header` (`appName`, `navs { title link requiresRole subNavs { title link requiresRole } }`, `author { btnLoginText btnLogoutText }`; changed 2026-11-19, ADR 0026: `appName` is the app name and the page title, the nav entries come only from `navs` (the CV link is a `navs` entry, no built-in link), the nav has no label, `appIcon` is stored but not read yet; the two author texts are the sign-in and sign-out buttons, planner Q-WCP4). `requiresRole` is one of `public`, `owner`, `admin`, `editor`; `public` or empty shows the entry to every visitor, any other value only to a signed-in visitor of that role (display only, D3). When it fails, the header shows the last-resort app name and no nav or account menu (WEB-3).
  - `SignIn` (sign-in dialog and account menu, every page, run next to the dialog in the header; changed 2026-11-15, PS-3): `signInText` (alias of `moduleAuth`: sign-in form, human check, validation, errors, two-factor step, and the account-menu texts `openCms`, `signedInAs`, `signOutFailed` moved in from `site-text`). When it fails, the account menu shows no sign-in button, no "signed in as" line, no CMS link and no sign-out failure text; the nav, the CV link and a signed-in visitor's sign-out button stay (Q-PS1b, Q-PS4).
  - `NotFoundPage` (not-found page only): `notFoundText` (alias of `moduleNotFound`: `title`, `description`; moved from `header` 2026-11-19, ADR 0026). When it fails, the page uses the last-resort not-found text (WEB-3).
  - The error page runs no query: it is a client error boundary, so its title, description and retry are always the last-resort text (WEB-3, Q-PS1a).
  - `ModuleStatus` (the module status, owned by `features/status`, rendered by `PageHome` on `/` and `PageStatus` on `/status`; changed 2026-11-15, replaces `StatusPage`): `statusText` (alias of `moduleStatus`: title and description, card texts, states, error hint, check again). The health data stays on REST through `GET /api/v1/health` (D21). Both pages show the same module and load no CV data (criterion 25).
  - `PageCv` (`/cv`; changed 2026-11-15, replaces `CvPage`; split 2026-11-16, Q-PS2e): three content queries, each its own GraphQL operation, run in parallel, so one that fails never touches the others: `PageCvA` reads `pageCvAList(filter: { isMain: { eq: true } }, sort: [{ field: updatedAt, direction: DESC }], pageSize: 1)` on `page-cv-a` (the main CV, Q-G7); `Profile` reads `profile` (the single type, the contact card shared by every CV); `CvCommonText` reads `cvCommonText` (the labels shared by every CV and the no-CV-live text, PS-3). Their mock keys are `page-cv-a`, `profile` and `cv-common-text` (WEB-5, Q-PS2f). `PageCv` shows the main CV's name, position, summary, skills, experiences with their roles, projects, educations, languages and references (added 2026-11-19, user), and the profile's name, avatar, address, phone, email, LinkedIn and GitHub as the contact card; a masked value shows the masked text (Q5); the page title is `<name> - <position>`.
  - `PageCvVisitor` (BFF `GET /api/v1/cv` only, not a page render; planner Q-WCP5): the `pageCvAList` selection of `PageCvA` and the `profile` selection of `Profile` in one operation, no text, sent with the visitor's token, so a signed-in refetch never depends on a text type. It lives with `PageCv` (web RULES "Page layout" 6).
  - Module text types (user 2026-11-12, feature `schema-builder`; renamed 2026-11-15, PS-3): the sign-in text and the module status text are the cms-api single types `module-auth` and `module-status` (GraphQL root fields `moduleAuth`, `moduleStatus`). The query documents select them under the aliases `signInText` and `statusText`.
  - Text field names follow the current `COPY` keys (full list: `DESIGN web-content-api`); English only (Q-WCA11). The committed query documents are the contract the user builds cms-api from; types or fields not served yet fall back to the mocks where WEB-5 allows.
- **PS-2 States** (changed 2026-11-15, Q-PS2b; changed 2026-11-16, Q-PS2a, Q-WEM3, Q-PS2c). The CV data comes from `page-cv-a` alone; `cvCommonText` and `profile` only dress it. `/cv` never answers 404 or 500 for its content (Q-PS2c). `PageCv` decides in this order:
  1. A failed read gets its mock where the mock fallback is on (development and staging, WEB-5), for each of the three queries alone; a single type that answers null too. A collection that answers empty is never mocked (Q-PS2f).
  2. `pageCvAList` has no main CV: it answers empty (no published main `page-cv-a`), or its read failed and no mock filled it (the mock fallback is off: production). The page shows the **no-CV-live state**: HTTP 200, the site header, `cvCommonText.noCvText` (sanitized richtext) or, when `cvCommonText` cannot load, the last-resort no-CV-live text (WEB-3); no CV, no contact card, the app default title and a `noindex` robots tag. A failed read is logged once (WEB-10); an empty list is not an error.
  3. Otherwise the CV. Where the mock fallback is off, a missing `cvCommonText` shows the CV without labels (no section titles, contact labels or refetch-failed text; the page never fails for it), and a missing `profile` shows the CV without the contact card.

  A label the page shows that `cv-common-text` has no field for is left out, as when `cvCommonText` is missing (Q-PS2d). A signed-in visitor's refetch that fails keeps the server-rendered CV and shows the refetch-failed text, when there is one. The error page always, and the not-found page when `notFoundText` cannot load, use the last-resort set (WEB-3). A failed `ModuleStatus` query never hides the status card, which shows the last-resort card words and loads no CV data (criterion 25).
- **PS-3 Content types of the public site** (user 2026-11-15, feature `web-part-queries`). The cms-api content types the web reads, one owner each:
  - `header` (single): the web header (PS-1 `SiteHeader`); restructured 2026-11-19 with its data kept (ADR 0026, migration `0017_header_restructure`).
  - `module-not-found` (single, new 2026-11-19, ADR 0026): the not-found title and description (PS-1 `NotFoundPage`), carried over from `header`.
  - `module-auth` (single, renamed from `module-sign-in`): the sign-in dialog and the account-menu texts (PS-1 `SignIn`).
  - `module-status` (single, renamed from `module-page-status`): the module status texts (PS-1 `ModuleStatus`).
  - `profile` (single): the profile shared by every CV: `name`, `address`, `phone`, `email`, `linkedin`, `github`, `avatar`; `address`, `phone`, `email` and `github` are sensitive (Q5). It replaces `cv-contact` (user 2026-11-15, plan-wpq-leftovers).
  - `cv-common-text` (single; renamed from `page-cv-text` 2026-11-16 by the user, Q-PS2e, a destructive rename under Q-PS7): the labels shared by every CV and `noCvText` (richtext, the no-CV-live text, PS-2). Its field list is the schema file `content/schemas/cv-common-text.json` (user 2026-11-16); how its fields map to the CV labels: Q-PS2d.
  - `page-cv-a` (collection): the main CV (WPQ-7); `experiences.company` and `references.phone` are sensitive (Q5, Q-PS6). `languages` (`language`, `level`) and `references` (`name`, `role`, `phone`) added 2026-11-19 (user; migration `0018_page_cv_languages_references`).
  - Removed with their tables and data, no data carried over (Q-PS7): `cv-page`, `cv-contact`, `resume`, `site-text` (its fields move to `header` and `module-auth`, Q-PS4). Each removal and each rename (a rename is a drop and a create in the content engine) is a destructive content migration, run with `--allow-destructive` only after the user approves it. The smoke seed and the web mocks follow the new types.
- **PS-4 Crawler files** (user 2026-11-16, Q-PS8..Q-PS14). The public site serves three files at its root, each with HTTP 200 and its own content type, never the not-found page. None calls cms-api, so none falls back to a mock (WEB-5).
  - `/robots.txt` (Q-PS13): where `APP_ENV` is `production` (WEB-9), `User-agent: *`, `Allow: /`, `Disallow: /api/`; on any other stack `User-agent: *`, `Disallow: /`, so a development or staging site is never indexed. Always a `Sitemap:` line with the absolute URL of `/sitemap.xml`. Next.js writes the field name as `User-Agent:`; accepted, as field names are read case-insensitively (RFC 9309, Q-PS15).
  - `/sitemap.xml`: the public pages `/` and `/status` only (Q-PS10); `/cv` is not listed. No sign-in step, BFF route (`/api/...`), not-found or error page is ever listed. The paths are one static list in web config: no cms-api call and no `lastmod` (Q-PS11); a new public page in the sitemap is one entry in that list. URLs are absolute on `WEB_ORIGIN`, no new env key (Q-PS9).
  - `/favicon.ico`: a simple letter mark of the app name in palette A, designed by the planner (`DESIGN favicon`) and built as a static asset (Q-PS12).
  - Cache and CSP (Q-PS14): `robots.txt` and `sitemap.xml` are built per request (they read the runtime `WEB_ORIGIN` and `APP_ENV`) and answer `Cache-Control: public, max-age=3600`; `favicon.ico` keeps the Next.js static file caching. All three are skipped by the proxy matcher, so they carry no per-request nonce CSP, and keep the static security headers of `next.config.ts` (D17). The matcher change is checked on the full stack (tier 3).
  - The admin host (`admin.<domain>`, cms-admin) serves its own `/robots.txt` with `User-agent: *`, `Disallow: /` on every stack (Q-PS13).

## Acceptance

Global success criteria of this flow ([ACCEPTANCE.md](../../global/ACCEPTANCE.md)): 14, 19, 21, 25, 28.

## Decisions

**D18 GraphQL read API.** Details and schema contract: `docs/modules/graphql.md`, ADR 0003. In v1 by user decision; Q-G1..Q-G7 answered by the user 2026-10-21 as recommended (§14).

- `POST /api/v1/graphql`, queries and document reads only (no mutations, subscriptions, batching, GET or persisted queries). cms-admin stays on REST.
- Schema generated by a pure function from the content definitions: object type per content type and component, offset paging `page`/`pageSize` + `meta { page, pageSize, total }`, typed filter inputs with the REST operator sets and limits, sort ≤ 3 keys. Fails on any name clash; the printed SDL is committed (`content/schema.graphql`) and checked.
- **Authz is the REST read path, not a copy:** `DocumentAuthGuard` (anonymous, JWT, API token per D5), then root resolvers call `DocumentsQueryService` unchanged (read + draft rule, row conditions, projection, `QueryGuard` → `FIELD_NOT_READABLE`, `RecordSerializer`, media embed). Nested fields only read the serialized record; no other data path (architecture test). An unreadable content type fails validation exactly like an unknown field (hidden = unknown).
- **Limits** (named constants): body 32 KiB, 2 000 parser tokens, depth 8, 5 root fields per operation (aliases count), 500 field nodes; the anonymous document read throttle counts each request once. No weighted cost (DB work per root field is fixed).
- **Production:** introspection off, "Did you mean" suggestions stripped; no playground in any environment. Responses `Cache-Control: no-store`.
- **Errors:** `{ data?, errors: [{ message, path?, locations?, extensions: { code, details?, requestId } }] }`; `code` reuses REST codes plus `GRAPHQL_PARSE_FAILED`, `GRAPHQL_VALIDATION_FAILED`, `GRAPHQL_LIMIT_EXCEEDED`; HTTP 400 for parse/validation/limit errors, 200 once executed; failures before GraphQL (401, 413, 415, 429) keep the REST error shape. Never echo submitted values or log variables.

| # | Question | Recommendation |
|---|---|---|
| Q5 | Which fields in `cv-page.json` are sensitive (masked for `public`/`reviewer` by default)? Candidates: `reference.phone`, any salary fields. | `references.phone` and `experiences.company` (user 2026-11-05) |
| Q-G1 | GraphQL dependency | `graphql` (graphql-js, current stable, exact pin) in cms-api only, in-house handler; no Apollo/Yoga/`@nestjs/graphql` |
| Q-G2 | GraphQL scope | Document reads only, queries only; admin stays on REST |
| Q-G3 | GraphQL pagination | Offset, same as REST (Q10); cursors later if needed |
| Q-G4 | GraphQL limits | Body 32 KiB, 2 000 tokens, depth 8, 5 root fields, 500 field nodes |
| Q-G5 | Introspection in production | Off for everyone; tooling uses the committed SDL |
| Q-G6 | Web GraphQL client | No client library (fetch on server, Axios in browser); `graphql` as a web devDependency for the SDL contract test |
| Q-G7 | Which cv-page the web shows (it is a collection) | The published one with `isMain = true`, newest `updatedAt` if several; none → empty state (since 2026-11-15: on `page-cv-a`, none → 404; since 2026-11-16: none → the no-CV-live state, PS-2, Q-PS2c) |
| Q-PS2a | `/cv` when `pageCvText` is not published (user 2026-11-16: `page-cv-text` only holds text reused by `page-cv-a`, so it never makes `/cv` fail) | Where the mocks are on, its mock (WEB-5); where they are off, the CV without labels; with no main `page-cv-a`, 404 first (PS-2) |
| Q-PS2b | `/cv` with no data (user 2026-11-15: "PageCv returns 404 when there is no data"; user 2026-11-16: a failed read with no mock is a 500) | No published main `page-cv-a` → 404 with the root last-resort not-found text, checked before the text; a failed `pageCvAList` read with no mock → the error page; a null `profile` with the mocks off → the CV without the contact card (superseded 2026-11-16 by Q-PS2c) |
| Q-PS2c | `/cv` with no main CV or a failed read (user 2026-11-16: "if status 200, no error and the list is empty, show the status text no cv live; if there is data, show it; if there is an error, show no cv live; it must not return a 500"; confirmed 2026-11-16: a query error still gets its mock where the mocks are on) | Mocks on: a failed read gets its mock (WEB-5). An empty list, or a failed read with no mock (production): the no-CV-live state, HTTP 200 with `noindex` (status and robots tag: planner 2026-11-16, confirmed when the user approves this draft). Never 404 or 500 (PS-2) |
| Q-PS2d | CV labels that `cv-common-text` has no field for (planner 2026-11-16; confirmed when the user approves this draft) | Left out, as when the text is missing (PS-2 item 3); its fields with no CV data to label (`achievements`, `languages`, `reference`, `adminLink`) are not read until `page-cv-a` has that data. Changed 2026-11-19 (user): `achievements`, `languages`, `reference`, `webLink`, `projectLink` and the new `phone` are read; `adminLink` stays unread |
| Q-PS2e | Queries of `/cv` (user 2026-11-16: "split the page-cv-a + profile + cv-common-text query into three separate queries") | `PageCvA`, `Profile`, `CvCommonText` (PS-1); `page-cv-text` is renamed `cv-common-text` |
| Q-PS2f | Mock keys and the empty list of `/cv` (user 2026-11-16, verbatim: "Page-CV-A: - split 3 query: profile, cv-common-text, page-cv-a - mock key: + profile + cv-common-text + page-cv-a - If page-cv-a => empty array => show noCVText"; the fetch layers of the same request: web WEB-1, Q-WFL1) | Mock keys `page-cv-a`, `profile`, `cv-common-text`, one per query; an empty `pageCvAList` is the no-CV-live state with `noCvText` (PS-2 item 2), never mocked |
| Q-PS4 | Where the `site-text` fields go (user 2026-11-15: "merge site-text into header.json and module-auth.json"; the split planner 2026-11-15, confirmed when the user approves this draft) | `header`: `navLabel`, `navCvLink`, `notFoundTitle`, `notFoundDescription`; `module-auth`: `openCms`, `signedInAs`, `signOutFailed`. Changed 2026-11-19 (user, ADR 0026): `navCvLink` became the first `navs` entry, the not-found texts moved to `module-not-found`, `navLabel` was discarded |
| Q-PS5 | `/status` on web (user 2026-11-15: module status "used on / and /status"; confirmed when the user approves this draft) | A `/status` page (`PageStatus`) shows the same module status as `/`; criterion 25 and this flow's RULES change with it |
| Q-PS6 | Sensitive fields of `page-cv-a` (planner 2026-11-15, Q5 carried over; confirmed when the user approves this draft) | `experiences.company`, as on `cv-page`; changed 2026-11-19 (user): `page-cv-a` gets `references`, whose `phone` is sensitive as on `cv-page` |
| Q-PS7 | Data of the removed and renamed types (planner 2026-11-15; confirmed when the user approves this draft) | Not carried over: the smoke and dev stacks seed again from the web mocks; the content is entered again in cms-admin where it is needed |
| Q-PS8 | Crawler files (user 2026-11-16, verbatim: "Serve all three: robots.txt, sitemap.xml and favicon.ico. Sitemap: public pages only, no sign-in pages.") | PS-4 |
| Q-PS9 | Site origin of the absolute sitemap URLs (user 2026-11-16) | `WEB_ORIGIN`, no new env key (PS-4) |
| Q-PS10 | Pages the sitemap lists (user 2026-11-16: "only `/` and `/status`"; the web has no sign-in page, sign-in is a dialog) | `/` and `/status`; `/cv` is not listed (PS-4) |
| Q-PS11 | Static page list or built from content (user 2026-11-16) | A static list of public paths in web config; no cms-api call, no `lastmod` (PS-4) |
| Q-PS12 | The favicon (no asset in `apps/web/public`; user 2026-11-16) | A simple letter mark of the app name in palette A, designed by the planner (`DESIGN favicon`), then built (PS-4) |
| Q-PS13 | Crawler rules (user 2026-11-16, as recommended) | Production: `User-agent: *`, `Allow: /`, `Disallow: /api/`; other stacks: `Disallow: /`; the cms-admin host serves its own `robots.txt` with `Disallow: /` (PS-4) |
| Q-PS14 | Cache and CSP of the three files (user 2026-11-16, as recommended) | `robots.txt` and `sitemap.xml` built per request with `Cache-Control: public, max-age=3600`; `favicon.ico` static caching; all three skipped by the proxy matcher (no nonce CSP), checked at tier 3 (PS-4) |
| Q-PS15 | Field-name case of the web `robots.txt` (user 2026-11-16, Q-CRF2 of PLAN crawler-files) | Next.js's `User-Agent:` is an accepted difference from the `User-agent:` written above; the admin host's static file keeps `User-agent:` (PS-4) |

## Out of scope

GraphQL mutations, subscriptions and non-document reads ([out of scope](../../../SPEC.md)).

## Open questions

None.
