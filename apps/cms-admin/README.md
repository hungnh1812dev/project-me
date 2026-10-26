# @abyss/cms-admin

Admin console. React 19 + Vite, served by nginx at `admin.<domain>`; it calls the API cross-origin (CORS with credentials, `ADMIN_ORIGIN` in cms-api).

So far: sign-in (T11) and, behind it, a status page that calls
`GET /api/v1/health/live`.

## Auth (T11, D14)

- **Session state**: Redux Toolkit `authSlice` (`src/features/auth/auth.slice.ts`):
  `status` (`unknown` until the start-up refresh settles, then
  `authenticated` / `anonymous`), the access token and the `/me` user. The
  access token lives **in memory only**: never in localStorage,
  sessionStorage or JS cookies. The Redux DevTools hook is off in production
  builds. The refresh token is the API's HttpOnly `__Secure-abyss_rt` cookie,
  which JS never sees.
- **Feature facades**: every feature that another feature or `app/` uses has an
  `index.ts` with named exports only. Features import each other only through
  that `index.ts`, never a deep path, and only downward in the SPEC §2 order
  auth < security < content-types < access < media < content, reviewer
  (`content-types` and `status` import no feature). ESLint
  (`eslint.config.mjs`, `FEATURE_TIERS`) enforces both; test files may go deep
  for `vi.mock`. `src/FeatureTiers.architecture.test.ts` pins each facade's export list and
  checks every cross-feature import targets an `index.ts`.
- **Auth facade**: besides `useCurrentUser`, `useSession` and the `Session`
  type, it shares `useEmailCode` and the password form pieces
  (`newPasswordShape`, `passwordsMatch`, `PASSWORDS_MATCH_ISSUE`) with
  `security`. `src/features/auth/app-wiring.ts` (`createSession`,
  `createAuthApi`, `authReducer`, `accessTokenOf`, interceptor and cross-tab
  helpers) is for `src/app/**` only; ESLint blocks `app/**` imports from
  features and lib, and features imports from lib.
- **Session lifecycle**: `src/features/auth/session.ts` (`restore`, `signIn`,
  `signOut`, `expire`), wired in `src/app/AppServices.setup.ts`. Every refresh goes
  through one single-flight call. The cookie rotates on use, so two parallel
  refreshes would look like token reuse and revoke the session.
- **Across tabs** (T11a): `src/features/auth/cross-tab-refresh.ts`. Tabs take turns
  under the Web Lock `abyss-admin:refresh`; the tab that refreshes posts the
  new access token on the BroadcastChannel `abyss-admin:session`, and a tab
  that waited uses it instead of sending its own refresh. If the message is
  late, the waiting tab refreshes with the already rotated cookie (a normal
  rotation). Without Web Locks each tab refreshes alone and cms-api's 10 s
  grace window for a just-rotated token keeps the session alive. The token
  only travels between same-origin tabs in memory, never into storage.
- **Start-up**: `main.tsx` calls `session.restore()` once, outside React. Until
  it settles, protected routes show "Restoring your session" instead of the
  login page.
- **Interceptor**: `src/features/auth/auth-interceptor.ts` adds `Authorization: Bearer`.
  On a 401 from a protected call it refreshes once, and concurrent 401s wait
  for that same refresh. It then retries each call once. If the refresh fails,
  or a retried call gets 401 again, the session ends and the router shows
  `/login`. Requests flagged `skipAuthRefresh` (login, refresh, logout) are
  never retried.
- **Login errors** are generic (`login-error.ts`): incorrect credentials (any
  4xx), rate limited (429; uses `Retry-After` when cms-api exposes it via CORS,
  otherwise a generic wait message), network, unexpected.
- **2FA (T13)**: a `requires2FA` login answer opens `TwoFactorModal` (kit
  `Dialog` via `src/components/Modal.tsx`: focus trap, Esc closes, an outside
  click does not). The temp
  token stays in component state only. TOTP accounts type the app code;
  email accounts get the code sent once on open (`use-email-code.ts`, resend
  blocked for the 429 `Retry-After`) and a warning that TOTP is safer. A dead
  temp token (5 wrong codes or 300 s) closes the dialog with a notice.
- **Security settings** (`src/features/security`, `/settings/security`,
  linked as "Security" in the side menu's user block): 2FA status, TOTP setup (QR drawn
  client-side with `qrcode.react` from the `otpauth://` URI, plus the
  grouped manual key), email codes, turn off, all confirmed with code +
  current password in dialogs; change password, which ends every session:
  `session.expire('password-changed')` and the sign-in page shows why
  (`auth.endNotice`). Re-auth failures come back as 403, so the interceptor
  never treats them as an expired session.
- **Access (T18)** (`src/features/access`): `/accounts` (paged list, invite
  dialog, disable with a named confirmation, Enable and Resend invite without
  confirmation (T18a), shown only on manageable rows and with `accounts:update` /
  `accounts:create`), `/roles` and `/roles/:roleId`
  (permission matrix: subjects x actions; content rows open readable /
  writable field pickers fed by `GET /content-types`, sensitive fields
  flagged, and a collapsed "Advanced: row conditions" JSON textarea that the
  server validates). Saving sends the whole permission set (`PUT
/roles/:id/permissions`); 400 issues and `PERMISSION_NOT_HELD` indexes are
  mapped back to matrix rows. Actions are hidden from the caller's own role
  rows in `GET /roles` (`caller-access.ts`; owner = all; Users / Roles and permissions nav
  links hidden when not readable). This is only a hint: cms-api enforces
  every rule and its answers (403, 404, 409) are handled in the UI. Dialogs
  use the form-commons Radix `Dialog`; `components/Modal.tsx` (2FA) wraps it
  and ignores outside clicks and focus. A lint rule forbids `<dialog`.
- **API tokens (T19)** (`/api-tokens`, `ApiTokensPage.tsx`): paged list
  (name + token prefix, access summary, derived status, expiry, last used;
  "Created by" appears when the list holds other accounts' tokens). Create
  and Edit share `TokenFormDialog` (name, optional expiry date = end of that
  day in the user's time zone, a content-only permission grid with field
  pickers). Creating switches the same dialog to `TokenReveal`: the raw token
  is shown once, with Copy, and can only be closed with "I have copied it"
  (no Esc or outside click). It lives only in that component's state
  (the create mutation has `gcTime: 0`) and is never in the list or any
  cache. Edit sends only the changed fields (`name`, `scope`, `expiresAt`);
  no change, no request. Revoke asks for a named confirmation. Create needs
  `api_tokens:create`; Edit and Revoke need `api_tokens:update` and are
  hidden on revoked tokens, and Edit is also hidden on expired ones (a 409
  `API_TOKEN_EXPIRED` on save closes the dialog with a notice and refreshes
  the list); the nav link needs `api_tokens:read`. Grid cells
  the caller's role does not hold are disabled (hint only); a 403
  `API_TOKEN_SCOPE_NOT_HELD` marks the refused cells by `details.indexes`.
- **Dynamic document form (T23)** (`src/features/content`):
  `/content/:slug/new` and `/content/:slug/:documentId` (`DocumentEditPage`;
  no list or nav link until T34). The form is built from
  `GET /content-types/:slug` (`field-tree.ts` rebuilds the tree from the flat
  path list) and the draft from `GET /documents/:slug/:id?status=draft`.
  `DynamicFormRenderer` maps each field type to a form-commons input through
  `field-registry.tsx` (string, text, integer, decimal, boolean, date,
  datetime, json). `ComponentList` handles component fields (add, remove,
  reorder; a non-repeatable component holds one item) and nests to the API's
  depth limit; each item keeps its `componentUid` in form state
  (`ITEM_UID_KEY`). Masked fields (`_maskedFields`) show "Protected (***)",
  read-only, and are never sent. Richtext uses the Tiptap `RichtextInput` (sent as HTML,
  blank = null). Media fields (T29, `features/media/MediaField.tsx`) hold the embedded file
  the API returns and send only its uuid (null detaches); the field offers
  the library picker (`MediaPickerDialog`, needs `media:read`) and upload
  (needs `media:create`).
  Media library (T29): `/media` (`features/media/`) lists files with upload,
  alt text edit (PATCH, blank clears) and delete behind a confirm; a file
  still attached to a document keeps the dialog open with the `MEDIA_IN_USE`
  reason. Shown in the nav for roles with `media:read`; buttons follow the
  `media` create/update/delete permissions.
  Create sends every filled field; save on an existing draft sends only the
  top-level fields and component lists that changed, plus `version`
  (`document-form.ts`). A 409 opens the conflict merge modal (T25, below);
  a 400 `DOCUMENT_INVALID` shows the server's message. `required` is not in
  the content-types API, so required marks and errors come from the server.
- **Conflict merge (T25)** (`ConflictMergeModal`, `merge.reducer.ts`,
  `merge.tree.ts`, `merge.describe.ts`): a 409 `DOCUMENT_VERSION_CONFLICT` on
  a draft save opens a modal listing the server's `diff` as `DiffViewerBlock` cards (local to
  `features/content`; saved vs your version; default = keep yours; "Keep
  all of mine" / "Take all saved"). Entries of masked fields (the 409's and
  the form's `_maskedFields`) are dropped before display and never sent. Save
  PUTs only the client choices (changed values; a touched component list is
  sent whole, items named by `componentUid`, partial values) with the 409's
  `currentVersion`; all-saved just reloads. A second 409 re-diffs inside the
  modal. If the role cannot read the row, or only masked fields differ, the
  page keeps the reload alert only.
- **Presence (T26)** (`PresenceBanner`): on an existing document, a React Query
  heartbeat `POST /documents/:slug/:id/presence` every 20 s
  (`PRESENCE_HEARTBEAT_MS`) while the page is open; it stops on unmount. The
  response includes the caller, who is filtered out by account id. Other
  editors show as an info banner; a failed heartbeat (403, 404, network)
  hides the banner.
- **Collection list and bulk (T35)** (`CollectionListPage`, `BulkCreateDialog`,
  `BulkDeleteDialog`, `bulk.ts`): `/content/:slug` lists a collection (drafts
  for draft-and-publish types, `GET /documents/:slug?status=draft`, 20 per
  page) in a form-commons `SortableSheet`: up to three root scalar columns of
  the type plus Updated, server-side sort (default `-updatedAt`), paging.
  Rows are selectable when the role holds `publish`, `unpublish` or `delete`
  on the type (or `*`); the bar offers Publish / Unpublish / Delete (delete
  asks first and names the count). Actions run non-atomic (`POST
/documents/:slug/bulk/<action>`, publish sends each row's `version` as
  `expectedVersion`); the page shows "Published 4 of 5" with a reason per failed
  document and keeps those rows selected. Selection covers the current page only
  (20 < the 50-item limit) and resets on page or sort change. "Import
  documents" (needs `create`) takes a JSON array of up to 50 document trees
  (`{ values, components }`), checked client-side (valid JSON, array, 1-50
  objects) and then per item by the server. Default is non-atomic: created
  items are removed from the text so a retry cannot duplicate them, and each
  failed item is listed by position; "All or nothing" sends `atomic: true` and
  shows the one failing item. Single types show an explanation instead of a
  list. There is no nav link yet; open the route directly.
- **Owner setup** (OS2, `/setup`): public page, reachable only while
  `GET /setup/status` says `open` (else it redirects to `/login`). Fields: setup
  token (`OWNER_SETUP_TOKEN` of cms-api, password type, kept in form state only,
  never in the URL, storage or store), email, optional display name, password and
  a client-side repeat. 401 marks the token field, 400 the named fields, 409 the
  email, 404 returns to `/login` ("Setup is already complete"), 429 shows the wait
  time. Success clears the form and goes to `/login` with a notice and the email
  prefilled. The login page shows a "no owner yet" notice with a link to `/setup`
  while the status is open (nothing when closed or when the call fails).
- **Routes** (`src/config/App.routes.ts`): `/login`, `/setup`, `/reset-password`,
  `/set-password`, and `/`, `/settings/security`, `/accounts`, `/roles`,
  `/roles/:roleId`, `/api-tokens`, `/content/:slug`, `/content/:slug/new`,
  `/content/:slug/:documentId` behind `ProtectedRoute` + `AppShell` (side menu from `md` up, top bar with a
  Menu button and a sheet below; sections from `lib/NavSections.constants.ts`, empty
  sections hidden; user block with "Security" and "Sign out" at the bottom;
  `app/SideMenu.tsx`, `app/MobileMenu.tsx`).
- **Feature registry** (`src/features/registry.ts`): each feature folder has a
  `feature.ts` with its `routes`, optional `navItems` (label, path, permission
  subject and action) and optional `apiServices` (`defineApiService(createXApi,
XApiProvider)`). `app/AppRoutes.setup.tsx` and `AppShell` iterate the registry;
  nav order is registry order. A feature whose links depend on loaded data
  adds `useNavItems`, which returns `{ items, isLoading, hasFailed, retry }` so the menu can show skeleton rows or a retry line (`contentFeature.useNavItems` lists one link per content
  type the caller may read, under `singleTypes` or `collectionTypes` by kind;
  `/content/:slug` of a single type redirects to its one document, or to the
  create form when none exists). `app/AppServices.setup.ts` builds each feature API
  from the registry and `AppProviders` nests the providers inside the session
  provider. Routes are protected unless listed in
  `PUBLIC_ROUTE_PATHS` (`features/auth/feature.ts`, the four auth pages). A new
  feature is one folder with `feature.ts` plus one line in the registry.

End-to-end coverage lives in [`apps/e2e`](../e2e/README.md).

## Reviewer access (T32)

- `/reviewer` (nav "Reviewers", needs `reviewer_settings:read`; owner by
  default): the on/off switch (`PUT /reviewer/settings`, needs `update`;
  switching off asks first because it ends every live reviewer session) and
  the log of sessions (`GET /reviewer/sessions`: visitor role, purposes,
  notes, browser, start, active/ended). Notes and browser strings come from
  visitors and are rendered as text only; the IP is never shown.
- Reviewer mode: an account whose role is `reviewer` sees a read-only banner,
  no Security link and no write controls (the document form is disabled and
  has no Save). This is a hint only; cms-api answers 403 to every write.
- The reviewer session is started on the public site (apps/web). Its token is
  kept in that page's memory with no refresh cookie, so the admin console has
  no way to continue it yet; the banner covers a reviewer token that reaches
  the console some other way.

## Run

```bash
cp .env.example .env.local     # then adjust
pnpm --filter @abyss/cms-admin dev       # http://localhost:5173 (DEV_SERVER_PORT)
```

`@abyss/form-commons` is consumed from its `dist/`, so build it once first
(`pnpm build` at the root does this through Turborepo's `^build`).

## Config

- `src/config/App.env.ts` is the only module that reads `import.meta.env`. Every
  key is documented in [`.env.example`](.env.example). `VITE_*` values are
  baked in at build time, so they are public: never put secrets there.
- `src/config/Api.endpoints.ts` is the single map of API paths.
- `src/config/Copy.constants.ts` re-exports `COPY`, the user-facing text
  until an i18n module exists. Sections live in `src/config/copy/*.copy.ts`
  (shared text and nav labels in `common.copy.ts`) and are joined in
  `copy/index.ts`; only that folder imports a section file (ESLint).
- `src/config/` keeps only cross-feature constants (`Http.constants`,
  `Auth.constants`, `App.routes`). A feature's own constants live in
  `src/features/<name>/<name>.constants.ts`; other code reads them through
  that feature's `index.ts` (ESLint forbids importing another feature's
  constants file).
- `src/lib/Api.client.ts` is the Axios instance. It strips trailing slashes
  from every request path (`src/config/StripTrailingSlashes.rules.ts`, SPEC §6), so no proxy can answer with a redirect.

Styling: Tailwind v4 with the form-commons theme (`src/styles/app.css`).
Components use semantic tokens only (`bg-card`, `text-muted-foreground`).

## Docker

```bash
docker build -f apps/cms-admin/Dockerfile --build-arg VITE_API_BASE_URL=... -t abyss-cms-admin .
```

Multi-stage: `turbo prune`, build (form-commons first), then the static files
on `nginx-unprivileged` (non-root, port 8080). `nginx.conf` sets
`absolute_redirect off; port_in_redirect off;` so nginx never redirects to its
internal host or port behind Traefik, and falls back to `index.html` for client
routes. The build fails without `VITE_API_BASE_URL`.

## Scripts

| Script      | What it does                                                                          |
| ----------- | ------------------------------------------------------------------------------------- |
| `dev`       | Vite dev server                                                                       |
| `build`     | Production bundle in `dist/`                                                          |
| `test`      | Vitest + Testing Library (jsdom)                                                      |
| `lint`      | Oxlint (base-config + react, jsx-a11y, vitest) then ESLint (base-config, react-hooks) |
| `typecheck` | `tsc --noEmit`                                                                        |

## Security headers (SPEC D17, T36)

nginx sends the CSP, HSTS, `nosniff` and `Referrer-Policy` on every response
(every location includes `/etc/nginx/conf.d/security-headers.inc`, rendered at
container start by `nginx/15-security-headers.sh` from
`nginx/security-headers.inc.template`). The CSP is
`script-src 'self'`, `style-src 'self' 'nonce-<$request_id>'` + `style-src-attr 'unsafe-inline'`,
`img-src 'self' data: blob:` + Cloudinary, `frame-ancestors 'none'`.
`connect-src` is `'self'` plus the API **origin** (a CSP host-source with a path
matches that exact URL only): the origin of the `VITE_API_BASE_URL` the image
was built with, or the runtime env `CSP_CONNECT_SRC` (space-separated origins)
when set.

The nonce exists because Radix dialogs inject a scroll-lock `<style>` whose
content depends on the measured scrollbar width, so a fixed sha256 hash would
differ per OS/browser. nginx uses `$request_id` (128 random bits) as the nonce
and adds `<meta name="csp-nonce">` to the HTML shell (`sub_filter`);
`src/main.tsx` hands it to react-remove-scroll-bar through `get-nonce`.
