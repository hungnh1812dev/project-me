# ADR 0008: File naming rule `<use><PascalName>.<function>.<ext>`

- Status: proposed (2026-10-25). The rule is the user's; the function-word list, scope and examples below are the planner's proposal for the user to confirm (Q-FN1..Q-FN6).
- Date: 2026-10-25
- Amends (once accepted): SPEC §5 "Naming rules" and its suffix table (today: `kebab-case.ts` files with a dotted role suffix)

## Context

User rule: file names follow `<use (for react hook)><Pascal Name>.<function>.<ext>`, where `<function>` is one of `setup | module | query | client | service | ...` (more may follow). Today SPEC §5 says `kebab-case.ts` with a role suffix (`access-policy.service.ts`), React components `PascalCase.tsx`, Next.js route files by framework name.

## Decision (proposed)

### Shape

- `<PascalName>.<function>.<ext>`: `AccessPolicy.service.ts`, `Identity.module.ts`, `Turnstile.client.ts`.
- React hooks add the `use` prefix: `useCurrentUser.query.ts`, `useTokenSubmit.mutation.ts`.
- Tests append to the full name: `AccessPolicy.service.spec.ts` (cms-api), `useCurrentUser.query.test.ts` (frontends).
- `<PascalName>` names the thing, not the layer: `Account`, `AccessPolicy`, `MediaLibrary`. One file, one function word.

### Function words (proposed list)

| Function                                     | Where                                     | Holds                                                                                            | Example                                                    |
| -------------------------------------------- | ----------------------------------------- | ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `setup`                                      | all                                       | app wiring and bootstrap                                                                         | `App.setup.ts`                                             |
| `module`                                     | cms-api                                   | a Nest module (wiring only)                                                                      | `Identity.module.ts`                                       |
| `controller`                                 | cms-api `http/`                           | a Nest controller                                                                                | `Accounts.controller.ts`                                   |
| `requests`                                   | cms-api `http/`                           | Zod request schemas of one controller                                                            | `Accounts.requests.ts`                                     |
| `routes`                                     | cms-api `http/`                           | one module's route group                                                                         | `Identity.routes.ts`                                       |
| `guard`, `decorator`, `middleware`, `filter` | cms-api `http/`, `common/`                | Nest pipeline roles                                                                              | `ApiToken.guard.ts`                                        |
| `service`                                    | cms-api `application/`                    | use cases of one aggregate                                                                       | `Invitations.service.ts`                                   |
| `port`                                       | cms-api `application/`, `infrastructure/` | an interface plus its injection token                                                            | `Account.port.ts`, `Mail.port.ts`                          |
| `entity`, `rules`, `errors`                  | cms-api `domain/`                         | domain types, pure rules, domain errors                                                          | `Account.entity.ts`, `RankRules.rules.ts`                  |
| `repository`                                 | cms-api `adapters/`                       | a repository port implementation                                                                 | `PrismaAccount.repository.ts`                              |
| `adapter`                                    | cms-api adapters                          | any other port implementation                                                                    | `Cloudinary.adapter.ts`                                    |
| `client`                                     | all                                       | a client of an outside system (HTTP, SDK)                                                        | `Turnstile.client.ts`, `Api.client.ts`                     |
| `command`                                    | cms-api `cli/`                            | a CLI entry point                                                                                | `OwnerBootstrap.command.ts`                                |
| `job`, `store`, `strategy`                   | cms-api                                   | scheduled job, in-memory store, passport strategy                                                | `MediaPurge.job.ts`                                        |
| `resolver`                                   | cms-api `http/`, `common/`                | a Nest resolver (throttle subject, client IP) or GraphQL resolvers (added by Q-CA16, 2026-10-25) | `ActorThrottleSubject.resolver.ts`, `Document.resolver.ts` |
| `constants`                                  | all                                       | named constants                                                                                  | `Access.constants.ts`                                      |
| `api`                                        | frontends                                 | one feature's HTTP calls                                                                         | `Access.api.ts`                                            |
| `query`                                      | frontends (hooks)                         | a hook that reads server data (TanStack Query)                                                   | `useAccounts.query.ts`                                     |
| `mutation`                                   | frontends (hooks)                         | a hook that writes server data                                                                   | `useTokenSubmit.mutation.ts`                               |
| `state`                                      | frontends (hooks)                         | a hook with local UI state or logic                                                              | `useClampedPage.state.ts`                                  |
| `context`                                    | frontends                                 | a React context and its provider                                                                 | `AccessApi.context.tsx`                                    |
| `slice`                                      | cms-admin                                 | a Redux Toolkit slice                                                                            | `Auth.slice.ts`                                            |
| `copy`                                       | frontends                                 | one copy section                                                                                 | `Access.copy.ts`                                           |
| `graphql`                                    | web                                       | a GraphQL document (today `.query.ts`, renamed to free `query` for hooks)                        | `CvPage.graphql.ts`                                        |
| `server`                                     | web                                       | server-only code                                                                                 | `Content.server.ts`                                        |
| `fixture`                                    | tests                                     | test data                                                                                        | `Merge.fixture.ts`                                         |

### Kept as they are

- Framework-fixed names: Next.js route files (`page.tsx`, `layout.tsx`, `not-found.tsx`), `proxy.ts`, `instrumentation.ts`, `main.ts`, `main.tsx`, tool configs (`vite.config.ts`, `eslint.config.mjs`, `prisma.config.ts`, ...).
- Facades: `index.ts`.
- React components: `PascalName.tsx` with no function word (`AccountsPage.tsx`, `AccountRowActions.tsx`), see Q-FN3.

### Guard

One `file-names.architecture.spec.ts` (cms-api) or `file-names.test.ts` (frontends, kit, e2e) per package checks every source file name against the shape and the allowed function words from one constants list per package (`FILE_FUNCTION_WORDS`). Files not yet renamed sit in a `KNOWN_FILE_NAME_EXCEPTIONS` list that only shrinks (stale entries fail). No new dependency.

### Renaming on macOS

The repo is used on a case-insensitive file system. A case-only rename (`accounts.service.ts` -> `Accounts.service.ts`) needs two `git mv` steps through a temporary name; builders do moves and content edits in separate commits.

## Module ownership, names, extension path

- **Ownership:** the rule lives in SPEC §5 (one table); each package's guard reads its own `FILE_FUNCTION_WORDS`.
- **Extension path:** a new function word is one row in the SPEC §5 table and one entry in the package's `FILE_FUNCTION_WORDS`.

## Open questions

- **Q-FN1: scope.** Recommended: every TypeScript package (cms-api, cms-admin, web, form-commons, e2e, base-config), with the "kept as they are" list. Alternative: frontends only (cms-api keeps kebab-case).
- **Q-FN2: existing files.** Recommended: new files follow the rule now; existing files are renamed when a clean-architecture (ADR 0006) or micro-frontend (ADR 0007) task moves them anyway, so each file moves once. The guard's exception list tracks the rest. Alternative: one rename sweep per package now (fast to reach, but moves files twice where the refactors follow).
- **Q-FN3: React components.** Recommended: keep `PascalName.tsx` with no function word. Alternative: `Accounts.page.tsx`, `AccountRowActions.component.tsx` (more uniform, longer names, and the component name no longer matches the file name).
- **Q-FN4: hook function words.** Recommended: `query` (server read), `mutation` (server write), `state` (local logic). Alternative: one word `hook` for all hooks (simpler, says less).
- **Q-FN5: the function-word list.** Recommended: the table above. Please add or remove words; anything not on the list fails the guard.
- **Q-FN6: GraphQL documents in web.** Recommended: rename the `.query.ts` role to `.graphql.ts` so `query` means hooks everywhere. Alternative: keep `.query.ts` for GraphQL and use `fetch` for read hooks.
