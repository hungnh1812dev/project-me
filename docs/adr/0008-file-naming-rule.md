# ADR 0008: File naming rule `<use><PascalName>[.<function>].<ext>`, kebab-case folders

- Status: accepted 2026-10-25 (Q-FN1..Q-FN6); revision accepted 2026-10-26 (user decision on case, then user answers Q-FN7..Q-FN11); revision 3 accepted 2026-10-26 (open word set, hook words dropped, general rule in the agent layer, one lint rule; see "Revision 3" below, user answers Q-FN12..Q-FN16).
- Date: 2026-10-25, revised 2026-10-26
- Amends: SPEC §5 "Naming rules" (SPEC §5 now holds the function-word table; this ADR records why and how)

## Context

User rule (2026-10-25): file names follow `<use (for react hook)><Pascal Name>.<function>.<ext>`, `<function>` from `setup | module | query | client | service | ...`. FN1 (0b03efe) added guards to cms-api and base-config with two kebab-case shapes still allowed (`*.architecture.spec.ts` topic names and any `*.config.ts`), and React components kept `PascalName.tsx` with no function word (Q-FN3).

User decision (2026-10-26): one naming format across the project. Folders are kebab-case. Files are PascalCase; React hook files add the `use` prefix. User answers the same day: a function word is added only when a file needs one, otherwise the file is `PascalName.<ext>`, components included (Q-FN7); the planner defines "needed" (below). Today the repo mixes both: cms-api 155 of 474 TypeScript files start lower-case, cms-admin 166 of 241, web 66 of 80, e2e 54 of 54, form-commons 49 of 81 (plus 15 PascalCase component folders), base-config 7 of 7. The CR refactor that was meant to carry the cms-api renames (Q-FN2) is closed, so the rest needs its own tasks.

## Decision

### Shape

- Folders: `kebab-case` (`content-engine/`, `field-types/`, `bulk-action-bar/`). Framework folder syntax is kept (Next.js `[param]`, `[...param]`, `(group)`, `_private`, `@slot`).
- Files: `<PascalName>.<function>.<ext>` when the file needs a word (test below): `AccessPolicy.service.ts`, `Identity.module.ts`, `Turnstile.client.ts`; otherwise `<PascalName>.<ext>`: `LoginPage.tsx`, `Button.tsx`.
- React hooks: `use<PascalName>.<ext>` with no hook word (revision 3, Q-FN12): `useSetupStatus.ts`, `useCurrentUser.ts`, `useTokenSubmit.ts`, `useClampedPage.ts`. A `use` file takes a word only when the general rule needs one (a tool or config selects the file by it, or it tells same-named files in one folder apart). Before revision 3 every hook file took `query`, `mutation` or `state`; the tables below keep those names as they were decided, and FN-hook-rename drops the words.
- Tests append the package's test suffix to the full name: `AccessPolicy.service.spec.ts` (cms-api, e2e), `useSetupStatus.test.ts` (cms-admin, web, form-commons, base-config). One package, one test suffix (e2e may keep `.test.ts` for its non-Playwright unit tests).
- Tests of one file split by scenario add one lower-case variant right before the test suffix (Q-FN8): `AccountMenu.login.test.tsx`, `Auth.service.refresh.spec.ts`. The variant is never a function word and appears only on test files.
- `<PascalName>` names the thing, not the layer: `Account`, `AccessPolicy`, `MediaLibrary`. One file, at most one function word.
- `<PascalName>` does not repeat its own function word: `Security.errors.ts`, not `SecurityError.errors.ts`; `Domain.errors.ts`, not `DomainError.errors.ts` (FN-ad-3, below). Exported identifiers keep their names (`SecurityError`, `toSecurityError`).
- `<ext>`: `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs` (revision 3, Q-FN13). Other file types (CSS, JSON schemas, shell scripts, Markdown, images) are out of scope and keep their own conventions (Q-FN1).

### When a file needs a function word

Ask in this order; the first match decides.

1. **Hook.** The file exports one React hook: `use<PascalName>.<ext>`, no word unless step 4's reasons (a tool selects the file by it, or it tells same-named files apart) apply (revision 3, Q-FN12; before it the word `query`, `mutation` or `state` was always required).
2. **Several hooks.** The file holds one feature's TanStack Query keys and hooks: `<Feature>.queries.ts`, no `use` prefix (Q-FN11).
3. **React component.** The file exports one React component (page, dialog, layout piece, kit control): no word, `<ComponentName>.tsx`, and the file name equals the component name (`LoginPage.tsx`, `AccountRowActions.tsx`, `Button.tsx`). There is no component row in the table on purpose.
   (Steps 4 and 5 are revised by "Revision 3": the table is a vocabulary, not an allow-list; in step 5 the builder picks a plain word when a word is needed and none in the table means it.)

4. **A row fits.** A row in the SPEC §5 table describes what the file holds (wiring -> `setup`, one feature's HTTP calls -> `api`, pure functions -> `rules`, constants -> `constants`, a port -> `port`, ...): that word is needed. The word is what tools, guards and reviewers select the file by (Nest roles, layer rules, ESLint and test globs such as `*.copy.ts`, `*.queries.ts`, `*.constants.ts`) and it keeps same-named files in one folder apart (`Access.api.ts`, `Access.constants.ts`, `Access.queries.ts`).
5. **No row fits.** `<PascalName>.<ext>`. The builder lists the file in its report; the planner either adds a row (then the file is renamed) or confirms it stays without a word.

In cms-api every role has a row, so cms-api files always carry a word (the guard requires it there). In the other packages the guard accepts both shapes; whether a word was needed is checked in review of the builder's old -> new map against this test.

### Function words

The table is in SPEC §5 (single owner). This revision added the words below (approved as proposed, Q-FN8).

| Word              | Where                             | Holds                                                                      | Example                                                                     |
| ----------------- | --------------------------------- | -------------------------------------------------------------------------- | --------------------------------------------------------------------------- |
| `architecture`    | all                               | a structure guard (replaces the kebab-case `*.architecture.spec.ts` shape) | `FileNames.architecture.spec.ts`, `FeatureTiers.architecture.test.ts`       |
| `analyzer`        | cms-api `test/architecture/`      | a source-tree reader used by the structure guards                          | `ImportGraph.analyzer.ts`                                                   |
| `integration`     | cms-api `test/integration/`       | an integration suite                                                       | `Auth.integration.spec.ts`                                                  |
| `e2e`             | apps/e2e `tests/`                 | a Playwright suite                                                         | `SideMenu.e2e.spec.ts`                                                      |
| `contract`        | all                               | values pinned across packages, or the test that pins them                  | `PublicConstants.contract.ts`, `EnvExample.contract.spec.ts`                |
| `snapshot`        | form-commons, cms-admin           | a checked-in snapshot a test compares against                              | `PublicApi.snapshot.ts`                                                     |
| `schema`          | cms-api `config/`                 | a Zod schema that is not an HTTP request schema                            | `Env.schema.ts`                                                             |
| `env`             | frontends `config/`; e2e `src/`   | reads and checks env values                                                | `App.env.ts` (admin), `Server.env.ts`, `Browser.env.ts` (web), `E2e.env.ts` |
| `endpoints`       | frontends `config/`; e2e `src/`   | the one API endpoint map                                                   | `Api.endpoints.ts`                                                          |
| `routes`          | all (was cms-api only)            | a route map (cms-api route group, frontend UI routes)                      | `App.routes.ts`                                                             |
| `registry`        | cms-admin                         | a lookup table of variants (features, field editors)                       | `Features.registry.ts`, `Field.registry.tsx`                                |
| `feature`         | cms-admin `features/<f>/`         | the feature's `Feature` contract                                           | `Media.feature.ts`                                                          |
| `queries`         | frontends                         | one feature's TanStack Query keys and hooks, reads and writes (Q-FN11)     | `Access.queries.ts`                                                         |
| `form`            | frontends                         | a form's Zod schema and default values                                     | `Password.form.ts`                                                          |
| `columns`         | cms-admin                         | a table's column definitions                                               | `Account.columns.tsx`                                                       |
| `interceptor`     | cms-admin                         | an Axios interceptor                                                       | `Auth.interceptor.ts`                                                       |
| `reducer`         | cms-admin                         | a pure reducer                                                             | `Merge.reducer.ts`                                                          |
| `styles`          | form-commons                      | class-name maps for one component                                          | `Richtext.styles.ts`                                                        |
| `rules`, `errors` | all (were cms-api `domain/` only) | pure functions; error mapping                                              | `DateFormat.rules.ts`, `Access.errors.ts`                                   |
| `fixture`         | tests (widened)                   | test data and test helpers                                                 | `RenderApp.fixture.tsx`, `Mailpit.fixture.ts`                               |

A file whose kind is banned by `code-standards` §4.4 (types-only, re-export-only) gets no name at all: it is merged into its nearest neighbour inside the rename task, and the task's list of merged-away files is approved together with the task (Q-FN10).

### Kept as they are

- Framework-fixed file names inside the scanned folders, listed per package (`FRAMEWORK_FILE_NAMES`): `index.ts`, `main.ts`, `main.tsx`, `*.d.ts` (`vite-env.d.ts`, `next-env.d.ts`), Next.js route files (`page.tsx`, `layout.tsx`, `not-found.tsx`, `error.tsx`, `loading.tsx`), `proxy.ts`, `instrumentation.ts`. A test of one of them appends the suffix (`page.test.tsx`).
- Tool configs at a package root (`vite.config.ts`, `vitest.config.ts`, `eslint.config.mjs`, `prisma.config.ts`, `tsup.config.ts`, `playwright.config.ts`, ...). The guards scan `src/` and `test/` (e2e also `tests/`), so these are not scanned; the blanket `*.config.ts` exemption is removed (it would also pass `richtext.config.ts` inside `src/`).
- Generated code (`src/generated/`) and tool-made folders (Prisma migrations under `prisma/`).
- Exported identifiers do not change in a rename task (`LoginPage` stays `LoginPage` in `LoginPage.tsx`), and neither do package export subpaths (`@abyss/base-config/eslint`) or public package APIs (form-commons public-API snapshot).

### Guard

Superseded by "Revision 3": the ESLint rule `abyss/file-names` replaces these guards and their word lists (tasks FN-lint-*). The text below describes the guards as built in phase FN.

One guard per package: `FileNames.architecture.spec.ts` (cms-api, in `src/architecture/`, with `FileNames.constants.ts` next to it; both deleted by FN-lint-api, before ARCH-1 moved the rest of that folder to `test/architecture/`) or `FileNames.architecture.test.ts` (other packages, under `src/` or `test/`). The guard's own name follows the rule (it was `file-names.architecture.spec.ts`). Each guard checks:

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

(Superseded by Q-FN12: hook words are dropped, so the `query` / `state` choice below no longer reaches file names; the file decisions stand with the word removed.) Hook word rule made explicit: `query` is a hook that reads server data through TanStack Query (it owns or uses a query key and has loading and error states); a hook that only reads client state, including the Redux store, is `state`, even when that state first came from the server. The SPEC §5 row says so; no new word.

| File (cms-admin `features/auth/`)                                                         | Holds                                                                                                             | Decision                                                                                                                                                                                                                                                                                                       |
| ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `useAuthSelector.state.ts` (was `auth-hooks.ts`)                                          | `useAuthSelector` (`useSelector.withTypes`) and the `AuthRootState` type                                          | Kept. One hook, so step 1 applies, not step 2: `Auth.queries.ts` would claim the feature's TanStack keys and hooks, and the file has none. It reads the Redux store, so `state`. The type stays with the hook that defines it.                                                                                 |
| `useCurrentUser.state.ts` (was `use-current-user.ts`; built as `useCurrentUser.query.ts`) | `useCurrentUser()`, a synchronous `useAuthSelector(selectCurrentUser)`                                            | Renamed to `state`: it never fetches, has no key and no loading or error state; the `/me` call lives in `Session.ts`. `query` would put it next to `useSetupStatus.query.ts` (a real TanStack hook and a query-key owner) as if it were one.                                                                   |
| `CrossTabRefresh.ts`                                                                      | `createCrossTabRefresh` and `browserCrossTabOptions` (Web Locks and BroadcastChannel), with their option types    | Confirmed without a word (step 5). Not `rules` (it has side effects), not `client` (it calls no outside system; it coordinates tabs around a refresh it is given), not `setup` (it is a factory used by `Session.ts`, not wiring). No tool, guard or glob selects it, and no same-named file is in the folder. |
| `Session.ts`                                                                              | `createSession`, the session lifecycle (restore, sign-in, 2FA, refresh, sign-out, expire), and the `Session` type | Confirmed without a word (step 5). The only close row is `service`, which is cms-api only; widening it to frontends for one file would invite `.service` on many frontend factories, so no row is added. It stays apart from `Session.context.tsx` by that file's word.                                        |

The 30-line floor of `code-standards` §4.4 does not merge a hook file: step 1 requires one hook per `use` file, so `useAuthSelector.state.ts` and `useCurrentUser.state.ts` stay separate files. Rename tasks do not merge other small files either; they only merge types-only and re-export-only files (Q-FN10).

### Word choices confirmed by the planner (FN-ad-3, 2026-10-26)

(Superseded by Q-FN12, as above.) **`query` versus `state`, sharpened.** What decides is where the hook's data comes from, not whether the hook calls `useQuery` itself. A hook whose data is TanStack Query server data, read with `useQuery` or through a feature's query hook (`useRolesQuery`), and which passes on that query's pending state, is `query`. A hook that reads only local state or the Redux store is `state`. The SPEC §5 row says so.

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

The `use` hook files follow the same rule: the hook word is not repeated in the name (`useLiveHealth.query.ts`, not `useLiveHealthQuery.query.ts`), and the exported hook name is unchanged. Since Q-FN12 the file is `useLiveHealth.ts`.

**FN-ad-4 follow-up.** The ESLint `QUERY_KEY_OWNERS` in `apps/cms-admin/eslint.config.mjs` still names `src/features/content/content-queries.ts` explicitly. FN-ad-4 renames that file to `Content.queries.ts`, which the `src/**/*.queries.ts` glob already covers, and deletes the explicit line in the same commit.

### Word choices confirmed by the planner (FN-e2e-1, 2026-10-26)

`apps/e2e` has one layer (`src/` helpers, `tests/` Playwright suites), no `config/` folder and no React. The words below are what the FN1c guard lists.

| File (apps/e2e `src/`)                                                                                | Holds                                                                                                                        | Decision                                                                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `E2e.env.ts`                                                                                          | `e2eEnv`, the only reader of `process.env` in the suite, with its required-key check                                         | Kept. The `env` row's "Holds" fits exactly; its "Where" is widened from frontends `config/` to frontends `config/`; e2e `src/` (SPEC §5). No e2e-only word: a second word for the same job would split one meaning across two names, and `setup` (the cms-api choice for `AppConfig.setup.ts`) means runner hooks in e2e terms (`playwright.config.ts` globals).                                    |
| `AppContracts.contract.ts`                                                                            | re-exports of app constants, routes and copy; the only e2e file that imports an app's `src` (ESLint `no-restricted-imports`) | Confirmed `contract` ("values pinned across packages"). It is re-export-only and 22 lines, but a lint layer rule requires it as the single gateway, so the `code-standards` §4.4 exception for "a file a layer rule requires" applies: it is not merged.                                                                                                                                            |
| `RunId.constants.ts` (2 lines), `ContentTypes.constants.ts` (11), `TwoFactorAccount.constants.ts` (7) | `RUN_ID`; the smoke content-type slugs and `editUrlPattern`; `TWO_FACTOR_CHANGED_PASSWORD` (one spec uses it)                | Names confirmed for FN-e2e-1, which stays rename-only (Q-FN10: rename tasks merge only types-only and re-export-only files). They break `code-standards` §4.4 (under 30 lines; five constants files in one layer), so follow-up FN-e2e-2 merges them: `RUN_ID` and the content-type names into `E2e.constants.ts`, `TWO_FACTOR_CHANGED_PASSWORD` into `tests/TwoFactor.e2e.spec.ts`, its only user. |
| `ApiPaths.constants.ts`                                                                               | `API_PATHS` and `apiUrl`: the one cms-api path map of the suite                                                              | Renamed `Api.endpoints.ts` in FN-e2e-2. The `endpoints` row ("the API endpoint map") fits better than `constants`, matches the frontends' `Api.endpoints.ts`, and leaves `src/` with one constants file (`E2e.constants.ts`). Its "Where" is widened the same way as `env`.                                                                                                                         |

**e2e guard words (FN1c).** `FILE_FUNCTION_WORDS` for apps/e2e: `e2e`, `contract`, `fixture`, `client`, `constants`, `env`, `endpoints`, `architecture`. No hook words and no `FRAMEWORK_FILE_NAMES` (`playwright.config.ts` sits at the package root, outside the scanned folders). Test suffixes: `.spec.ts` under `tests/` (Playwright), `.test.ts` under `src/` (`node:test`: `Env.contract.test.ts`, `FileNames.architecture.test.ts`). Unlike the other non-cms-api packages, the word is **required** in apps/e2e: every e2e file has a row, all 51 files carry one today, and a word-less helper would be a missing decision rather than a component. Adding a word later is one table row plus one list entry, as for the other packages.

## Revision 3 (accepted 2026-10-26): open word set, general rule in the agent layer, one lint rule

### Context

User request (2026-10-26): put the file and folder naming rule into the agents' rules so it is applied the same way when there are no state files and in other projects. Folders `kebab-case`; files `<use><PascalCase>.<feature>.<ext>`: `<use>` only when the file's main job is a React hook; `<PascalCase>` the file name; `<feature>` an extension word (`service`, `controller`, `query`, ...) added only when really needed, never by habit; `<ext>` the extension. Afterwards delete `FileNames.constants.ts` and the files with the same job.

The request makes `<feature>` open-ended: there is no closed list any more. Every package guard built in phase FN checks words against a closed list (`FILE_FUNCTION_WORDS`, `HOOK_FUNCTION_WORDS`), cms-api in `src/architecture/FileNames.constants.ts`, the five others inline. Those lists are what the request removes.

### Decision

1. **General rule, project-agnostic, in the agent layer.** The rule text is a new section `code-standards` §4.5 "File and folder names". `code-standards` is preloaded by core-builder, ui-builder, qc, planner and request-validator, so it applies with or without `.claude/state/` and in any project that carries the agent layer. It names no word list and no file of this repo. A project may add detail in its own naming document (here SPEC §5 and this ADR), which the project profile points to with a `Naming:` line; that document adds words, framework names and stricter rules and never loosens the general rule.
2. **SPEC §5 keeps the project specifics.** The word table stays as the vocabulary in use, not an allow-list ("one meaning, one word": take the table's word for that kind of file). A file that needs a word no row means gets a plain lower-case word chosen by the builder, listed in the unit record; the planner adds the row afterwards. Steps 1-3 of "When a file needs a function word" stay (hooks, several TanStack hooks, components). cms-api and apps/e2e keep "word required" (tools and layer rules select those files by it). Steps 4-5 change as above.
3. **What stays unchanged:** kebab-case folders and framework folder syntax; PascalCase base names; the `use` prefix only on one-hook files; at most one word; the base name never repeats its word; error-file naming; test suffix per package and the lower-case test variant; the "Kept as they are" list; the renaming procedure; all word choices recorded above (they are now simply rows of the vocabulary), except the hook words.
   3a. **Hook words dropped (Q-FN12).** Hook files are `use<PascalName>.<ext>` with no `query`, `mutation` or `state`; a `use` file takes a word only when the general rule needs one. No hook file needs one today: the only config that names a hook file, the cms-admin ESLint `QUERY_KEY_OWNERS`, names `useSetupStatus` by its full path, not by a word glob, and no two hook files share a base name in one folder. The `query`, `mutation`, `state` row leaves the SPEC §5 vocabulary. The 16 hook files that carry a word are renamed in FN-hook-rename (table below).
4. **One lint rule replaces the six guards.** With no word list left, the six guards would be six copies of the same shape check (`code-standards` §4.1: shared logic in one owner). The owner is `@abyss/base-config`, which every package already spreads into its ESLint config. `src/Eslint.setup.ts` gets a local plugin `abyss` with one rule `file-names`; `baseEslint()` takes one new optional option, `fileNames` (additive; existing callers keep working), and switches the rule on for `src/**`, `test/**` and `tests/**` when it is passed (`{}` means defaults), so each package opts in within its own task and `main` never turns red. It runs in `pnpm lint` (CI already runs it), needs no new dependency, and checks, with no word list:
   - folder segments below the scanned root are kebab-case, or a route segment (`[slug]`, `[...slug]`, `(group)`, `@slot`) when `allowsRouteSegmentFolders` is set;
   - the file name is in `frameworkFileNames` (default `index.ts`, `*.d.ts`), or matches `<use?><PascalName>[.<word>][.<variant>].<testSuffix>.<ext>` / `<use?><PascalName>[.<word>].<ext>` with lower-case words, at most one word on a source file;
   - `use<Name>` files export a value named `use<Name>`; a file whose only value export is one function named `use[A-Z]...` starts with `use` (AST check, the mechanical form of "`<use>` only when the main job is a React hook");
   - the word does not repeat the last PascalCase segment of the name (singular or plural: `SecurityError.errors`, `AppContracts.contract` fail);
   - a word is present when `isWordRequired` (cms-api, apps/e2e); there is no hook-word option (Q-FN12);
   - test files end with one of `testSuffixes` (per `files` block, so e2e `tests/**` takes `spec` and `src/**` takes `test`);
   - only `.ts`, `.tsx`, `.js`, `.jsx` and `.mjs` files are checked (Q-FN13); the rule's `files` globs list exactly these under the scanned folders.
     Whether a word was really needed, and whether it is the vocabulary's word, stays a review check of the builder's old -> new map; no lint can decide "needed".
5. **Known gap, accepted.** ESLint sees only linted files, so a folder that holds no `.ts`, `.tsx`, `.js`, `.jsx` or `.mjs` file is not checked (the old guards walked every folder). Such folders hold assets or CSS only; the review covers them.

### Two existing names the new check rejects

| Old                                                            | New                                           | Why                                                                                                                                                                        |
| -------------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| apps/e2e `src/AppContracts.contract.ts`                        | `src/Apps.contract.ts`                        | `Contracts` repeats `contract` (rule under "Shape"); it re-exports the apps' pinned values. About 37 importing files plus `eslint.config.mjs` and README, path edits only. |
| apps/cms-api `src/architecture/ErrorContract.contract.spec.ts` | `src/architecture/ErrorBody.contract.spec.ts` | `Contract` repeats `contract`; the spec pins the error body shape across REST, GraphQL and bulk.                                                                           |

The confirmation of `AppContracts.contract.ts` in "FN-e2e-1" above is superseded by this rename (Q-FN16).

### Hook files renamed (Q-FN12, task FN-hook-rename)

`git mv` plus import-path, `vi.mock` path, ESLint and README edits only; exported hook names do not change. Tests follow their file.

| Package / folder                                    | Old                                          | New                                    |
| --------------------------------------------------- | -------------------------------------------- | -------------------------------------- |
| cms-admin `src/components/`                         | `useClampedPage.state.ts` (+ `.test.tsx`)    | `useClampedPage.ts` (+ `.test.tsx`)    |
| cms-admin `src/components/`                         | `useRestoreFocus.state.ts` (+ `.test.tsx`)   | `useRestoreFocus.ts` (+ `.test.tsx`)   |
| cms-admin `src/features/access/`                    | `useCallerAccess.query.ts` (+ `.test.ts`)    | `useCallerAccess.ts` (+ `.test.ts`)    |
| cms-admin `src/features/access/`                    | `useTokenSubmit.mutation.ts`                 | `useTokenSubmit.ts`                    |
| cms-admin `src/features/auth/`                      | `useAuthSelector.state.ts`                   | `useAuthSelector.ts`                   |
| cms-admin `src/features/auth/`                      | `useCurrentUser.state.ts`                    | `useCurrentUser.ts`                    |
| cms-admin `src/features/auth/`                      | `useEmailCode.mutation.ts` (+ `.test.tsx`)   | `useEmailCode.ts` (+ `.test.tsx`)      |
| cms-admin `src/features/auth/`                      | `useSetupStatus.query.ts`                    | `useSetupStatus.ts`                    |
| cms-admin `src/features/content/`                   | `useBulkRun.mutation.ts`                     | `useBulkRun.ts`                        |
| cms-admin `src/features/content/`                   | `useCollectionList.query.ts`                 | `useCollectionList.ts`                 |
| cms-admin `src/features/content/`                   | `useContentNavItems.query.ts` (+ `.test.ts`) | `useContentNavItems.ts` (+ `.test.ts`) |
| cms-admin `src/features/status/`                    | `useLiveHealth.query.ts`                     | `useLiveHealth.ts`                     |
| web `src/features/auth/`                            | `useEmailCode.mutation.ts` (+ `.test.tsx`)   | `useEmailCode.ts` (+ `.test.tsx`)      |
| web `src/features/reviewer/`                        | `useHumanCheck.state.tsx`                    | `useHumanCheck.tsx`                    |
| web `src/features/status/`                          | `useLiveHealth.query.ts`                     | `useLiveHealth.ts`                     |
| form-commons `src/components/forms/sortable-sheet/` | `useRowSelection.state.ts`                   | `useRowSelection.ts`                   |

16 hook files and 6 tests. `useRowSelection` is not exported from the form-commons package root, so the public-API snapshot does not change.

### Files made obsolete (each deletion is approved by the user one by one)

| File                                                           | Job today                                                  | After revision 3                                                         |
| -------------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------ |
| `apps/cms-api/src/architecture/FileNames.constants.ts`         | cms-api closed word list, framework names, scanned folders | deleted (FN-lint-api); options move to `apps/cms-api/eslint.config.mjs`  |
| `apps/cms-api/src/architecture/FileNames.architecture.spec.ts` | cms-api guard                                              | deleted (FN-lint-api); `abyss/file-names`                                |
| `packages/base-config/test/FileNames.architecture.test.ts`     | base-config guard with inline word list                    | deleted (FN-lint-1)                                                      |
| `packages/form-commons/src/FileNames.architecture.test.ts`     | guard with inline word and hook-word lists                 | deleted (FN-lint-ui)                                                     |
| `apps/cms-admin/src/FileNames.architecture.test.ts`            | same                                                       | deleted (FN-lint-ui)                                                     |
| `apps/web/src/FileNames.architecture.test.ts`                  | same, plus Next.js names                                   | deleted (FN-lint-ui); Next.js names move to `apps/web/eslint.config.mjs` |
| `apps/e2e/src/FileNames.architecture.test.ts`                  | guard with inline word list                                | deleted (FN-lint-e2e)                                                    |

Not obsolete: `LayerRules.constants.ts` (`PLATFORM_PORT_SUFFIX`), `SourcePaths.constants.ts`, the ESLint `*.queries.ts` / `*.constants.ts` / `*.copy.ts` globs. They select files by a word for another job (layer roles, pinned paths, lint scopes); that is exactly what makes those words "needed".

### Extension path

- A new package spreads `baseEslint()` with `fileNames: {}` (one line) and adds options only if it has framework names, route folders, a required word or a single test suffix.
- A new framework-fixed name is one entry in that package's `fileNames.frameworkFileNames`.
- A new word needs no code change: the builder uses it when the §4.5 test says a word is needed, and the planner adds one row to the SPEC §5 vocabulary.
- Another project gets the general rule by carrying its own copy of the agent layer (`.claude/agents`, `.claude/skills`; Q-FN15: copied per project, no shared install). The §4.5 text names nothing from this repo (no word list, no file, no package), so the copy needs no edit. That project gets no lint rule unless it adds one.

## Module ownership, names, extension path

Revision 3 replaces the first three bullets below once the FN-lint tasks are done: ownership is `code-standards` §4.5 (general rule), SPEC §5 (repo vocabulary and specifics) and `@abyss/base-config` `src/Eslint.setup.ts` (the `abyss/file-names` rule; key names `fileNames`, `frameworkFileNames`, `allowsRouteSegmentFolders`, `isWordRequired`, `testSuffixes`).

- **Ownership:** the rule and the function-word table live in SPEC §5; each package's guard owns its `FILE_FUNCTION_WORDS` (cms-api in `src/architecture/FileNames.constants.ts`, the others inside the guard file). FN-lint-api deletes the cms-api guard and its constants file; the other cms-api guards move to `test/architecture/` in ARCH-1, so no cms-api structure guard stays under `src/`.
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

## User answers (2026-10-26, revision 3)

- **Q-FN12:** hook words are dropped. Hook files are `use<PascalName>.<ext>`; a word only when the general rule needs one. The 16 existing hook files are renamed (FN-hook-rename).
- **Q-FN13:** the rule covers TypeScript and JavaScript files only (`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`); other file types keep their conventions.
- **Q-FN14:** one ESLint rule, `abyss/file-names`, in `@abyss/base-config`, replaces the six guards and is switched on per package.
- **Q-FN15:** the general rule is kept in each project's own agent layer (copied per project); `code-standards` §4.5 names nothing from this repo.
- **Q-FN16:** `apps/e2e/src/AppContracts.contract.ts` -> `Apps.contract.ts` (FN-lint-e2e) and `apps/cms-api/src/architecture/ErrorContract.contract.spec.ts` -> `ErrorBody.contract.spec.ts` (FN-lint-api).
