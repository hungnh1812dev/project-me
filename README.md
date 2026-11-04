# Abyss

A headless CMS for a personal CV and portfolio, built as a technical showcase. The owner manages and publishes content defined by JSON schemas; it is served over REST and a read-only GraphQL API to a public Next.js site. The point of the project is the set of concerns that hold up under attack: role and field-level access control, draft and publish, an always-on security audit, and a safe reviewer login for visitors. See [SPEC.md](SPEC.md) section 1 for the objective and the threat model.

This repository is not deployed anywhere public yet, so there is no live site to link. You can run all of it on your machine (see Quick start).

## Screenshots

![Web CV page for an anonymous visitor: contact details and company names show "Sign in to view"](docs/screenshots/web-cv-anonymous.png)

Web CV page as an anonymous visitor: sensitive fields show "Sign in to view" placeholders.

![Web CV page in a reviewer session: the same fields show "Hidden for reviewers"](docs/screenshots/web-cv-reviewer.png)

The same page in a reviewer session: the header reads "Reviewing as a guest" and sensitive fields show "Hidden for reviewers".

![Admin content editor on the resume document](docs/screenshots/admin-content-editor.png)

Admin content editor on the resume document: position, name, rich-text summary and repeatable skills groups.

![Admin role editor with per-field read permissions](docs/screenshots/admin-role-permissions.png)

Admin role editor: per-field read permissions on the resume type, with sensitive fields flagged.

![Admin reviewer access page with the sessions table](docs/screenshots/admin-reviewer-sessions.png)

Admin reviewer access page: the switch for reviewer sessions and a table of who requested access.

## What it does

Each point links to the document that describes it.

- **Field-level access control:** hybrid RBAC with per-field permissions; masked fields come back as `***` for anonymous and reviewer actors. [docs/modules/access-control.md](docs/modules/access-control.md), [SPEC.md](SPEC.md) section 7.
- **Content defined by JSON schemas:** content types, nested components and draft and publish. [docs/modules/content-schema.md](docs/modules/content-schema.md).
- **Read-only GraphQL API** for document reads, next to the REST API. [docs/modules/graphql.md](docs/modules/graphql.md), [ADR 0003](docs/adr/0003-graphql-read-gateway.md).
- **Security audit:** an append-only audit log of sign-ins and sensitive actions. [docs/modules/core-schema.md](docs/modules/core-schema.md).
- **Reviewer access:** a self-service, 24-hour, read-only session protected by Cloudflare Turnstile and rate limits, which the owner can switch on or off. [SPEC.md](SPEC.md) section 7, [docs/modules/access-control.md](docs/modules/access-control.md).
- **One-time owner setup** with a setup token. [docs/modules/owner-setup.md](docs/modules/owner-setup.md), [ADR 0005](docs/adr/0005-one-time-owner-setup-route.md).
- **Clean-architecture layers in the API,** enforced by architecture tests. [ADR 0006](docs/adr/0006-cms-api-clean-architecture-layers.md).
- **Automated success criteria:** each item in [SPEC.md](SPEC.md) section 12 is meant to be an automated test; the current gaps are listed in [docs/modules/success-criteria.md](docs/modules/success-criteria.md).

## Tech stack

Full table: [SPEC.md](SPEC.md) section 3.

- `apps/cms-api`: NestJS 11, Prisma, Kysely, PostgreSQL 17
- `apps/cms-admin`: React 19, Vite, Tailwind CSS, Redux Toolkit, TanStack Query
- `apps/web`: Next.js 16 (App Router), React 19
- `apps/e2e`: Playwright (Chromium)
- `packages/form-commons`: shared React form components (shadcn/Radix)
- `packages/base-config`: shared lint, format and TypeScript config
- Monorepo: pnpm 11 workspaces, Turborepo, Node 24 or newer, TypeScript

## Quick start

Needs Docker (running), Node 24 or newer and pnpm 11. Use a Chromium-based browser, which resolves `*.localhost` names.

```
pnpm install
pnpm demo
pnpm dev:stack:stop     # when you are done
```

`pnpm demo` starts Postgres and a mail catcher in containers and the three apps in dev mode, and turns reviewer access on. It prints the web, admin and mail addresses. Open the web and choose Reviewer access (needs internet for the Turnstile widget). Signing in to the admin locally needs a separate owner setup: see "Create the one owner account" in [docs/guidelines/local-run.md](docs/guidelines/local-run.md). That guide also covers the other ways to run the stack.

## Git hooks

`pnpm install` installs a pre-commit hook (husky). It formats the staged files with the repo's Prettier setup and adds the result to the commit; files listed in `.prettierignore` and files Prettier has no parser for are left alone. If Prettier fails, the commit is aborted.

- Skip it for one commit: `git commit --no-verify`. Skip it for a shell session, or do not install the hooks: `HUSKY=0`.
- Git clients with a GUI may not find `pnpm` on their `PATH`; add the needed `PATH` setup to `~/.config/husky/init.sh`, which husky runs before each hook.

## Where to look

- [SPEC.md](SPEC.md): objective and scope, and the index of every spec doc: [docs/global/](docs/global) (shared rules, decisions, acceptance, reference), [docs/apps/](docs/apps) (per app), [docs/flows/](docs/flows) (per business flow).
- [docs/adr/](docs/adr): architecture decision records.
- [CHANGELOG.md](CHANGELOG.md): every release with its versions, changes and DevOps patches.
- [docs/modules/](docs/modules): one page per module, indexed in [docs/modules/MODULES.md](docs/modules/MODULES.md).
- [.github/workflows/](.github/workflows): CI.
- [apps/e2e](apps/e2e): browser tests ([README](apps/e2e/README.md)).
- [docs/deployments/](docs/deployments/devops-runbook.md): CI/CD and deployment (start at the DevOps runbook).
- [docs/guidelines/](docs/guidelines): running the stack and the checks locally.

## Repository map

- `apps/`: `cms-api`, `cms-admin`, `web`, `e2e`; each has its own README.
- `packages/`: `form-commons`, `base-config`.
- `docs/`: ADRs, module pages, architecture pages, deployment and local-run guides.
- `scripts/`: the demo and dev stack, and the smoke stack.
- `tasks/`: the plan and task list ([plan.md](tasks/plan.md), [todo.md](tasks/todo.md)) that drove the build, one task at a time with acceptance criteria.
- `.claude/`: the agent workflow used to build the project (agent roles, skills and the shared state files). It is kept in the repository on purpose, so the process is visible.

## License

Copyright (C) 2026 AbyssOfTime Dev. Licensed under the [GNU Affero General Public License v3.0](LICENSE) (`AGPL-3.0-only`); see [NOTICE](NOTICE).

You may use, change and share the code. If you distribute it, or run a modified version as a network service, you must share that version's complete source under the same license and keep the copyright notices.

If you use or build on this project, please let the owner know by opening an [issue](https://github.com/hungnh1812dev/project-me/issues). This is a request, not a license condition.
