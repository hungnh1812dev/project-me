# Project structure and naming

Part of the [project spec](../../SPEC.md); moved from the old SPEC §5. Global: it applies to every flow in `docs/flows/`.

```
abyss/
├── abyss.code-workspace # multi-root: one folder per app/package
├── pnpm-workspace.yaml · turbo.json · tsconfig.base.json (compilerOptions only)
├── packages/
│   ├── base-config/ # @abyss/base-config: exports prettier, eslint, oxlint
│   └── form-commons/ # @abyss/form-commons, exports ./dist only
│       └── src/{components/ui, components/forms, constants}
├── apps/
│   ├── cms-api/ # @abyss/cms-api
│   │   ├── prisma/ # core schema + migrations (public)
│   │   ├── content/ # schemas/*.json + generated migrations/ + schema.graphql (printed SDL, D18)
│   │   ├── src/
│   │   │   ├── main.ts · Bootstrap.setup.ts · App.module.ts · App.setup.ts # composition root
│   │   │   ├── config/ # Env.schema.ts (Zod), AppConfig.setup.ts (frozen IAppConfig), Config.constants.ts, Config.module.ts
│   │   │   ├── common/ # pure: constants/, errors/ (DomainError), time/ (Clock.service.ts, Clock.module.ts), types/, validation/
│   │   │   │ # HTTP pipeline: filters/, guards/, http/ (incl. ClientIp.module.ts), middleware/, rate-limit/ (incl. ThrottleSubject.port.ts)
│   │   │   ├── generated/ # Prisma client (generated; never edited)
│   │   │   ├── infrastructure/ # adapters and *.port.ts used by several modules: database/ (TransactionRunner.port.ts), mail/, logging/ (AppLogger.port.ts),
│   │   │   │ # scheduling/; activity/, media/, turnstile/ and the database-health port live in documents, media, reviewer, health (Q-CA14a)
│   │   │   └── modules/ # one folder per §2 module: identity/, access/ (core <layer>/ + management/<layer>/ + document-auth/<layer>/, Q-CA15c),
│   │   │       │ # security-audit/, content-engine/, content-types/, documents/, graphql/, media/, reviewer/, health/
│   │   │       └── <module>/ # {domain,application,adapters,http,cli,jobs}/ (only the layers it needs, §2), <Module>.module.ts, index.ts (facade)
│   │   └── test/ # integration/, fixtures/, architecture/ (*.architecture.spec.ts guards + *.analyzer.ts source readers,
│   │ # ModuleEdges.constants.ts, LayerRules.constants.ts (LAYER_RULES, §2), SourcePaths.constants.ts (SRC_ROOT);
│   │ # run by the jest `unit` project, not compiled into dist/)
│   ├── cms-admin/ # @abyss/cms-admin, React 19 + Vite SPA
│   │   └── src/
│   │       ├── main.tsx # entry
│   │       ├── app/ # composition root: store.ts, query-client.ts, app-services.ts, AppProviders.tsx, App.tsx (routes), AppShell.tsx
│   │       ├── features/ # auth/, security/, content-types/, access/, media/, content/, reviewer/, status/: pages, *.api.ts, auth.slice.ts, *-queries.ts, <feature>.constants.ts
│   │       ├── components/ # app UI shared by features, no feature knowledge (Modal.tsx)
│   │       ├── lib/ # api-client.ts and other feature-free helpers
│   │       ├── config/ # env.ts, endpoints.ts, routes.ts, http.constants.ts, auth.constants.ts, copy.constants.ts
│   │       └── styles/ # app.css
│   ├── web/ # @abyss/web, Next.js 16 App Router, standalone Node server
│   │   ├── next.config.ts · postcss.config.mjs · vitest.config.ts · Dockerfile · public/
│   │   └── src/
│   │       ├── proxy.ts # per-request nonce + CSP header (D17)
│   │       ├── instrumentation.ts · instrumentation-node.ts
│   │       ├── app/ # routes and shell: layout.tsx, page.tsx, not-found.tsx, providers.tsx, query-client.ts, CspNonce.tsx, AccountMenu.tsx
│   │       ├── config/ # env.server.ts (server-only), env.client.ts (NEXT_PUBLIC_* only), require-env.ts, endpoints.ts, shared *.constants.ts
│   │       ├── lib/ # api-client.ts (browser Axios), content-security-policy.ts, api-failure.ts; Graphql.server.ts, Graphql.client.ts, SafeRichtext.rules.ts
│   │       ├── app/bff/v1/ # BFF Route Handlers (D21); their pipeline and cms-api clients in apis/server/ (ADR 0017 §6, §8)
│   │       └── features/ # session/ (who is signed in; sealed BFF session cookie server-side), auth/ (sign-in UI, Turnstile), status/, cv/ (reviewer/ removed, D21):
│   │ # *.api.ts, *.graphql.ts (GraphQL documents), *.server.ts, client components
│   └── e2e/ # @abyss/e2e Playwright
└── docs/{adr, modules, deployment}
```

Tree names are the names on disk today and predate the naming rule (ADR 0008); the code is the authority for exact names. Phase FN tasks rename them to the rule below; the planner updates the tree when phase FN closes.

Naming rules (ADR 0008, user decisions 2026-10-25/26, revision 3 accepted 2026-10-26 with Q-FN12..Q-FN16): one format in every TypeScript package (cms-api, cms-admin, web, form-commons, e2e, base-config), for `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs` only; other file types (CSS, JSON, Markdown, shell scripts, images) keep their conventions (Q-FN13). The general rule is `code-standards` §4.5 "File and folder names" (agent layer, project-agnostic; each project has its own copy, naming nothing from this repo, Q-FN15): folders `kebab-case`; files `<use><PascalCase>.<feature>.<ext>`, `<use>` only when the main export is one React hook, `<feature>` one optional word only when needed, never by habit. Repo specifics:

- Framework folder syntax kept (Next.js `[param]`, `(group)`, `_private`); e.g. `content-engine/`, `bulk-action-bar/`.
- Files `<PascalName>.<feature>.<ext>` when a word is needed (`Health.controller.ts`, `TransactionRunner.port.ts`, `ApiTokenExpiry.rules.ts`), else `<PascalName>.<ext>`. `<PascalName>` never repeats its word (`Security.errors.ts`, not `SecurityError.errors.ts`); error files `<Feature>.errors.ts`, or `<Flow>.errors.ts` when a feature has several (`Login.errors.ts`). Hooks: `use<PascalName>.<ext>`, no hook word (`useSetupStatus.ts`, `useCurrentUser.ts`, `useHumanCheck.tsx`; Q-FN12); a word only if the general rule needs one (tool/config selects by it, or it separates same-named files in a folder), none today. Hook words `query`, `mutation`, `state` are retired; task FN-hook-rename drops them from the 16 hook files still carrying them.
- Word test (first match decides): one hook → `use<PascalName>.<ext>`; several TanStack hooks of one feature → `<Feature>.queries.ts`, no `use`; one React component (pages included) → no word, file = component name (`LoginPage.tsx`, `Button.tsx`); cms-api and apps/e2e files always carry a word (Nest roles, layer rules, Playwright / Jest globs select by it); otherwise only when a tool/config selects by it or it separates same-named files in a folder.
- Open word set (revision 3): the table below is the vocabulary in use, not an allow-list; one meaning, one word. If no row fits, the builder picks one plain lower-case word, never vague (`helper`, `util`, `utils`, `misc`, `common`, `types`, `component`), lists it in the unit record, and the planner adds the row. No guard or constants file lists the words.
- Tests: package suffix on the full name, `.spec.ts` in cms-api and e2e (e2e `tests/`), `.test.ts(x)` elsewhere and for the e2e `node:test` checks in `apps/e2e/src/` (`AccessPolicy.service.spec.ts`, `useSetupStatus.test.ts`, `LoginPage.test.tsx`); scenario splits add one lower-case variant before the suffix (`AccountMenu.login.test.tsx`).
- Kept as is: framework-fixed names (`index.ts`, `main.ts(x)`, `.d.ts`, Next.js `page.tsx` / `layout.tsx` / `not-found.tsx`, `proxy.ts`, `instrumentation.ts`), package-root tool configs (`vite.config.ts`, `eslint.config.mjs`, ...), generated code. Types-only and re-export-only files merge into their nearest neighbour (`code-standards` §4.4).
- Check: ESLint rule `abyss/file-names` (owner `@abyss/base-config/eslint`), on via `baseEslint({ fileNames })` for `src/`, `test/`, `tests/` of each package passing `fileNames` (all six after FN-lint-*; ADR 0008 revision 3). It checks `.ts`, `.tsx`, `.js`, `.jsx`, `.mjs` (Q-FN13): shape (no word list), kebab-case folders, `use` prefix <-> one exported React hook, a word repeating its name, the required word (cms-api, e2e), test suffix per folder. Each package passes only its options (framework file names, route-segment folders, test suffixes, word required). Whether a word was needed is a review check, not lint. Until FN-lint-api / -ui / -e2e land, the per-package `FileNames.architecture.spec.ts` / `.test.ts` guards stay.
- A `.port.ts` sits in a cms-api module's `application/`, in `src/infrastructure/` (role `port`: `application/` may import it), or in a `src/common/` pipeline folder as a seam the app binds (its folder's role, e.g. `pipeline`: only `http/` may import it; `ThrottleSubject.port.ts`). One endpoint map per frontend in `src/config/` (`Api.endpoints.ts`), one for e2e in `apps/e2e/src/Api.endpoints.ts` (FN-e2e-2).

Words in use (open vocabulary; at most one per file; the planner adds a row when a builder reports a new word; React components have no row on purpose; "Where" = used today):

| Word                                         | Where                                                | Holds                                                                                                | Example                                                           |
| -------------------------------------------- | ---------------------------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `setup`                                      | all                                                  | app wiring and bootstrap; app config loading; a test-runner hook (global setup/teardown, setup file) | `App.setup.ts`, `AppConfig.setup.ts`, `Jest.setup.ts`             |
| `module`                                     | cms-api                                              | a Nest module (wiring only)                                                                          | `Identity.module.ts`                                              |
| `controller`, `requests`                     | cms-api `http/`                                      | a Nest controller; the Zod request schemas and parsers of one controller                             | `Accounts.controller.ts`, `Accounts.requests.ts`                  |
| `routes`                                     | cms-api; frontends                                   | one module's route group (`common` keeps only the API prefix); frontend UI routes                    | `Identity.routes.ts`, `App.routes.ts`                             |
| `guard`, `decorator`, `middleware`, `filter` | cms-api `http/`, `common/`                           | Nest pipeline roles                                                                                  | `ApiToken.guard.ts`                                               |
| `resolver`, `executor`                       | cms-api `http/`, `common/`                           | a Nest or GraphQL resolver; a transport executor (GraphQL)                                           | `Document.resolver.ts`, `Graphql.executor.ts`                     |
| `service`                                    | cms-api `application/`; `common/`, `infrastructure/` | use cases of one aggregate; outside `modules/`, one shared injectable provider                       | `Invitations.service.ts`, `Clock.service.ts`, `Prisma.service.ts` |
| `port`                                       | cms-api `application/`, `infrastructure/`, `common/` | an interface plus its injection token                                                                | `Account.port.ts`, `ThrottleSubject.port.ts`                      |
| `entity`                                     | cms-api `domain/`                                    | domain types                                                                                         | `Account.entity.ts`                                               |
| `rules`, `errors`                            | cms-api `domain/`; frontends                         | pure rules; errors and error mapping                                                                 | `RankRules.rules.ts`, `Access.errors.ts`                          |
| `repository`, `adapter`                      | cms-api `adapters/`                                  | a repository port implementation; any other port implementation                                      | `PrismaAccount.repository.ts`, `Cloudinary.adapter.ts`            |
| `client`                                     | all                                                  | a client of an outside system (HTTP, SDK)                                                            | `Turnstile.client.ts`                                             |
| `command`, `job`, `store`, `strategy`        | cms-api (`store` also cms-admin)                     | CLI entry point, scheduled job, in-memory or Redux store, passport strategy                          | `OwnerBootstrap.command.ts`, `MediaPurge.job.ts`                  |
| `constants`                                  | all                                                  | named constants (placement below)                                                                    | `Access.constants.ts`                                             |
| `schema`                                     | cms-api `config/`                                    | a Zod schema that is not a request schema                                                            | `Env.schema.ts`                                                   |
| `architecture`                               | all                                                  | a structure guard                                                                                    | `ImportGraph.architecture.spec.ts`                                |
| `analyzer`                                   | cms-api `test/architecture/`                         | a source-tree reader used by the guards                                                              | `ImportGraph.analyzer.ts`                                         |
| `integration`                                | cms-api `test/integration/`                          | an integration suite                                                                                 | `Auth.integration.spec.ts`                                        |
| `e2e`                                        | e2e `tests/`                                         | a Playwright suite                                                                                   | `SideMenu.e2e.spec.ts`                                            |
| `contract`                                   | all                                                  | values pinned across packages, or the test pinning them                                              | `PublicConstants.contract.ts`                                     |
| `snapshot`                                   | cms-admin, form-commons                              | a checked-in snapshot a test compares against                                                        | `PublicApi.snapshot.ts`                                           |
| `fixture`                                    | tests                                                | test data and test helpers                                                                           | `Merge.fixture.ts`, `RenderApp.fixture.tsx`                       |
| `api`                                        | frontends                                            | one feature's HTTP calls                                                                             | `Access.api.ts`                                                   |
| `queries`                                    | frontends                                            | one feature's TanStack Query keys and hooks, reads and writes (Q-FN11)                               | `Access.queries.ts`                                               |
| `context`                                    | frontends                                            | a React context and its provider                                                                     | `AccessApi.context.tsx`                                           |
| `env`, `endpoints`                           | frontends `config/`; e2e `src/`                      | reads and checks env values; the API endpoint map                                                    | `Server.env.ts`, `E2e.env.ts`, `Api.endpoints.ts`                 |
| `registry`, `feature`                        | cms-admin                                            | a lookup table of variants; a feature's `Feature` contract                                           | `Features.registry.ts`, `Media.feature.ts`                        |
| `form`, `columns`, `interceptor`, `reducer`  | frontends                                            | form schema and defaults; table columns; Axios interceptor; pure reducer                             | `Password.form.ts`, `Account.columns.tsx`                         |
| `styles`                                     | form-commons                                         | class-name maps for one component                                                                    | `Richtext.styles.ts`                                              |
| `slice`                                      | cms-admin                                            | a Redux Toolkit slice                                                                                | `Auth.slice.ts`                                                   |
| `copy`                                       | frontends                                            | one copy section                                                                                     | `Access.copy.ts`                                                  |
| `graphql`, `server`                          | web                                                  | a GraphQL document; server-only code                                                                 | `CvPage.graphql.ts`, `Content.server.ts`                          |

Constants placement (Q-A1): a constant lives next to its one owning module or feature, in `<Module>.constants.ts` (cms-api) or `features/<feature>/<Feature>.constants.ts` (frontends; lower-case names until phase FN renames them); others read it through the owner's `index.ts`. cms-api `common/constants/` and frontend `config/` hold only values shared by several modules or the app shell (env, endpoints, routes, HTTP, auth, copy).

Web rules: Server Components by default; `'use client'` only for state, effects, handlers, browser APIs, TanStack Query, react-hook-form or any `@abyss/form-commons` import. Files that read server env or call `API_INTERNAL_URL` import `server-only`. The browser never holds a user token and never calls cms-api: every browser call goes to the BFF Route Handlers under `/bff/v1` on the web origin, which keep the cms-api tokens in a sealed HttpOnly cookie (D21, amended 2026-10-31, ADR 0017; replaces the earlier "the Next server never holds a token" rule). No Server Actions. No `store/` on web.
