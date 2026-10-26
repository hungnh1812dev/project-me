# ADR 0008: File naming rule `<use><PascalName>[.<function>].<ext>`, kebab-case folders

- Status: accepted 2026-10-25 (Q-FN1..Q-FN6); revision accepted 2026-10-26 (user decision on case, then user answers Q-FN7..Q-FN11).
- Date: 2026-10-25, revised 2026-10-26
- Amends: SPEC §5 "Naming rules" (SPEC §5 now holds the function-word table; this ADR records why and how)

## Context

User rule (2026-10-25): file names follow `<use (for react hook)><Pascal Name>.<function>.<ext>`, `<function>` from `setup | module | query | client | service | ...`. FN1 (0b03efe) added guards to cms-api and base-config with two kebab-case shapes still allowed (`*.architecture.spec.ts` topic names and any `*.config.ts`), and React components kept `PascalName.tsx` with no function word (Q-FN3).

User decision (2026-10-26): one naming format across the project. Folders are kebab-case. Files are PascalCase; React hook files add the `use` prefix. User answers the same day: a function word is added only when a file needs one, otherwise the file is `PascalName.<ext>`, components included (Q-FN7); the planner defines "needed" (below). Today the repo mixes both: cms-api 155 of 474 TypeScript files start lower-case, cms-admin 166 of 241, web 66 of 80, e2e 54 of 54, form-commons 49 of 81 (plus 15 PascalCase component folders), base-config 7 of 7. The CR refactor that was meant to carry the cms-api renames (Q-FN2) is closed, so the rest needs its own tasks.

## Decision

### Shape

- Folders: `kebab-case` (`content-engine/`, `field-types/`, `bulk-action-bar/`). Framework folder syntax is kept (Next.js `[param]`, `[...param]`, `(group)`, `_private`, `@slot`).
- Files: `<PascalName>.<function>.<ext>` when the file needs a word (test below): `AccessPolicy.service.ts`, `Identity.module.ts`, `Turnstile.client.ts`; otherwise `<PascalName>.<ext>`: `LoginPage.tsx`, `Button.tsx`.
- React hooks: `use<PascalName>.<function>.<ext>`, and only the hook words take the prefix: `useSetupStatus.query.ts`, `useCurrentUser.state.ts`, `useTokenSubmit.mutation.ts`, `useClampedPage.state.ts`. A hook word without `use`, or `use` with another word, fails.
- Tests append the package's test suffix to the full name: `AccessPolicy.service.spec.ts` (cms-api, e2e), `useSetupStatus.query.test.ts` (cms-admin, web, form-commons, base-config). One package, one test suffix (e2e may keep `.test.ts` for its non-Playwright unit tests).
- Tests of one file split by scenario add one lower-case variant right before the test suffix (Q-FN8): `AccountMenu.login.test.tsx`, `Auth.service.refresh.spec.ts`. The variant is never a function word and appears only on test files.
- `<PascalName>` names the thing, not the layer: `Account`, `AccessPolicy`, `MediaLibrary`. One file, at most one function word.
- `<PascalName>` does not repeat its own function word: `Security.errors.ts`, not `SecurityError.errors.ts`; `Domain.errors.ts`, not `DomainError.errors.ts` (FN-ad-3, below). Exported identifiers keep their names (`SecurityError`, `toSecurityError`).
- `<ext>`: `.ts`, `.tsx`. Non-TypeScript files (CSS, JSON schemas, shell scripts, Markdown) are out of scope (Q-FN1).

### When a file needs a function word

Ask in this order; the first match decides.

1. **Hook.** The file exports one React hook: `use<PascalName>.<query | mutation | state>.<ext>`. The word is always needed (user rule).
2. **Several hooks.** The file holds one feature's TanStack Query keys and hooks: `<Feature>.queries.ts`, no `use` prefix (Q-FN11).
3. **React component.** The file exports one React component (page, dialog, layout piece, kit control): no word, `<ComponentName>.tsx`, and the file name equals the component name (`LoginPage.tsx`, `AccountRowActions.tsx`, `Button.tsx`). There is no component row in the table on purpose.
4. **A row fits.** A row in the SPEC §5 table describes what the file holds (wiring -> `setup`, one feature's HTTP calls -> `api`, pure functions -> `rules`, constants -> `constants`, a port -> `port`, ...): that word is needed. The word is what tools, guards and reviewers select the file by (Nest roles, layer rules, ESLint and test globs such as `*.copy.ts`, `*.queries.ts`, `*.constants.ts`) and it keeps same-named files in one folder apart (`Access.api.ts`, `Access.constants.ts`, `Access.queries.ts`).
5. **No row fits.** `<PascalName>.<ext>`. The builder lists the file in its report; the planner either adds a row (then the file is renamed) or confirms it stays without a word.

In cms-api every role has a row, so cms-api files always carry a word (the guard requires it there). In the other packages the guard accepts both shapes; whether a word was needed is checked in review of the builder's old -> new map against this test.

### Function words

The table is in SPEC §5 (single owner). This revision added the words below (approved as proposed, Q-FN8).

| Word              | Where                             | Holds                                                                      | Example                                                               |
| ----------------- | --------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| `architecture`    | all                               | a structure guard (replaces the kebab-case `*.architecture.spec.ts` shape) | `FileNames.architecture.spec.ts`, `FeatureTiers.architecture.test.ts` |
| `analyzer`        | cms-api `architecture/`           | a source-tree reader used by the structure guards                          | `ImportGraph.analyzer.ts`                                             |
| `integration`     | cms-api `test/integration/`       | an integration suite                                                       | `Auth.integration.spec.ts`                                            |
| `e2e`             | apps/e2e `tests/`                 | a Playwright suite                                                         | `SideMenu.e2e.spec.ts`                                                |
| `contract`        | all                               | values pinned across packages, or the test that pins them                  | `PublicConstants.contract.ts`, `EnvExample.contract.spec.ts`          |
| `snapshot`        | form-commons, cms-admin           | a checked-in snapshot a test compares against                              | `PublicApi.snapshot.ts`                                               |
| `schema`          | cms-api `config/`                 | a Zod schema that is not an HTTP request schema                            | `Env.schema.ts`                                                       |
| `env`             | frontends `config/`; e2e `src/`   | reads and checks env values                                                | `App.env.ts` (admin), `Server.env.ts`, `Browser.env.ts` (web), `E2e.env.ts` |
| `endpoints`       | frontends `config/`; e2e `src/`   | the one API endpoint map                                                   | `Api.endpoints.ts`                                                    |
| `routes`          | all (was cms-api only)            | a route map (cms-api route group, frontend UI routes)                      | `App.routes.ts`                                                       |
| `registry`        | cms-admin                         | a lookup table of variants (features, field editors)                       | `Features.registry.ts`, `Field.registry.tsx`                          |
| `feature`         | cms-admin `features/<f>/`         | the feature's `Feature` contract                                           | `Media.feature.ts`                                                    |
| `queries`         | frontends                         | one feature's TanStack Query keys and hooks, reads and writes (Q-FN11)     | `Access.queries.ts`                                                   |
| `form`            | frontends                         | a form's Zod schema and default values                                     | `Password.form.ts`                                                    |
| `columns`         | cms-admin                         | a table's column definitions                                               | `Account.columns.tsx`                                                 |
| `interceptor`     | cms-admin                         | an Axios interceptor                                                       | `Auth.interceptor.ts`                                                 |
| `reducer`         | cms-admin                         | a pure reducer                                                             | `Merge.reducer.ts`                                                    |
| `styles`          | form-commons                      | class-name maps for one component                                          | `Richtext.styles.ts`                                                  |
| `rules`, `errors` | all (were cms-api `domain/` only) | pure functions; error mapping                                              | `DateFormat.rules.ts`, `Access.errors.ts`                             |
| `fixture`         | tests (widened)                   | test data and test helpers                                                 | `RenderApp.fixture.tsx`, `Mailpit.fixture.ts`                         |

A file whose kind is banned by `code-standards` §4.4 (types-only, re-export-only) gets no name at all: it is merged into its nearest neighbour inside the rename task, and the task's list of merged-away files is approved together with the task (Q-FN10).

### Kept as they are

- Framework-fixed file names inside the scanned folders, listed per package (`FRAMEWORK_FILE_NAMES`): `index.ts`, `main.ts`, `main.tsx`, `*.d.ts` (`vite-env.d.ts`, `next-env.d.ts`), Next.js route files (`page.tsx`, `layout.tsx`, `not-found.tsx`, `error.tsx`, `loading.tsx`), `proxy.ts`, `instrumentation.ts`. A test of one of them appends the suffix (`page.test.tsx`).
- Tool configs at a package root (`vite.config.ts`, `vitest.config.ts`, `eslint.config.mjs`, `prisma.config.ts`, `tsup.config.ts`, `playwright.config.ts`, ...). The guards scan `src/` and `test/` (e2e also `tests/`), so these are not scanned; the blanket `*.config.ts` exemption is removed (it would also pass `richtext.config.ts` inside `src/`).
- Generated code (`src/generated/`) and tool-made folders (Prisma migrations under `prisma/`).
- Exported identifiers do not change in a rename task (`LoginPage` stays `LoginPage` in `LoginPage.tsx`), and neither do package export subpaths (`@abyss/base-config/eslint`) or public package APIs (form-commons public-API snapshot).

### Guard

One guard per package: `FileNames.architecture.spec.ts` (cms-api, in `src/architecture/`, with `FileNames.constants.ts` next to it) or `FileNames.architecture.test.ts` (other packages, under `src/` or `test/`). The guard's own name follows the rule (it was `file-names.architecture.spec.ts`). Each guard checks:

1. every file under the scanned folders against `FRAMEWORK_FILE_NAMES` or the shape `<PascalName>[.<word>][.<variant>.<test suffix>].<ext>`, with `<word>` from the package's `FILE_FUNCTION_WORDS`; `use<PascalName>` only with a word from `HOOK_FUNCTION_WORDS` (`query`, `mutation`, `state`; frontends only), and a hook word only with `use`; the word is required in cms-api and apps/e2e and optional elsewhere (see "When a file needs a function word" and "FN-e2e-1" below);
2. every folder under the scanned folders against `^[a-z][a-z0-9]*(-[a-z0-9]+)*$` or the framework folder shapes;
3. `KNOWN_FILE_NAME_EXCEPTIONS` (and `KNOWN_FOLDER_NAME_EXCEPTIONS` in form-commons only) only shrink; a stale entry fails. When a package's lists are empty its last rename task removes them, so no new exception can be added later without a guard change.

No new dependency.

### Renaming

- Each rename task is one commit: `git mv` plus import-path, glob and pinned-path edits only. No other content change, so `git diff -M --stat` shows the files as renames.
- macOS has a case-insensitive file system: a case-only rename (`clock.module.ts` -> `Clock.module.ts`, `Field/` -> `field/`) goes through a temporary name in two `git mv` steps.
- Before moving, the builder writes the full old -> new map into the unit record, applying the "needed" test. Builders do not invent words; a file that fits no row is named `<PascalName>.<ext>` and listed in the report (step 5).
- Every place that names a file by path changes in the same commit: pinned-path constants, ESLint globs, test-runner globs and setup files, `package.json` scripts and exports, scripts under `scripts/`, Dockerfiles, docs.

### Word choices confirmed by the planner (FN-api-2, 2026-10-26)

Three cms-api platform files fit no row exactly as the table read before (step 5). Each keeps the name it got in e2e3db9; the row is widened instead, so no file moves again.

| File                                        | Holds                                                                                                                                               | Decision                                                                                                                                                                                                                                                                                                                                                                                         |
| ------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `common/rate-limit/ThrottleSubject.port.ts` | the `ThrottleSubjectResolver` interface and its `THROTTLE_SUBJECT_RESOLVER` token; access `http/` implements it, `RateLimitModule.forRoot` binds it | `port` (the row's "Holds" fits exactly). The row's "Where" adds `common/`. Outside `infrastructure/` the `.port.ts` suffix gives no `port` layer role: the file keeps its folder's role (`pipeline`), so only `http/` may import it, which is the intent. Not merged into `RateLimit.module.ts`: a module file stays wiring only, and the guard and access would then import from a module file. |
| `common/time/Clock.service.ts`              | the injectable `Clock` time source that tests replace                                                                                               | `service`, read as "one shared injectable provider outside `modules/`", the same reading `Prisma.service.ts` already has. Not `adapter` (it would suggest `application/` may not use it) and not `port` (it is a class, not an interface). Not merged into `Clock.module.ts`, for the same wiring-only reason.                                                                                   |
| `config/AppConfig.setup.ts`                 | `IAppConfig`, `loadAppConfig` and `ConfigValidationError`: the env parsed once at startup                                                           | `setup`, read as "app config loading". The row's "Holds" adds it. The alternative `AppConfig.env.ts` (the frontends' `env` word) is closer in meaning but renames a file 49 imports name; left to the user (planner report, DESIGN FN-word-choices).                                                                                                                                             |

The `setup` row also covers the test-runner hooks FN-api-4 names: `test/integration/global-setup.ts` -> `SharedPostgresStart.setup.ts`, `global-teardown.ts` -> `SharedPostgresStop.setup.ts`, `jest.setup.ts` -> `Jest.setup.ts`. No file in FN-api-3 needs `port`, `service` or `setup`.

### Confirmed without a word (FN-kit-1, 2026-10-26)

`form-commons/src/components/forms/richtext-input/RichtextToolbar.ts` (step 5) stays `RichtextToolbar.ts`. It holds the `RichtextLabels` type, the toggle table and `buildRichtextToolbar` (editor commands plus `window.prompt`), so no row's "Holds" fits: not `rules` (it has side effects), not `setup` (`Richtext.setup.ts` is the editor's extension wiring), not `registry` (cms-admin only, and the table is private to the builder), not a component (`.ts`, no JSX). No tool, guard or glob selects it and no same-named file sits in its folder, so a word would add nothing; adding a row for one file is not worth a table change. Not merged into `RichtextInput.tsx` (it would pass 270 lines and mix the toolbar model into the component). The FN1b-kit guard accepts it (word optional outside cms-api), so it needs no exception entry.

### Word choices confirmed by the planner (FN-ad-2, 2026-10-26)

Hook word rule made explicit: `query` is a hook that reads server data through TanStack Query (it owns or uses a query key and has loading and error states); a hook that only reads client state, including the Redux store, is `state`, even when that state first came from the server. The SPEC §5 row says so; no new word.

| File (cms-admin `features/auth/`)                                                         | Holds                                                                                                             | Decision                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useAuthSelector.state.ts` (was `auth-hooks.ts`)                                          | `useAuthSelector` (`useSelector.withTypes`) and the `AuthRootState` type                                          | Kept. One hook, so step 1 applies, not step 2: `Auth.queries.ts` would claim the feature's TanStack keys and hooks, and the file has none. It reads the Redux store, so `state`. The type stays with the hook that defines it.                                                                                 |
| `useCurrentUser.state.ts` (was `use-current-user.ts`; built as `useCurrentUser.query.ts`) | `useCurrentUser()`, a synchronous `useAuthSelector(selectCurrentUser)`                                            | Renamed to `state`: it never fetches, has no key and no loading or error state; the `/me` call lives in `Session.ts`. `query` would put it next to `useSetupStatus.query.ts` (a real TanStack hook and a query-key owner) as if it were one.                                                                   |
| `CrossTabRefresh.ts`                                                                      | `createCrossTabRefresh` and `browserCrossTabOptions` (Web Locks and BroadcastChannel), with their option types    | Confirmed without a word (step 5). Not `rules` (it has side effects), not `client` (it calls no outside system; it coordinates tabs around a refresh it is given), not `setup` (it is a factory used by `Session.ts`, not wiring). No tool, guard or glob selects it, and no same-named file is in the folder. |
| `Session.ts`                                                                              | `createSession`, the session lifecycle (restore, sign-in, 2FA, refresh, sign-out, expire), and the `Session` type | Confirmed without a word (step 5). The only close row is `service`, which is cms-api only; widening it to frontends for one file would invite `.service` on many frontend factories, so no row is added. It stays apart from `Session.context.tsx` by that file's word.                                        |

The 30-line floor of `code-standards` §4.4 does not merge a hook file: step 1 requires one hook per `use` file, so `useAuthSelector.state.ts` and `useCurrentUser.state.ts` stay separate files. Rename tasks do not merge other small files either; they only merge types-only and re-export-only files (Q-FN10).

### Word choices confirmed by the planner (FN-ad-3, 2026-10-26)

**`query` versus `state`, sharpened.** What decides is where the hook's data comes from, not whether the hook calls `useQuery` itself. A hook whose data is TanStack Query server data, read with `useQuery` or through a feature's query hook (`useRolesQuery`), and which passes on that query's pending state, is `query`. A hook that reads only local state or the Redux store is `state`. The SPEC §5 row says so.

| File (cms-admin `features/access/`)                 | Holds                                                                              | Decision                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------- | ---------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useCallerAccess.query.ts` (was `caller-access.ts`) | `useCallerAccess()`, its `CallerAccess` type and the pure `callerAccessOf` it uses | Confirmed `query`. Its data is the `GET /roles` answer from the TanStack cache (through `useRolesQuery`), and `isReady` is that query's pending state. This is unlike `useCurrentUser.state.ts`, which reads the Redux store synchronously. It owns no query key, so it stays out of `Access.queries.ts` and out of the ESLint `QUERY_KEY_OWNERS`. The type and the pure helper stay with the one hook that uses them (`code-standards` §4.4), so step 1 still applies. |

**Base name of error files.** Error files are `<Subject>.errors.ts`. `<Subject>` is the feature or module when it has one error file (`Access.errors.ts`, `Media.errors.ts`, `Identity.errors.ts`). When a feature has several, it is the flow (`Login.errors.ts`, `Password.errors.ts`, `Setup.errors.ts`), which sits next to that flow's other files (`Password.api.ts`, `Password.form.ts`, `Setup.api.ts`). It is never `<Thing>Error`, because that repeats the word (rule under "Shape"). This was the pattern the repo already used in cms-api (`Domain.errors.ts`, `BulkItem.errors.ts`) and in `lib/ApiFailure.errors.ts`, and it is the one in the ADR and SPEC examples. FN-ad-3's `Access.errors.ts` and `Media.errors.ts` are kept. Files that move (path edits only, exported names unchanged):

| Old (committed)                                                 | New                  | Task     |
| --------------------------------------------------------------- | -------------------- | -------- |
| cms-admin `features/auth/LoginError.errors.ts` (+ test)         | `Login.errors.ts`    | FN-ad-5  |
| cms-admin `features/auth/PasswordError.errors.ts` (+ test)      | `Password.errors.ts` | FN-ad-5  |
| cms-admin `features/auth/SetupError.errors.ts` (+ test)         | `Setup.errors.ts`    | FN-ad-5  |
| cms-admin `features/security/SecurityError.errors.ts`           | `Security.errors.ts` | FN-ad-5  |
| web `features/reviewer/ReviewerError.errors.ts` (+ test)        | `Reviewer.errors.ts` | FN-web-2 |
| cms-admin `features/content/content-error.ts` (not renamed yet) | `Content.errors.ts`  | FN-ad-4  |

The `use` hook files follow the same rule: the hook word is not repeated in the name (`useLiveHealth.query.ts`, not `useLiveHealthQuery.query.ts`), and the exported hook name is unchanged.

**FN-ad-4 follow-up.** The ESLint `QUERY_KEY_OWNERS` in `apps/cms-admin/eslint.config.mjs` still names `src/features/content/content-queries.ts` explicitly. FN-ad-4 renames that file to `Content.queries.ts`, which the `src/**/*.queries.ts` glob already covers, and deletes the explicit line in the same commit.

### Word choices confirmed by the planner (FN-e2e-1, 2026-10-26)

`apps/e2e` has one layer (`src/` helpers, `tests/` Playwright suites), no `config/` folder and no React. The words below are what the FN1c guard lists.

| File (apps/e2e `src/`)                                                              | Holds                                                                                                                  | Decision                                                                                                                                                                                                                                                                                                                                                                                      |
| ----------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `E2e.env.ts`                                                                        | `e2eEnv`, the only reader of `process.env` in the suite, with its required-key check                                   | Kept. The `env` row's "Holds" fits exactly; its "Where" is widened from frontends `config/` to frontends `config/`; e2e `src/` (SPEC §5). No e2e-only word: a second word for the same job would split one meaning across two names, and `setup` (the cms-api choice for `AppConfig.setup.ts`) means runner hooks in e2e terms (`playwright.config.ts` globals).                                 |
| `AppContracts.contract.ts`                                                          | re-exports of app constants, routes and copy; the only e2e file that imports an app's `src` (ESLint `no-restricted-imports`) | Confirmed `contract` ("values pinned across packages"). It is re-export-only and 22 lines, but a lint layer rule requires it as the single gateway, so the `code-standards` §4.4 exception for "a file a layer rule requires" applies: it is not merged.                                                                                                                                      |
| `RunId.constants.ts` (2 lines), `ContentTypes.constants.ts` (11), `TwoFactorAccount.constants.ts` (7) | `RUN_ID`; the smoke content-type slugs and `editUrlPattern`; `TWO_FACTOR_CHANGED_PASSWORD` (one spec uses it)    | Names confirmed for FN-e2e-1, which stays rename-only (Q-FN10: rename tasks merge only types-only and re-export-only files). They break `code-standards` §4.4 (under 30 lines; five constants files in one layer), so follow-up FN-e2e-2 merges them: `RUN_ID` and the content-type names into `E2e.constants.ts`, `TWO_FACTOR_CHANGED_PASSWORD` into `tests/TwoFactor.e2e.spec.ts`, its only user. |
| `ApiPaths.constants.ts`                                                             | `API_PATHS` and `apiUrl`: the one cms-api path map of the suite                                                        | Renamed `Api.endpoints.ts` in FN-e2e-2. The `endpoints` row ("the API endpoint map") fits better than `constants`, matches the frontends' `Api.endpoints.ts`, and leaves `src/` with one constants file (`E2e.constants.ts`). Its "Where" is widened the same way as `env`.                                                                                                                       |

**e2e guard words (FN1c).** `FILE_FUNCTION_WORDS` for apps/e2e: `e2e`, `contract`, `fixture`, `client`, `constants`, `env`, `endpoints`, `architecture`. No hook words and no `FRAMEWORK_FILE_NAMES` (`playwright.config.ts` sits at the package root, outside the scanned folders). Test suffixes: `.spec.ts` under `tests/` (Playwright), `.test.ts` under `src/` (`node:test`: `Env.contract.test.ts`, `FileNames.architecture.test.ts`). Unlike the other non-cms-api packages, the word is **required** in apps/e2e: every e2e file has a row, all 51 files carry one today, and a word-less helper would be a missing decision rather than a component. Adding a word later is one table row plus one list entry, as for the other packages.

## Module ownership, names, extension path

- **Ownership:** the rule and the function-word table live in SPEC §5; each package's guard owns its `FILE_FUNCTION_WORDS` (cms-api in `src/architecture/FileNames.constants.ts`, the others inside the guard file).
- **Key names:** `FileNames.architecture.spec.ts` / `.test.ts`, `FILE_FUNCTION_WORDS`, `HOOK_FUNCTION_WORDS`, `FRAMEWORK_FILE_NAMES`, `KNOWN_FILE_NAME_EXCEPTIONS`.
- **Extension path:** a new function word is one row in the SPEC §5 table and one entry in the package's `FILE_FUNCTION_WORDS`. A new package copies the guard file and lists its words. A new framework-fixed name is one entry in that package's `FRAMEWORK_FILE_NAMES`.

## Schedule (Q-FN9)

CR is closed and the MF feature-package tasks are not written yet, so the renames run as their own tasks in phase FN, per package, one builder each; packages run in parallel. Existing cms-admin feature files are renamed now (FN-ad-2..FN-ad-4, user answer Q-FN9). MF tasks are planned after FN and move already-named files (folder changes only). Task list: `tasks/todo.md` "Phase FN".

## User answers (2026-10-26)

- **Q-FN7:** a function word only when the file needs one; otherwise `PascalName.<ext>`, components included. The `page` / `component` words are dropped. The planner's "needed" test is the section above.
- **Q-FN8:** the new words and the test-variant segment are approved as proposed.
- **Q-FN9:** existing cms-admin feature files are renamed now (FN-ad-2..FN-ad-4), before the MF tasks.
- **Q-FN10:** types-only and re-export-only files are merged into their nearest neighbour inside the rename task; the deletions are approved together with the task.
- **Q-FN11:** a file holding several TanStack hooks is `<Feature>.queries.ts`, no `use` prefix.
