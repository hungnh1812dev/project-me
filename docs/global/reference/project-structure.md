---
summary: Project tree and the file-name word vocabulary
replaces: §5 tree, §5 Words in use
---

# Project structure

Part of the [project spec](../../../SPEC.md). Reference: definitions and values only; the rules that use them are in the `RULES.md` files.

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

The naming rules: [RULES.md](../RULES.md) "Naming".

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
