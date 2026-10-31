# Conventions - frontend (read on demand)

apps/cms-admin, apps/web, packages/form-commons. grep the section you need; cross-cutting facts are in `conventions.md`.

## Testing
- Frontend tests: Vitest + jsdom, `src/**/*.test.tsx`; jsdom needs the ResizeObserver stub and the `<dialog>` polyfill (test/Vitest.setup.ts in form-commons and cms-admin); ProseMirror is driven through `element.editor`. form-commons must be rebuilt (`pnpm --filter @abyss/form-commons build`) before apps see new exports.
- Admin tests use fake handlers keyed "METHOD /path" (`test/FakeApi.fixture.ts`, createTestServices).
- Contract tests read `apps/cms-api/content/public-constants.json` with `readFileSync` from `process.cwd()` (never import it in app code); add a mirror check there when a client copies a new cms-api constant.

## Frontend
- cms-admin: `src/config/App.env.ts` is the only reader of `import.meta.env`; apps/web: `Browser.env.ts` reads literal `process.env.NEXT_PUBLIC_*` only, `Server.env.ts` (`server-only`) validated at start by `instrumentation.ts`.
- All API paths in `src/config/Api.endpoints.ts`; never send trailing slashes; copy: import `COPY` from `src/config/Copy.constants.ts` (no i18n yet); sections are `config/copy/*.copy.ts`, joined in `copy/index.ts`, never imported directly (ESLint); new section = new file plus one line in the index; route paths in `src/config/App.routes.ts`.
- form-commons: tokens in `src/styles/tokens.css` (semantic shadcn names), shadcn via `pnpm --filter @abyss/form-commons exec shadcn add <x>`, pin exactly and restyle to semantic tokens. Dialogs = Radix `Dialog*` (footer `DialogClose` Cancel). `Button` has no default type: give non-submit buttons in forms `type="button"`. Router links: `<Button asChild variant="link">`.
- apps/web `proxy.ts` `config.matcher` must be an inline static literal (Next rejects an imported constant); `next.config.ts` imports must stay import-free files (`security-headers.constants.ts`). cms-admin nginx headers come from `nginx/security-headers.inc.template` (envsubst, `CSP_CONNECT_SRC`); new nginx locations must include `security-headers.inc` (add_header is not inherited).
- apps/web: server content reads go through `lib/Graphql.server.ts` (anonymous, `next.revalidate`), browser ones through `lib/Graphql.client.ts`; richtext is sanitized with `lib/SafeRichtext.rules.ts` (browser) or `SafeRichtext.server.ts` (server, jsdom; never import it from a client file). jsdom has no types: `src/Jsdom.d.ts` declares the used part.
- apps/web CV: richtext is sanitized once where data enters (`loadCvPage` server, `useCvContent` refetch, both via `sanitizeCvRichtext`); components render `dangerouslySetInnerHTML` of clean data only, so any new data path must call it. Masked paths are checked with `isMaskedField`. After touching server sanitizer imports, run `grep -rl jsdom .next/static` (must be empty).
- Local `next build` of apps/web needs `NEXT_PUBLIC_API_BASE_URL` in the shell (agents never read .env.local).

- form-commons: a new input reuses `forms/FieldWiring.setup.ts` and `ui/Control.constants.ts` (internal, `KitBoundaries.architecture.test.ts` guards it); do not write bare class words (e.g. "ring") in kit comments, Tailwind scans sources (R3-16).
- cms-admin: features reach auth only through `features/auth` (`useCurrentUser`, `useSession`, `Session`); `auth/AuthWiring.setup.ts` is `src/app/**` only; no `app/` from features/lib (ESLint boundaries in `eslint.config.mjs`). Auth tests build their store with `AuthStore.fixture.ts`.
- cms-admin: features import each other only via the other's `index.ts`, downward in the SPEC §2 order (`FEATURE_TIERS` in `eslint.config.mjs`); tests may deep-import for `vi.mock`. Architecture test is `src/FeatureTiers.architecture.test.ts` (vitest runs only `*.test.*`).
- cms-admin: shared page helpers live in `components/` (`useRestoreFocus`, `useClampedPage`) and `lib/DateFormat.rules.ts` (no `new Intl.DateTimeFormat` elsewhere); query keys come from `*.queries.ts` / `useSetupStatus.query.ts`, never literal `queryKey` arrays (ESLint `no-restricted-syntax`); the masked-value sentinel is `MASKED_VALUE`.
- cms-admin: feature constants live in `features/<x>/<x>.constants.ts` (R3-12); `config/` keeps env, endpoints, routes, http, auth; shared with copy go to `Http.constants` (limits) or `Auth.constants` (`REVIEWER_ROLE_SLUG`); ESLint bans importing another feature's constants file.
- cms-admin: a feature adds its pages and nav links in `features/<name>/feature.ts` plus one line in `features/registry.ts` (R3-09); a route is protected unless in `PUBLIC_ROUTE_PATHS` (`auth/feature.ts`); the `Feature` type is `lib/FeatureDefinition.tsx`.
- cms-admin: an owner-only feature has no permission subject: its `useNavItems` returns the item only when `useCallerAccess().isOwner` and gates the query with `enabled` (see `features/backups/Backups.queries.ts`); the server stays the authority.
- cms-admin: a feature API is registered with `apiServices: [defineApiService(createXApi, XApiProvider)]` in its `feature.ts` (R3-10); `createAppServices` returns `apiProviders`, no named `xApi` fields.
- apps/web: `config/**` may import pure `lib` helpers but not `lib/Api.client` or features (ESLint, R3-15); error codes sit in the feature's constants file, `TURNSTILE` in `Security.constants`; the reviewer API, query key and `useReviewerEnabled` live in `features/reviewer/Reviewer.queries.ts`.

## User decisions in force
- apps/web: features import each other only through `index.ts`; `session` is below `auth` and `reviewer`, which never import each other; `**/*.fixture.*` only in `*.test.*` (eslint + `src/FeatureTiers.architecture.test.ts`).
