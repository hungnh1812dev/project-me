---
name: code-standards
description: Project code rules - run Prettier after every finished feature and before any commit, no hardcoded values, never guess (ask instead), and the design principles (isolated modules, names over comments, extensible with minimal impact, few cohesive files per module). Use whenever planning, writing or changing code in this project.
---

# Code Standards

## 1. Format before every commit

1. Use the project's `format` / `prettier` script, with the package manager of the lockfile (`pnpm-lock.yaml` → pnpm, `yarn.lock` → yarn, `bun.lockb` → bun, `package-lock.json` → npm).
2. No script: `<pm> exec prettier --write <changed files>`.
3. No Prettier in the project: **ask** (`blocked`) before adding it or a config.
4. Then lint and type-check, if the project has them.

## 2. No hardcoding

| Never a literal | Where it belongs |
|---|---|
| URLs, ports, hosts, API keys, feature flags | env config via one typed config module; key names in `.env.example` |
| Colors, spacing, radii, shadows, font sizes | design tokens / theme |
| User-facing text | the i18n / copy module; none → ask |
| Magic numbers (limits, timeouts, page sizes) | named constants in a constants / config module |
| Routes, API paths | one route / endpoint map |
| Mock or sample data | test fixtures only |

Allowed: `0`, `1`, `-1`, empty string, and literals self-describing in context.

## 3. Never guess; ask

Stop and ask (builders report `blocked`; the manager asks the user), with options and a recommendation, when unclear: requirements or acceptance criteria; names of public APIs, routes, DB fields; design values not in the tokens; a library or framework not in the repo; env values, credentials, third-party endpoints; deleting or renaming existing code.

## 4. Design principles

Check every approach against these. If one cannot be met without a design change outside the task, report `blocked` with options; never compromise silently.

### 4.1 Isolated modules, one owner per responsibility

- One responsibility per module, used only through its small public interface, never its internals.
- Find where a responsibility lives before adding logic; extend that owner, never re-implement it elsewhere.
- One-directional dependencies: no circular imports, no reaching into another module's private files or tables.
- Shared logic lives in one shared module both sides depend on, not in copies.

### 4.2 Names over comments

- Names say what a thing is or does (`expiresAt`, `isPublished`, `findActiveSessionsByUser()`, not `data`, `tmp`, `flag`, `handle()`).
- Booleans read as questions (`is`, `has`, `can`, `should`); functions start with a verb; units in the name when they matter (`timeoutMs`).
- Needing a comment for *what* code does → rename or extract a well-named function.
- Comments say only what names cannot: *why*, a constraint, a workaround and its reason. Public interfaces may keep doc comments.
- Short functions at one level of abstraction.

### 4.3 Extensible with minimal impact

- A new variant (type, provider, field, role, screen) is added in one place: registries, maps and interfaces over `if`/`switch` chains across modules.
- Depend on interfaces and config where a second implementation is realistic.
- Public interface changes are additive (new optional fields or parameters) wherever possible.
- No building for imagined needs: leave a clean extension point, not the extensions.

### 4.4 Few, cohesive files a reviewer can read

Split by layer (where the project has layers), then by use case; never by kind of thing (types, constants, ports, helpers each in their own file).

- **One file per use case or entry point** (use case, controller, job, CLI command, adapter), with the types, constants and helpers only it uses inside it.
- **Per module layer, at most one ports file and one constants file.** A layer's shared types live in its main rules or entity file. No file holding only types, one constant group, or a re-export.
- **A port only when** the layer rules forbid the I/O in the caller (e.g. a DB client in the use-case layer) or a second real implementation exists (a fake used by a spec counts). A one-call library wrapper stays in its adapter. One adapter per aggregate and storage technology, not per query.
- **A new file only when** it is a separate use case or entry point, has its own spec, would pass 300 lines, or a layer rule requires it.
- **No file under 30 lines** except `index.ts`, the module wiring file, and files the framework or a layer rule requires; merge it into its nearest neighbour in the layer.
- **Check:** one new endpoint or use case touches at most 6 files (handler, request schema, use case, rule, repository method, wiring); more → merge before building.
- Older task file lists and file maps lose where they conflict: the planner revises them; a builder follows this section and records the difference in the unit record.

### 4.5 File and folder names

TypeScript and JavaScript source files (`.ts`, `.tsx`, `.js`, `.jsx`, `.mjs`) and their folders; other file types keep their own conventions.

- **Folders:** `kebab-case` (`order-history/`, `payment-methods/`). Framework folder syntax stays as the framework requires (`[id]`, `[...slug]`, `(group)`, `_private`, `@slot`).
- **Files:** `<use><PascalName>[.<word>].<ext>`.
  - `<PascalName>` names the thing the file holds, not its layer or folder: `Invoice`, `CheckoutPage`, `PaymentGateway`. When the file's main export is one component or one hook, the file name equals that export's name.
  - `<use>` only when the file's main export is one React hook: `useCart.ts`, `useSessionTimer.tsx`. The file exports a hook with exactly that name. A file that holds several hooks takes no `use` prefix.
  - `<word>` is one optional lower-case word that says what kind of file it is (`service`, `controller`, `client`, `constants`, `errors`): `Invoice.service.ts`, `Payment.errors.ts`. At most one word per file.
- **A word only when needed.** Ask in order; the first match decides:
  1. One React hook: `use<PascalName>.<ext>`. Never add a word that says what kind of hook it is (no `.query`, `.mutation`, `.state`).
  2. One React component, pages included: `<ComponentName>.tsx`, no word.
  3. A tool, framework, config or layer rule selects the file by its word (a module or role suffix, a lint or test glob), or the project's naming document requires a word in that package: the word is needed.
  4. The word keeps same-named files in one folder apart (`Cart.api.ts` next to `Cart.constants.ts`): the word is needed.
  5. Otherwise no word. Never add one by habit or to match neighbours.
- **One meaning, one word.** Use the naming document's word for this kind of file; if it has none, pick one plain lower-case word for what the file holds, never a vague one (`helper`, `util`, `utils`, `misc`, `common`, `types`, `component`), and list it in your unit record or report for the planner to add.
- **No repeated word.** The base name does not end with its own word, singular or plural: `Payment.errors.ts`, not `PaymentError.errors.ts`; `Shipping.contract.ts`, not `ShippingContracts.contract.ts`. Exported identifiers keep their own names (`PaymentError` lives in `Payment.errors.ts`).
- **Tests:** append the project's test suffix to the full name of the file under test: `Invoice.service.spec.ts`, `useCart.test.ts`, `CheckoutPage.test.tsx`. Tests of one file split by scenario add one lower-case variant right before the suffix (`Invoice.service.refund.spec.ts`). A variant never stands in for a word and appears only on test files.
- **Kept as the tool requires:** framework-fixed names (`index.ts`, entry files such as `main.ts`, `*.d.ts`, framework route files such as `page.tsx` or `layout.tsx`), tool configs at a package root (`vite.config.ts`, `eslint.config.mjs`), and generated code.
- Types-only and re-export-only files get no name: merge them into a neighbour (§4.4).
- **Project detail:** when the project profile has a `Naming:` line, that document adds the project's words, framework names and stricter rules (for example "word required" in a package). It never loosens this section. Without one, this section applies alone.
- **Existing files:** name new files and folders by this section. Rename an existing file only when your task says so. A rename changes paths and imports, not exported identifiers or public package entry points.

## 5. General

- Match the surrounding style and naming; where it conflicts with §4, new code follows §4 and old code stays.
- Stay in the task's scope; no drive-by refactors.
- Never read or edit `.env*` files (except `.env.example`).
