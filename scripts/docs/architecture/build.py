"""Builds the architecture pages in docs/architecture/.

Usage: pnpm docs:architecture (or python3 scripts/docs/architecture/build.py [repo root] [out dir]).
File lists and the module graph are read from the code; descriptions live in notes.py.
"""
import os
import shutil
import sys

sys.dont_write_bytecode = True  # no __pycache__ next to the script
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from lib import CSS, PAGES, diagram, esc, file_table, module_edges, page, scan, workspace_deps  # noqa: E402
from notes import API, FRONT  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else os.path.join(HERE, '..', '..', '..'))
OUT = os.path.abspath(sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, 'docs', 'architecture'))
API_SRC = 'apps/cms-api/src'
API_TEST = 'apps/cms-api/test'


def write(name, title, body, lead=''):
    with open(os.path.join(OUT, name), 'w', encoding='utf-8') as fh:
        fh.write(page(name, title, body, lead))


def table(head, rows):
    h = ''.join(f'<th>{c}</th>' for c in head)
    b = ''.join('<tr>' + ''.join(f'<td>{c}</td>' for c in r) + '</tr>' for r in rows)
    return f'<div class="tbl"><table><thead><tr>{h}</tr></thead><tbody>{b}</tbody></table></div>'


def files_under(base, include, exclude=()):
    """Files of base whose path starts with one of include and none of exclude."""
    out = []
    for rel in scan(ROOT, base):
        if include and not any(rel == i or rel.startswith(i.rstrip('/') + '/') for i in include):
            continue
        if any(rel.startswith(e) for e in exclude):
            continue
        out.append(rel)
    return out


# ---------------------------------------------------------------- live facts
EDGES = module_edges(ROOT)
WS = workspace_deps(ROOT)
COUNTS = {
    'cms-api': len(scan(ROOT, API_SRC)),
    'cms-admin': len(scan(ROOT, 'apps/cms-admin/src')),
    'web': len(scan(ROOT, 'apps/web/src')),
    'e2e': len(scan(ROOT, 'apps/e2e/src')),
    'form-commons': len(scan(ROOT, 'packages/form-commons/src')),
}
ARCH_SPECS = sorted(f for f in os.listdir(os.path.join(ROOT, 'apps/cms-api/test/architecture')) if f.endswith('.spec.ts'))

# ---------------------------------------------------------------- shared diagrams
SYSTEM_CONTEXT = """
flowchart LR
  visitor(["Visitor / Reviewer<br/>browser"])
  staff(["Owner / Admin / Editor<br/>browser"])
  subgraph k3s["K3s on one VPS - one replica per app"]
    traefik["Traefik<br/>TLS + host/path routing"]
    web["web<br/>Next.js 16 standalone :8080"]
    admin["cms-admin<br/>React 19 SPA on nginx :8080"]
    api["cms-api<br/>NestJS 11 :3000 /api/v1<br/>REST + read-only GraphQL"]
    init["cms-api init container<br/>deploy:migrate"]
    pg[("PostgreSQL 17<br/>public: Prisma<br/>content: Kysely")]
  end
  cloud["Cloudinary<br/>media storage"]
  smtp["SMTP<br/>OTP / invite mail"]
  turn["Cloudflare Turnstile<br/>bot check"]
  visitor -->|"domain.com"| traefik
  staff -->|"admin.domain.com"| traefik
  traefik -->|"/api/*"| api
  traefik -->|"everything else"| web
  traefik -->|"admin host"| admin
  web -->|"server-side GraphQL<br/>API_INTERNAL_URL"| api
  admin -.->|"browser REST + Bearer<br/>CORS admin origin"| api
  api --> pg
  init --> pg
  api --> cloud
  api --> smtp
  api --> turn
"""


def module_graph():
    labels = {
        'content-engine': 'content-engine', 'health': 'health', 'access-core': 'access core',
        'security-audit': 'security-audit', 'identity': 'identity', 'access-management': 'access management',
        'access-document-auth': 'access document-auth', 'content-types': 'content-types', 'media': 'media',
        'documents': 'documents', 'graphql': 'graphql', 'reviewer': 'reviewer',
    }
    lines = ['flowchart BT']
    for node, label in labels.items():
        if node in EDGES:
            lines.append(f'  {node.replace("-", "_")}["{label}"]')
    graph = {n: [t for t in ts if t != 'platform'] for n, ts in EDGES.items() if n != 'platform'}

    def reachable(start, skip_edge):
        seen, stack = set(), [start]
        while stack:
            n = stack.pop()
            for t in graph.get(n, []):
                if (n, t) == skip_edge or t in seen:
                    continue
                seen.add(t)
                stack.append(t)
        return seen

    for src, targets in graph.items():
        for t in targets:
            if t in reachable(src, (src, t)):
                continue  # implied by a longer path: drawn once, listed in the table
            style = '-.->' if (src, t) == ('security-audit', 'access-core') else '-->'
            lines.append(f'  {src.replace("-", "_")} {style} {t.replace("-", "_")}')
    return '\n'.join(lines)


def workspace_graph():
    lines = ['flowchart TB']
    for pkg in WS:
        nid = pkg.replace('/', '_').replace('-', '_')
        lines.append(f'  {nid}["{pkg}"]')
    names = {f'@abyss/{p.split("/")[1]}': p for p in WS}
    for pkg, deps in WS.items():
        for d in deps:
            if d in names:
                lines.append(f'  {pkg.replace("/", "_").replace("-", "_")} --> {names[d].replace("/", "_").replace("-", "_")}')
    lines.append('  apps_e2e -.->|"drives in a browser"| apps_cms_admin')
    lines.append('  apps_e2e -.->|"drives in a browser"| apps_web')
    return '\n'.join(lines)


# ================================================================ master page
def build_master():
    cards = ''.join(
        f'<a class="card" href="{f}" style="display:block;color:inherit"><h3 style="color:var(--accent)">{esc(label)}</h3>'
        f'<p class="muted" style="margin:0">{esc(sub)}</p></a>'
        for f, label, sub in PAGES[1:]
    )
    body = f"""
<div class="grid">
  <div class="card"><h3>What it is</h3><p style="margin:0">A headless CMS (cms-api + cms-admin) that serves CV / portfolio content defined by JSON schemas, plus the public site (web). It showcases RBAC + field-level masking, draft / publish with optimistic concurrency, an always-on security audit and a read-only reviewer mode.</p></div>
  <div class="card"><h3>Code size today</h3><dl class="kv">
    <dt>cms-api</dt><dd>{COUNTS['cms-api']} source files, {len(EDGES) - 1} modules</dd>
    <dt>cms-admin</dt><dd>{COUNTS['cms-admin']} source files</dd>
    <dt>web</dt><dd>{COUNTS['web']} source files</dd>
    <dt>form-commons</dt><dd>{COUNTS['form-commons']} source files</dd>
    <dt>e2e</dt><dd>{COUNTS['e2e']} helper files + specs</dd></dl>
    <p class="muted" style="margin:8px 0 0;font-size:13px">Tests are not counted.</p></div>
  <div class="card"><h3>Architectures in use</h3><ul style="margin:0;padding-left:18px">
    <li>Monorepo: pnpm workspaces + Turborepo</li>
    <li>cms-api: modular monolith, clean architecture (ports &amp; adapters) per module, guarded by architecture tests</li>
    <li>CQRS-style split in documents (command / query services)</li>
    <li>cms-admin: feature-sliced SPA with a feature registry</li>
    <li>web: Next.js App Router, Server Components, GraphQL reads</li>
    <li>Deploy: containers on K3s + Traefik, GitOps image bump</li></ul></div>
</div>

<h2 id="map">System map</h2>
{diagram(SYSTEM_CONTEXT, 'Who talks to whom in production. Dashed: the admin SPA calls the API from the browser, cross-origin.')}

<h2 id="pages">Pages</h2>
<p class="lead">Read them in this order the first time. Every page has a filterable file table where it lists files.</p>
<div class="grid">{cards}</div>

<h2 id="adr">Architecture decisions (docs/adr)</h2>
{table(['ADR', 'Decision', 'Status'], [
    ['<code>0001</code>', 'Pin TypeScript 6.0.3 in every package; tsconfig valid for 6.x and 7.x', 'accepted'],
    ['<code>0002</code>', 'accounts (role_id, role_slug) composite FK to roles (id, slug)', 'accepted'],
    ['<code>0003</code>', 'Read-only GraphQL gateway over the REST document read path', 'proposed (GraphQL itself decided)'],
    ['<code>0004</code>', 'web on Next.js App Router, standalone output, GraphQL server reads', 'accepted'],
    ['<code>0005</code>', 'One-time owner setup route guarded by OWNER_SETUP_TOKEN', 'accepted'],
    ['<code>0006</code>', 'Clean-architecture layers inside each cms-api module', 'implemented 2026-10-26'],
    ['<code>0007</code>', 'Frontend micro-frontend approach (options)', 'proposed'],
    ['<code>0008</code>', 'File naming: kebab-case folders, &lt;PascalName&gt;.&lt;function&gt;.&lt;ext&gt; files', 'accepted (renames in progress)'],
    ['<code>0009</code>', 'cms-api uses NestJS CLI defaults (nest build / start)', 'proposed'],
])}
<p class="muted">Sources: <code>SPEC.md</code> (the authority), <code>docs/adr/*</code>, <code>docs/modules/*</code>, <code>docs/ci-cd.md</code>, <code>docs/local-run.md</code>, <code>docs/deployment/*</code>.</p>
"""
    write('project-architecture.html', 'Abyss project architecture', body,
          'Master page. Start here for the big picture, then open the topic pages on the left.')


# ================================================================ 01 system
def build_system():
    actors = table(['Actor', 'How they get in', 'Can do (v1)'], [
        ['Anonymous', 'nothing', 'Read <b>published</b> content through the <code>public</code> role field profile'],
        ['Reviewer', 'Self-service session (Turnstile + rate limit), 24 h, when the owner enables it', 'Read published content through the <code>reviewer</code> profile, preset media. No writes, no drafts'],
        ['Editor (rank 30)', 'Invitation', 'Permissions granted to the role'],
        ['Admin (rank 40)', 'Invitation', 'Manage accounts / roles / tokens strictly below rank 40, plus content permissions'],
        ['Owner (rank 100)', 'One-time setup page with the setup token, or <code>owner:bootstrap</code>', 'Everything'],
        ['API token', 'Created by an admin / owner session', '&le; creator\'s current permissions, content endpoints only'],
    ])
    stack = table(['Area', 'Choice'], [
        ['Monorepo', 'pnpm 11 workspaces + Turborepo 2, Node &ge; 24'],
        ['API', 'NestJS 11 on Express, TypeScript strict'],
        ['Core persistence', 'Prisma 7 (schema <code>public</code>) via <code>@prisma/adapter-pg</code>'],
        ['Content persistence', 'Generated SQL migrations in schema <code>content</code>, queries through Kysely'],
        ['Auth', 'passport-jwt (HS256 pinned), argon2 (Argon2id), otplib (TOTP)'],
        ['GraphQL', 'graphql-js with an in-house handler, no Apollo / Yoga'],
        ['Admin', 'React 19 + Vite SPA on nginx, Redux Toolkit (session/UI), TanStack Query, Axios, REST'],
        ['Web', 'Next.js 16 App Router, standalone, Server Components, GraphQL server reads, Tailwind v4'],
        ['UI kit', '<code>@abyss/form-commons</code>: shadcn/ui + Tailwind, react-hook-form + Zod, Tiptap, CodeMirror 6'],
        ['Media', 'Cloudinary, sharp re-encoding, file-type magic bytes'],
        ['Bot protection', 'Cloudflare Turnstile (server-side verify)'],
        ['Tests', 'Jest + Supertest + Testcontainers (API), Vitest + Testing Library (UI), Playwright (e2e)'],
    ])
    apps = table(['Workspace', 'What it is', 'Depends on'], [
        [f'<code>{esc(p)}</code>', {
            'apps/cms-api': 'Headless CMS API: REST + read-only GraphQL, CLIs for migrations and owner setup',
            'apps/cms-admin': 'Admin console SPA (content, media, access, reviewer, security)',
            'apps/web': 'Public CV site + reader login + reviewer entry',
            'apps/e2e': 'Playwright suite run against the smoke stack (local only)',
            'packages/base-config': 'Shared ESLint, oxlint and Prettier config',
            'packages/form-commons': 'UI kit: shadcn base and form components, built to dist/',
        }.get(p, ''), ', '.join(f'<code>{esc(d)}</code>' for d in deps) or '—'] for p, deps in WS.items()
    ])
    body = f"""
<h2 id="actors">Actors and threat model</h2>
{actors}
<h2 id="context">System context</h2>
{diagram(SYSTEM_CONTEXT)}
<h2 id="monorepo">Monorepo</h2>
<p>Workspaces from <code>pnpm-workspace.yaml</code>; edges read from each <code>package.json</code>.</p>
{diagram(workspace_graph(), 'Arrow = depends on (workspace:*).')}
{apps}
<h3>Turborepo tasks (turbo.json)</h3>
{table(['Task', 'Depends on', 'Notes'], [
    ['<code>build</code>', '<code>^build</code>, <code>db:generate</code>', 'inputs exclude docs and tests, so a docs/test-only change builds no new image'],
    ['<code>test</code>, <code>lint</code>, <code>typecheck</code>', '<code>^build</code>, <code>db:generate</code>', 'form-commons dist/ is built first'],
    ['<code>db:generate</code>', '—', 'Prisma client into <code>src/generated</code>'],
])}
<h2 id="stack">Tech stack</h2>
{stack}
<h2 id="tree">Repository layout</h2>
<pre class="code">abyss/
├─ apps/
│  ├─ cms-api/        NestJS API · prisma/ · content/ (schemas, migrations, schema.graphql) · test/
│  ├─ cms-admin/      React SPA · nginx.conf · Dockerfile
│  ├─ web/            Next.js site · Dockerfile
│  └─ e2e/            Playwright specs + helpers
├─ packages/
│  ├─ form-commons/   UI kit (tsup → dist/)
│  └─ base-config/    lint / format config
├─ docs/              adr/ · modules/ · deployment/ · ci-cd.md · local-run.md · architecture/ (these pages)
├─ scripts/           dev-stack.sh · smoke.sh · smoke/ · stack/ · e2e-spec.sh
├─ .github/           workflows (ci, cms-api, app-checks, _publish) · scripts
├─ docker-compose.dev.yml     Postgres + Mailpit for the dev stack
├─ docker-compose.smoke.yml   full prod-like stack behind Traefik (local only)
├─ SPEC.md            the spec (authority over everything else)
└─ turbo.json · pnpm-workspace.yaml · tsconfig.base.json</pre>
"""
    write('01-system-overview.html', 'System & monorepo', body,
          'What the system is, who uses it, and how the repository is split into apps and packages.')


# ================================================================ 02 cms-api architecture
def build_api_arch():
    layers = """
flowchart TB
  subgraph mod["src/modules/‹module›"]
    http["http/<br/>controllers, guards, Zod *.requests.ts,<br/>response mapping"]
    cli["cli/<br/>CLI entry points"]
    jobs["jobs/<br/>interval jobs"]
    app["application/<br/>use cases + ports (interfaces, DI tokens)"]
    dom["domain/<br/>entities, rules, domain errors<br/>plain TypeScript"]
    adp["adapters/<br/>Prisma / Kysely repositories,<br/>Cloudinary, sharp, Turnstile ..."]
    wire["‹Module›.module.ts + index.ts<br/>Nest wiring + public facade"]
  end
  plat["platform: common/ config/ infrastructure/"]
  other["other modules (via index.ts only)"]
  http --> app
  http --> dom
  cli --> app
  cli --> adp
  jobs --> app
  app --> dom
  adp -. "implements ports" .-> app
  adp --> dom
  wire --> http
  wire --> adp
  wire --> app
  app --> other
  http --> other
  app --> plat
  adp --> plat
"""
    rules = table(['Layer', 'May import', 'Must not import'], [
        ['<code>domain/</code>', 'own <code>domain/</code>; other facades with <code>import type</code> only (except named pure helpers); pure platform; packages <code>zod</code>, <code>sanitize-html</code>, <code>createHash</code>', '<code>process.env</code>, <code>new Date()</code>, <code>Date.now(</code>, any other package'],
        ['<code>application/</code>', 'own domain + application, other facades (not their http exports), pure platform, platform ports, <code>config/</code>; from Nest only <code>Injectable</code>, <code>Inject</code>', '<code>express</code>, <code>@prisma/*</code>, <code>src/generated</code>, <code>kysely</code>, <code>pg</code>, <code>passport*</code>, <code>process.env</code>, time calls'],
        ['<code>adapters/</code>', 'own domain / application / adapters, facades, platform ports and adapters, <code>config/</code>, <code>src/generated</code>, any package', 'own <code>http/</code>'],
        ['<code>http/</code>', 'own domain / application / http, facades incl. exported guards, HTTP pipeline, <code>config/</code>', '<code>@prisma/*</code>, <code>kysely</code>, <code>pg</code>'],
        ['<code>cli/</code>', 'own domain / application / adapters / cli, facades, platform adapters, any package (builds adapters and hands them to use cases)', 'own <code>http/</code>'],
        ['<code>jobs/</code>', 'own domain / application / jobs, facades, <code>infrastructure/scheduling</code>; Nest <code>Injectable</code>, <code>Inject</code>, <code>Logger</code>, lifecycle hooks', '<code>express</code>, <code>@prisma/*</code>, <code>kysely</code>, <code>pg</code>, <code>passport*</code>'],
        ['wiring', 'anything in the module', 'a facade never exports <code>adapters/</code> (except <code>loadDefinitions</code>)'],
    ])
    pipeline = """
flowchart LR
  req(["HTTP request"]) --> sh["securityHeaders<br/>CSP, HSTS, nosniff"] --> rid["requestId"] --> ck["cookieParser"]
  ck --> bl["body limits<br/>/graphql 32 KiB, bulk 1 MB"] --> cors["CORS<br/>admin origin only"] --> nest["Nest router<br/>prefix /api/v1"]
  nest --> guards["Guards<br/>Throttle, Jwt / DocumentAuth / ApiToken,<br/>Permission, AllowedOrigin"]
  guards --> ctl["Controller<br/>Zod request parsing"] --> uc["Use case<br/>application/"]
  uc --> dom["domain rules"]
  uc --> ports["ports"]
  ports -.-> adapters["adapters<br/>Prisma / Kysely / SDKs"]
  ctl --> ok(["response body"])
  uc -->|"DomainError"| filter["HttpExceptionFilter"]
  guards -->|"401 / 403 / 404 / 429"| filter
  filter --> err(["statusCode, errorCode,<br/>message, details, requestId"])
"""
    tx = """
sequenceDiagram
  participant UC as Use case
  participant TR as TransactionRunner port
  participant AD as Prisma or Kysely runner
  participant DB as PostgreSQL
  participant AC as afterCommit callbacks
  UC->>TR: run(work)
  TR->>AD: begin transaction
  AD->>DB: BEGIN
  AD->>UC: work(unit of work)
  UC->>AD: repository calls with the same unit
  UC->>AD: audit.record(unit, row) in the same transaction
  UC->>AC: unit.afterCommit(cache invalidation, activity)
  AD->>DB: COMMIT
  AD->>AC: run callbacks only after commit
  AD-->>UC: result
"""
    modules_rows = [
        ['platform', '<code>common/ config/ infrastructure/ generated/</code>', 'Pipeline, config, shared ports and adapters'],
        ['content-engine', 'JSON schema → definition → SQL migrations, tree repository', 'platform'],
        ['health', 'Liveness / readiness', 'platform'],
        ['access core', 'Policy evaluation, actor context, roles, masking, serializer, guards', 'platform, content-engine'],
        ['security-audit', 'Always-on audit log (D15)', 'platform, access core (types only)'],
        ['identity', 'Owner setup, login, refresh, OTP, TOTP, password, CLIs', 'platform, access core, security-audit'],
        ['access management', 'Accounts, roles, API tokens admin', 'platform, access core, identity, security-audit'],
        ['access document-auth', 'DocumentAuthGuard: JWT, API token or anonymous', 'platform, access core, identity'],
        ['content-types', 'Read-only catalog filtered by permissions', 'platform, content-engine, access core, identity (auth guard only)'],
        ['media', 'Upload pipeline, library, references, safe delete', 'platform, content-engine, access core, identity (auth guard only), security-audit'],
        ['documents', 'CRUD, OCC 409, publish, presence, bulk', 'platform, content-engine, access core, document-auth, media'],
        ['graphql', 'Read-only GraphQL over document reads', 'platform, content-engine, access core, document-auth, documents'],
        ['reviewer', 'Reviewer toggle, sessions, cleanup', 'platform, access core, identity, security-audit'],
    ]
    specs = ''.join(f'<li><code>{esc(s)}</code></li>' for s in ARCH_SPECS)
    body = f"""
<h2 id="style">Style: modular monolith + clean architecture</h2>
<p>One NestJS process. Business features are <b>modules</b> under <code>src/modules/</code>; each module is split into <b>layers</b> (ADR 0006). Dependencies point inward: HTTP, CLI and jobs call use cases; use cases depend on domain rules and on <b>ports</b> (interfaces + DI tokens); adapters implement those ports with Prisma, Kysely or SDKs; the module file binds ports to adapters. Modules talk to each other only through their <code>index.ts</code> facade and only along the allowed edges.</p>
{diagram(layers, 'Layers inside one module. Dashed: adapters implement the ports declared in application/.')}
<h3>Layer rules (SPEC §2, <code>LayerRules.constants.ts</code>)</h3>
{rules}
<h3>Platform folders by role</h3>
{table(['Role', 'Folders'], [
    ['pure', '<code>common/{constants,errors,time,types,validation}</code>'],
    ['HTTP pipeline', '<code>common/{http,middleware,filters,guards,rate-limit}</code>'],
    ['ports', '<code>infrastructure/**/*.port.ts</code>'],
    ['job runner', '<code>infrastructure/scheduling/</code>'],
    ['adapters', 'every other <code>infrastructure/</code> file'],
])}

<h2 id="modules">Module dependency graph</h2>
<p>Read live from <code>ALLOWED_MODULE_EDGES</code>. Every module also depends on <code>platform</code> (not drawn). Dashed = <code>import type</code> only. <code>content-types</code> and <code>media</code> may use only <code>JwtAuthGuard</code> and <code>AuthenticatedRequest</code> from identity.</p>
{diagram(module_graph(), 'Arrow = may import (through index.ts). Edges implied by a longer path are left out of the picture; the table below lists every allowed edge. No cycles.')}
{table(['Module', 'Responsibility', 'Depends on'], modules_rows)}
<p>Composition root: <code>App.module.ts</code> imports Config, Clock, Logging, ClientIp, RateLimit and the feature modules Health, Identity, AccessManagement, ContentTypes, Documents, Graphql, Media, Reviewer (each imports what it needs below it).</p>

<h2 id="pipeline">Request pipeline</h2>
{diagram(pipeline, 'configureApp() in App.setup.ts is shared by main.ts and the integration tests, so tests run the production pipeline.')}

<h2 id="errors">Error model</h2>
<p>Domain and application code throw <code>DomainError</code> (<code>common/errors/Domain.errors.ts</code>) with a kind and an <code>errorCode</code>; they never throw Nest HTTP exceptions. <code>HttpExceptionFilter</code> maps every error to one body: <code>{{ statusCode, errorCode, message, details?, requestId }}</code>. GraphQL keeps its own envelope but reuses the same codes.</p>

<h2 id="tx">Transactions, audit and afterCommit</h2>
<p>Two runners behind one port: <code>CORE_TRANSACTION_RUNNER</code> (Prisma, schema <code>public</code>) and <code>CONTENT_TRANSACTION_RUNNER</code> (Kysely, schema <code>content</code>). Security audit rows are written with the same unit of work, so an action and its audit row commit together (D15). Side effects that must not run on rollback (cache invalidation, activity tracking) are registered with <code>afterCommit</code>.</p>
{diagram(tx)}

<h2 id="guards">How the rules are enforced</h2>
<p>The architecture specs in <code>test/architecture/</code> parse the import graph and fail the build on any edge or layer violation, unknown file name, unguarded handler or hard-coded role slug:</p>
<ul class="toc">{specs}</ul>
"""
    write('02-cms-api-architecture.html', 'cms-api architecture', body,
          'How the API is organised: layers inside modules, the module graph, the request pipeline, errors and transactions.')


# ================================================================ module pages
MODULES = {
    'access-core': ('access core', 'modules/access', ['modules/access/management', 'modules/access/document-auth'],
                    'Policy evaluation and everything that decides who may read or write what: actor context, system roles and default permissions, subject catalog, field projection and masking, record serializer, write allowlist, revocation versions, permission and API-token guards, rank rules.',
                    'No routes of its own; its guards protect every other module.'),
    'security-audit': ('security-audit', 'modules/security-audit', [],
                       'Always-on security audit log (D15): login success / failure, 2FA and password changes, role / permission / account changes, token create / revoke, reviewer toggle, media delete, owner creation, rejected setup attempts, seeded accounts. Metadata stores field names, never values; emails as HMAC.',
                       '<code>GET /audit-logs</code> (owner)'),
    'identity': ('identity', 'modules/identity', [],
                 'Owner bootstrap (CLI + one-time setup route), smoke seed CLI, invitation acceptance, login, refresh rotation and session revocation, access tokens (incl. reviewer tokens), OTP, TOTP 2FA, password lifecycle, auth rate limits.',
                 '<code>/auth/login</code>, <code>/auth/2fa/*</code>, <code>/auth/refresh</code>, <code>/auth/logout</code>, <code>/auth/me</code>, <code>/auth/password/*</code>, <code>/setup/status</code>, <code>/setup/owner</code>'),
    'access-management': ('access management', 'modules/access/management', [],
                          'Admin endpoints and use cases for accounts, roles and API tokens, with rank rules (D6) and token subset checks (D5).',
                          '<code>/accounts*</code>, <code>/roles*</code>, <code>/api-tokens*</code>'),
    'access-document-auth': ('access document-auth', 'modules/access/document-auth', [],
                             'DocumentAuthGuard for document reads: no credentials = anonymous public actor, <code>ak_live_</code> = API token, otherwise JWT. A present but invalid credential is always 401.',
                             'Used by documents and graphql.'),
    'content-engine': ('content-engine', 'modules/content-engine', [],
                       'One engine for all content types: JSON schema → validated definition → generated SQL migration in schema <code>content</code>, migration runner, content-type registry and the tree repository (root rows + component tables).',
                       'CLIs <code>content:generate</code>, <code>content:migrate</code>'),
    'content-types': ('content-types', 'modules/content-types', [],
                      'Read-only content-type catalog filtered by the caller\'s permissions (feeds the admin permission matrix and editor).',
                      '<code>GET /content-types</code>, <code>GET /content-types/:slug</code>'),
    'documents': ('documents', 'modules/documents', [],
                  'Document CRUD with optimistic concurrency (409 with masked diff), draft / publish deep clone, presence, bulk operations for collections. Split into a command service and a query service; the query service is also the GraphQL read path.',
                  '<code>/documents/:slug</code>, <code>/:documentId</code>, <code>/publish</code>, <code>/unpublish</code>, <code>/presence</code>, <code>/bulk/*</code>'),
    'graphql': ('graphql', 'modules/graphql', [],
                'Read-only GraphQL over document reads (D18). Schema generated from content definitions; same guard, authz, masking and error codes as REST.',
                '<code>POST /graphql</code>, CLI <code>graphql:print-schema</code>'),
    'media': ('media', 'modules/media', [],
              'Upload pipeline (magic bytes, size limits, sharp re-encode, SHA-256, UUIDv7 keys), storage port (Cloudinary or fake), file library, media references in documents, safe soft delete and purge job.',
              '<code>POST /media</code>, <code>GET /media</code>, <code>PATCH /media/:id</code>, <code>DELETE /media/:id</code>'),
    'reviewer': ('reviewer', 'modules/reviewer', [],
                 'Reviewer mode: owner toggle, self-service session with Turnstile and rate limits, ephemeral reviewer accounts, owner session log, cleanup job.',
                 '<code>GET /reviewer/status</code>, <code>POST /reviewer/sessions</code>, <code>GET /reviewer/sessions</code>, <code>PUT /reviewer/settings</code>'),
    'health': ('health', 'modules/health', [],
               'Liveness and readiness.', '<code>GET /health/live</code>, <code>GET /health/ready</code>'),
}


def module_section(node):
    title, base, exclude, resp, routes = MODULES[node]
    rows = files_under(API_SRC, [base], exclude)
    deps = [d for d in EDGES.get(node, []) if d != 'platform']
    dependents = sorted(n for n, ts in EDGES.items() if node in ts)
    rel_rows = [r[len(base) + 1:] for r in rows]
    tid = 'ft-' + node
    layers_present = sorted({p.split('/')[0] for p in rel_rows if '/' in p})
    return f"""
<details class="mod" open id="{node}"><summary>{esc(title)} <span class="muted" style="font-weight:400">· <code>src/{esc(base)}</code> · {len(rows)} files</span></summary>
<div class="body">
<p>{resp}</p>
<dl class="kv">
  <dt>Routes / entry points</dt><dd>{routes}</dd>
  <dt>Depends on</dt><dd>platform{''.join(', ' + esc(d) for d in deps)}</dd>
  <dt>Used by</dt><dd>{esc(', '.join(dependents)) or '— (composition root only)'}</dd>
  <dt>Layer folders</dt><dd>{esc(', '.join(layers_present))}</dd>
</dl>
{file_table(tid, rows_rel(base, rows), ROOT, API_SRC + '/' + base, API)}
</div></details>"""


def rows_rel(base, rows):
    return [r[len(base) + 1:] for r in rows]


def build_platform():
    groups = [
        ('root', 'Composition root', [], 'Entry, bootstrap, app module and HTTP pipeline. May import any module.'),
        ('common', 'common/', ['common'], 'Pure helpers and the HTTP pipeline (constants, errors, time, types, validation, http, middleware, filters, guards, rate-limit).'),
        ('config', 'config/', ['config'], 'Env validation with Zod; the app refuses to start on any error and logs a redacted summary.'),
        ('infrastructure', 'infrastructure/', ['infrastructure'], 'Shared ports and adapters: database (Prisma client, transaction runners, afterCommit), logging, mail, scheduling.'),
        ('contract', 'contract/', ['contract'], 'Public constants contract for the frontends, checked in CI.'),
        ('architecture', 'test/architecture/', ['architecture'], 'Analyzers and constants used by the architecture specs. Test code outside src/, so it is not product code and not built into dist.'),
    ]
    parts = []
    for gid, title, inc, desc in groups:
        if gid == 'root':
            rows = [r for r in scan(ROOT, API_SRC) if '/' not in r]
            base = API_SRC
            rel = rows
        else:
            base = API_TEST if gid == 'architecture' else API_SRC
            rows = files_under(base, inc)
            rel = rows
        parts.append(f"""
<details class="mod" open id="{gid}"><summary>{esc(title)} <span class="muted" style="font-weight:400">· {len(rows)} files</span></summary>
<div class="body"><p>{desc}</p>{file_table('ft-' + gid, rel, ROOT, base, API, show_layer=False)}</div></details>""")
    ports = """
classDiagram
  direction LR
  class TransactionRunner {
    <<interface>>
    run(work) Promise
  }
  class UnitOfWork {
    <<interface>>
    afterCommit(callback)
  }
  class MailSender {
    <<interface>>
    send(message)
  }
  class AppLogger {
    <<interface>>
    log() warn() error()
  }
  class Clock {
    now() number
  }
  class ThrottleSubjectResolver {
    <<interface>>
  }
  PrismaTransactionRunner ..|> TransactionRunner : CORE
  KyselyContentTransactionRunner ..|> TransactionRunner : CONTENT
  ConsoleMailSender ..|> MailSender
  SmtpMailSender ..|> MailSender
  NestAppLogger ..|> AppLogger
  ActorThrottleSubjectResolver ..|> ThrottleSubjectResolver
  TransactionRunner --> UnitOfWork : hands out
"""
    body = f"""
<p><code>platform</code> never imports <code>src/modules/**</code>. Modules use it freely within their layer rules.</p>
{diagram(ports, 'Platform ports and the adapters bound to them. KyselyContentTransactionRunner lives in content-engine; ActorThrottleSubjectResolver in access.')}
{''.join(parts)}
"""
    write('03-cms-api-platform.html', 'cms-api platform', body,
          'Everything in cms-api that is not a feature module: composition root, common, config, infrastructure, contract and the architecture guards.')


def build_access_identity():
    sections = ''.join(module_section(n) for n in ('access-core', 'security-audit', 'identity', 'access-management', 'access-document-auth'))
    body = f"""
<p>Dependency order: access core → security-audit → identity → (access management, access document-auth). Core never imports identity; only management and document-auth do.</p>
<ul class="toc"><li><a href="#access-core">access core</a></li><li><a href="#security-audit">security-audit</a></li><li><a href="#identity">identity</a></li><li><a href="#access-management">access management</a></li><li><a href="#access-document-auth">access document-auth</a></li></ul>
{sections}
"""
    write('04-modules-access-identity.html', 'Access & identity modules', body,
          'Who may do what, how people sign in, and the audit trail. Each section lists every file with its layer and meaning.')


def build_content_modules():
    order = ('content-engine', 'content-types', 'documents', 'graphql', 'media', 'reviewer', 'health')
    toc = ''.join(f'<li><a href="#{n}">{esc(MODULES[n][0])}</a></li>' for n in order)
    body = f"""
<ul class="toc">{toc}</ul>
{''.join(module_section(n) for n in order)}
"""
    write('05-modules-content.html', 'Content modules', body,
          'The content engine and everything that reads or writes documents and media, plus reviewer mode and health.')


# ================================================================ 06 data model
def build_data():
    core = """
erDiagram
  ROLES ||--o{ ACCOUNTS : "role_id + role_slug (composite FK)"
  ROLES ||--o{ PERMISSIONS : grants
  ACCOUNTS ||--o{ REFRESH_TOKENS : owns
  REFRESH_TOKENS |o--o{ REFRESH_TOKENS : replaced_by
  ACCOUNTS ||--o{ OTP_CODES : has
  ACCOUNTS ||--o{ API_TOKENS : creates
  ACCOUNTS ||--o{ REVIEWER_SESSIONS : "ephemeral reviewer"
  ACCOUNTS |o--o{ FILE_LIBRARY : created_by
  ACCOUNTS |o--o{ AUDIT_LOGS : actor
  ACCOUNTS |o--o{ APP_SETTINGS : updated_by
  ROLES {
    int id PK
    string slug UK
    string name
    int rank
    bool is_system
    int policy_version
  }
  ACCOUNTS {
    int id PK
    uuid document_id UK
    citext email UK
    string password_hash
    string display_name
    int role_id FK
    string role_slug FK
    enum status
    int token_version
    bool is_2fa_enabled
    enum two_fa_method
    string totp_secret_enc
    timestamptz deleted_at
  }
  PERMISSIONS {
    int id PK
    int role_id FK
    string subject
    enum action
    jsonb readable_fields
    jsonb writable_fields
    jsonb conditions
  }
  REFRESH_TOKENS {
    int id PK
    int account_id FK
    uuid family_id
    string token_hash UK
    int replaced_by_id FK
    timestamptz expires_at
    timestamptz revoked_at
  }
  OTP_CODES {
    int id PK
    int account_id FK
    enum purpose
    string code_hmac
    int attempts
    timestamptz expires_at
    timestamptz used_at
  }
  API_TOKENS {
    int id PK
    string token_prefix
    string token_hash UK
    int created_by_id FK
    jsonb scope
    timestamptz expires_at
    timestamptz revoked_at
  }
  REVIEWER_SESSIONS {
    int id PK
    int account_id FK
    string visitor_role
    jsonb purpose_tags
    string ip_hmac
    timestamptz expires_at
  }
  FILE_LIBRARY {
    int id PK
    uuid document_id UK
    string storage_key UK
    string sha256
    string mime_type
    enum provider
    timestamptz deleted_at
  }
  AUDIT_LOGS {
    bigint id PK
    int actor_id FK
    enum actor_type
    string action
    string subject
    jsonb metadata
  }
  APP_SETTINGS {
    int id PK
    string key UK
    jsonb value
  }
"""
    content = """
erDiagram
  CONTENT_TYPES_REGISTRY ||--o{ CV_PAGE : defines
  CONTENT_TYPES_REGISTRY ||--o{ PROFILE : defines
  CV_PAGE ||--o{ CV_PAGE__SKILL : parent_id
  CV_PAGE ||--o{ CV_PAGE__EXPERIENCE : parent_id
  CV_PAGE__EXPERIENCE ||--o{ CV_PAGE__EXPERIENCE__ROLE : parent_id
  CV_PAGE ||--o{ CV_PAGE__PROJECT : parent_id
  CV_PAGE ||--o{ CV_PAGE__EDUCATION : parent_id
  CV_PAGE ||--o{ CV_PAGE__LANGUAGE : parent_id
  CV_PAGE ||--o{ CV_PAGE__REFERENCE : parent_id
  CONTENT_TYPES_REGISTRY {
    string slug UK
    enum kind
    bool draft_and_publish
    jsonb definition
    string definition_hash
  }
  CONTENT_MIGRATIONS {
    string name PK
    string checksum
    timestamptz applied_at
  }
  CV_PAGE {
    int id PK
    uuid document_id
    int version
    timestamptz published_at
    string locale
    string fields "from cv-page.json"
  }
  CV_PAGE__EXPERIENCE {
    int id PK
    uuid component_uid
    int parent_id FK
    int order_index
    string fields
  }
  CV_PAGE__EXPERIENCE__ROLE {
    int id PK
    uuid component_uid
    int parent_id FK
    int order_index
  }
  PROFILE {
    int id PK
    uuid document_id
    int version
    timestamptz published_at
    string name
    uuid photo "media"
  }
"""
    hex_docs = """
classDiagram
  direction LR
  class DocumentsController
  class DocumentsCommandService {
    create()
    update()
  }
  class DocumentsQueryService {
    list()
    get()
  }
  class PublishService {
    publish()
    unpublish()
    remove()
  }
  class AccessPolicyService {
    policy()
  }
  class ContentRegistry {
    registry()
  }
  class DocumentRepository {
    <<interface>>
    lockRow()
    loadTrees()
    insertTree()
    deleteRows()
  }
  class TransactionRunner {
    <<interface>>
    run(work)
  }
  class ActivityRecorder {
    <<interface>>
  }
  class KyselyDocumentRepository
  class KyselyContentTransactionRunner
  class Clock
  DocumentsController --> DocumentsCommandService
  DocumentsController --> DocumentsQueryService
  DocumentsController --> PublishService
  PublishService --> AccessPolicyService
  PublishService --> ContentRegistry
  PublishService --> DocumentRepository
  PublishService --> TransactionRunner
  PublishService --> ActivityRecorder
  PublishService --> Clock
  KyselyDocumentRepository ..|> DocumentRepository
  KyselyContentTransactionRunner ..|> TransactionRunner
"""
    hex_identity = """
classDiagram
  direction LR
  class AuthController
  class AuthService {
    login()
    startSession()
    refresh()
    logout()
    me()
  }
  class RefreshTokenService {
    issue()
    rotate()
    revokeFamilyOf()
  }
  class AccessTokenService {
    signAccessToken()
    signTwoFactorTempToken()
    signReviewerSessionToken()
  }
  class SecurityAuditService {
    record()
    recordStandalone()
    emailHmac()
  }
  class AccountRepository {
    <<interface>>
  }
  class RefreshTokenRepository {
    <<interface>>
  }
  class AuditRecorder {
    <<interface>>
  }
  class TransactionRunner {
    <<interface>>
  }
  AuthController --> AuthService
  AuthService --> AccountRepository
  AuthService --> TransactionRunner
  AuthService --> AccessTokenService
  AuthService --> RefreshTokenService
  AuthService --> SecurityAuditService
  RefreshTokenService --> RefreshTokenRepository
  PrismaAccountRepository ..|> AccountRepository
  PrismaRefreshTokenRepository ..|> RefreshTokenRepository
  SecurityAuditService ..|> AuditRecorder
  PrismaTransactionRunner ..|> TransactionRunner
"""
    hex_media = """
classDiagram
  direction LR
  class MediaController
  class UploadMediaService {
    upload()
  }
  class MediaLibraryService {
    list()
    updateAlt()
    remove()
  }
  class PurgeDeletedMediaService {
    run()
  }
  class MediaPurgeJob
  class UploadProcessor {
    <<interface>>
    receive()
    prepare()
  }
  class MediaStorage {
    <<interface>>
    put()
    delete()
  }
  class MediaRepository {
    <<interface>>
  }
  class MediaReferenceChecker {
    <<interface>>
  }
  MediaController --> UploadMediaService
  MediaController --> MediaLibraryService
  MediaPurgeJob --> PurgeDeletedMediaService
  UploadMediaService --> UploadProcessor
  UploadMediaService --> MediaStorage
  UploadMediaService --> MediaRepository
  MediaLibraryService --> MediaReferenceChecker
  MediaLibraryService --> MediaRepository
  PurgeDeletedMediaService --> MediaStorage
  UploadProcessingAdapter ..|> UploadProcessor
  CloudinaryAdapter ..|> MediaStorage
  FakeAdapter ..|> MediaStorage
  PrismaMediaRepository ..|> MediaRepository
  MediaReferenceAdapter ..|> MediaReferenceChecker
"""
    actor = """
classDiagram
  class ActorContext {
    kind
    roleSlug
    roleRank
  }
  class PolicyEvaluator {
    can(actor, action, subject)
    rowFilter(actor, action, subject)
  }
  class FieldProjection
  class RecordSerializer {
    serialize(record)
    maskedFields
  }
  class WriteAllowlist
  class Conditions {
    validate(dsl)
    compile(dsl)
  }
  PolicyEvaluator --> ActorContext
  PolicyEvaluator --> Conditions
  FieldProjection --> PolicyEvaluator
  RecordSerializer --> FieldProjection
  WriteAllowlist --> PolicyEvaluator
"""
    body = f"""
<h2 id="core">Core schema <code>public</code> (Prisma)</h2>
<p>Every table has <code>id</code>, <code>created_at</code>, <code>updated_at</code>; user-facing tables also have a UUIDv7 <code>document_id</code>. <code>created_by</code> / <code>updated_by</code> reference accounts with <code>ON DELETE SET NULL</code>. A partial unique index allows exactly one live owner (D1). Source: <code>apps/cms-api/prisma/schema.prisma</code>.</p>
{diagram(core, 'Main columns only.')}
<h2 id="content">Content schema <code>content</code> (generated, Kysely)</h2>
<p>Generated from <code>content/schemas/*.json</code>. A root table per type with <code>version</code> and <code>published_at</code>: at most one draft (<code>published_at IS NULL</code>) and one published row per <code>document_id</code> (partial unique indexes, D11). Components are tables <code>&lt;slug&gt;__&lt;path&gt;</code> (max depth 3) owned by their parent with <code>ON DELETE CASCADE</code>; no link tables. The registry lives in <code>content._content_types</code>, applied migrations in <code>content._migrations</code>.</p>
{diagram(content, 'cv-page produces 8 tables (root + 7 component tables); profile is a collection with a media field.')}
<h2 id="classes">Class diagrams: ports and adapters</h2>
<h3>documents</h3>
{diagram(hex_docs, 'Use cases depend on interfaces (ports); Kysely adapters implement them. Bound in Documents.module.ts.')}
<h3>identity</h3>
{diagram(hex_identity, 'AuditRecorder is bound to SecurityAuditService with useExisting in Identity.module.ts.')}
<h3>media</h3>
{diagram(hex_media, 'MediaStorage is Cloudinary in production and the in-memory fake in development and tests (MEDIA_PROVIDER).')}
<h3>access: the policy core (domain)</h3>
{diagram(actor, 'Pure domain rules: one decision point (PolicyEvaluator), one serializer for every payload that carries record data (D3).')}
<h2 id="dsl">Conditions DSL (ABAC)</h2>
<pre class="code">{{ "all": [ {{ "field": "createdBy", "op": "eq", "value": "$actor.id" }},
           {{ "field": "&lt;readable field&gt;", "op": "in", "value": [..] }} ] }}</pre>
<p>Operators <code>eq</code>, <code>ne</code>, <code>in</code>; variables <code>$actor.id</code>, <code>$actor.roleRank</code>. Anything else is rejected when the permission is saved; conditions compile to parameterized SQL only.</p>
"""
    write('06-data-model.html', 'Data model & classes', body,
          'Entity-relationship diagrams for both database schemas, and class diagrams showing how use cases, ports and adapters fit together.')


# ================================================================ 07 flows
def build_flows():
    login = """
sequenceDiagram
  actor U as User
  participant A as cms-admin / web
  participant C as AuthController
  participant S as AuthService
  participant R as AccountRepository
  participant T as RefreshTokenService
  participant DB as PostgreSQL
  U->>A: email + password
  A->>C: POST /api/v1/auth/login
  C->>S: login(credentials, clientMeta)
  S->>R: findLoginAccount(email)
  S->>S: exactly one Argon2id verify (dummy hash when unknown)
  alt unknown, wrong password or not active
    S->>DB: audit auth.login_failed (standalone row)
    S-->>C: DomainError invalid credentials
    C-->>A: 401 (same answer for unknown emails)
  else 2FA enabled
    S-->>C: tempToken + methods
    C-->>A: 200 requires2FA
    A->>C: POST /auth/2fa/verify (tempToken, code)
    Note over C,S: TwoFactorLogin checks the code, max 5 attempts, then startSession
  else password only
    S->>T: issue refresh token (CORE transaction)
    S->>DB: audit auth.login_succeeded (same transaction)
    S-->>C: accessToken + refreshToken
    C-->>A: 200 accessToken + Set-Cookie __Secure-abyss_rt
  end
  Note over A: access token kept in memory only, sent as Bearer
"""
    refresh = """
sequenceDiagram
  participant B as Browser
  participant G as AllowedOriginGuard
  participant C as AuthController
  participant T as RefreshTokenService
  participant DB as refresh_tokens
  B->>G: POST /auth/refresh (cookie + Origin)
  G->>C: Origin is in the allowlist
  C->>T: rotate(rawToken)
  T->>DB: findByHash(SHA-256) in a transaction
  alt unknown, revoked or expired
    T-->>C: invalid
    C-->>B: 401
  else token was already rotated
    alt inside the grace window
      T-->>C: grace: new access token, cookie left alone
    else reuse
      T->>DB: revoke the whole family, bump token_version, audit
      T-->>C: reuse
      C-->>B: 401
    end
  else current token
    T->>DB: insert successor, claimRotation(current to next)
    T-->>C: rotated
    C-->>B: new access token + rotated cookie
  end
"""
    tabs = """
sequenceDiagram
  participant T1 as Admin tab 1
  participant T2 as Admin tab 2
  participant L as Web Lock + BroadcastChannel
  participant API as cms-api
  T1->>API: GET /accounts (expired access token)
  API-->>T1: 401
  T2->>API: GET /media (expired access token)
  API-->>T2: 401
  T1->>L: take refresh lock
  T2->>L: wait for lock
  T1->>API: POST /auth/refresh (cookie)
  API-->>T1: new access token, rotated cookie
  T1->>L: broadcast token, release lock
  L-->>T2: token from tab 1, no own refresh
  T1->>API: retry GET /accounts once
  T2->>API: retry GET /media once
"""
    setup = """
sequenceDiagram
  actor O as Operator
  participant UI as cms-admin /setup
  participant C as OwnerSetupController
  participant S as OwnerSetupService
  participant B as bootstrapOwner()
  participant DB as PostgreSQL
  UI->>C: GET /setup/status
  C->>S: isOpen = token configured and no live owner
  C-->>UI: open true or false
  O->>UI: setup token, email, password
  UI->>C: POST /setup/owner
  C->>S: admit(token): SHA-256 + timingSafeEqual, before body parsing
  alt setup closed
    C-->>UI: 404, same as an unknown route
  else wrong token
    S->>DB: audit owner.setup_rejected
    C-->>UI: 401 SETUP_TOKEN_INVALID
  else token ok
    C->>B: create owner
    B->>DB: transaction + pg_advisory_xact_lock, owner exists? email taken?
    B->>DB: insert owner + audit owner.created (channel setup_page)
    C-->>UI: 201 email
  end
  Note over UI,C: no session is issued, the owner signs in on /auth/login
"""
    publish = """
sequenceDiagram
  actor E as Editor
  participant UI as cms-admin editor
  participant G as DocumentAuthGuard + PermissionGuard
  participant DC as DocumentsCommandService
  participant P as PublishService
  participant AP as AccessPolicyService
  participant R as KyselyDocumentRepository
  E->>UI: edit the draft
  UI->>G: PUT /documents/cv-page/:documentId (version)
  G->>DC: update allowed on cv-page
  DC->>AP: row filter + writable fields
  DC->>R: lock draft row
  alt version differs
    DC-->>UI: 409 DOCUMENT_VERSION_CONFLICT (masked server, submitted, diff)
    UI->>UI: ConflictMergeModal: merge and resubmit
  else same version
    DC->>R: replace tree, bump version
    DC-->>UI: 200 new version
  end
  E->>UI: Publish
  UI->>G: POST .../:documentId/publish (expectedVersion)
  G->>P: publish(actor, slug, documentId, expectedVersion)
  P->>AP: rowFilter(actor, publish, slug)
  P->>R: CONTENT transaction: lock draft and published rows
  P->>R: load draft tree, delete old published rows
  P->>R: insert deep clone with published_at, copy version
  P-->>UI: 200 documentId + version
  Note over P: activity recorder is told after commit, its failure never fails the request
"""
    gql = """
sequenceDiagram
  participant W as web server (Next.js)
  participant M as body limit 32 KiB
  participant DA as DocumentAuthGuard
  participant X as Graphql.executor
  participant RS as Document.resolver
  participant Q as DocumentsQueryService
  W->>M: POST /api/v1/graphql (anonymous, API_INTERNAL_URL)
  M->>DA: no Authorization header: public actor
  DA->>X: execute(query, variables, actor)
  X->>X: parse + limits (2000 tokens, depth 8, 5 roots, 500 nodes)
  X->>X: schema for the actor's readable types (hidden = unknown), validate
  X->>RS: root field per content type
  RS->>Q: get / list, exactly the REST read path
  Q-->>RS: serialized, masked record
  RS-->>X: data
  X-->>W: data + errors (REST error codes), no-store
  Note over W: cached by Next.js for WEB_REVALIDATE_SECONDS
"""
    upload = """
sequenceDiagram
  actor E as Editor
  participant C as MediaController
  participant U as UploadMediaService
  participant P as UploadProcessingAdapter
  participant S as MediaStorage
  participant R as PrismaMediaRepository
  E->>C: POST /media (multipart)
  C->>U: upload(actor, stream)
  U->>P: receive: size limit per kind
  U->>P: prepare: magic-byte allowlist, sharp re-encode strips EXIF, SHA-256
  U->>S: put(key = UUIDv7)
  U->>R: create file_library row
  alt row insert fails
    U->>S: delete(key), no orphan left
  end
  C-->>E: 201 media record
"""
    delete = """
sequenceDiagram
  participant C as MediaController
  participant L as MediaLibraryService
  participant RF as MediaReferenceAdapter
  participant R as PrismaMediaRepository
  participant J as MediaPurge job
  participant S as MediaStorage
  C->>L: DELETE /media/:id
  L->>RF: does any document reference it?
  alt referenced
    L-->>C: 409 MEDIA_IN_USE
  else free
    L->>R: soft delete + audit (one transaction)
    L-->>C: 204
  end
  loop every interval
    J->>R: soft-deleted files
    J->>S: delete cloud object
  end
"""
    reviewer = """
sequenceDiagram
  actor V as Visitor
  participant W as web ReviewerAccessDialog
  participant C as ReviewerController
  participant S as ReviewerAccessService
  participant T as Cloudflare Turnstile
  participant DB as PostgreSQL
  participant D as documents / graphql
  W->>C: GET /reviewer/status
  V->>W: role, purposes, notes, human check
  W->>C: POST /reviewer/sessions
  C->>S: createSession(input, ip, userAgent)
  S->>S: enabled? IP HMAC, 1 per IP per 10 min, cap 200 active
  S->>T: verify token server-side
  S->>DB: ephemeral reviewer account + reviewer_sessions row
  S-->>W: access token (24 h, no cookie, gone on reload)
  W->>D: read published content through the reviewer field profile
"""
    content_flow = """
flowchart LR
  s["content/schemas/*.json<br/>cv-page, profile"] --> g["content:generate<br/>validate, diff vs snapshot.json"]
  g --> m["content/migrations/000N_*.sql<br/>+ snapshot.json"]
  g --> sdl["graphql:print-schema<br/>content/schema.graphql"]
  m --> rev["review + commit"] --> ci["CI checks<br/>generate --check, print-schema --check"]
  ci --> img["cms-api image"] --> init["init container<br/>npm run deploy:migrate"]
  init --> core["db:migrate<br/>prisma migrate deploy + role seed"]
  init --> cm["content:migrate<br/>advisory lock, content._migrations"]
  cm --> reg[("content._content_types")]
  reg --> rt["ContentRegistry at runtime<br/>resolve(slug) before any SQL"]
"""
    perm = """
flowchart TB
  r(["request"]) --> auth{"credentials?"}
  auth -->|"none"| anon["public actor"]
  auth -->|"Bearer ak_live_"| tok["API token: scope ∩ creator's current permissions"]
  auth -->|"Bearer JWT"| jwt["JWT: HS256, kid, tv and pv vs DB (cache)"]
  auth -->|"invalid"| e401["401"]
  anon --> pg{"PermissionGuard: can(action, subject)?"}
  tok --> pg
  jwt --> pg
  pg -->|"unknown content type"| e404["404"]
  pg -->|"no"| e403["403"]
  pg -->|"yes"| uc["use case"]
  uc --> rf["row filter from conditions"]
  uc --> fp["field projection: unreadable columns never selected"]
  uc --> qa{"filter / sort on unreadable field?"}
  qa -->|"yes"| e400["400 FIELD_NOT_READABLE"]
  qa -->|"no"| ser["RecordSerializer: *** / null + _maskedFields"]
"""
    body = f"""
<ul class="toc">
<li><a href="#perm">Authorization decision</a></li><li><a href="#login">Login (+2FA)</a></li><li><a href="#refresh">Refresh rotation</a></li>
<li><a href="#tabs">Admin refresh across tabs</a></li><li><a href="#setup">Owner setup</a></li><li><a href="#publish">Edit and publish</a></li>
<li><a href="#gql">GraphQL read</a></li><li><a href="#upload">Media upload</a></li><li><a href="#delete">Media delete and purge</a></li>
<li><a href="#reviewer">Reviewer session</a></li><li><a href="#content">Content type lifecycle</a></li></ul>
<h2 id="perm">Authorization decision (every content request)</h2>{diagram(perm)}
<h2 id="login">Login, with and without 2FA</h2>{diagram(login)}
<h2 id="refresh">Refresh token rotation and reuse detection (D9, D14)</h2>{diagram(refresh)}
<h2 id="tabs">cms-admin: refresh across tabs</h2>{diagram(tabs, 'auth-interceptor.ts + cross-tab-refresh.ts + single-flight.ts. Without Web Locks each tab refreshes and the grace window covers the overlap.')}
<h2 id="setup">One-time owner setup (ADR 0005)</h2>{diagram(setup)}
<h2 id="publish">Edit with optimistic concurrency, then publish (D11)</h2>{diagram(publish)}
<h2 id="gql">GraphQL read from the web server (D18)</h2>{diagram(gql)}
<h2 id="upload">Media upload (D12)</h2>{diagram(upload)}
<h2 id="delete">Media delete and purge</h2>{diagram(delete)}
<h2 id="reviewer">Reviewer session (D2)</h2>{diagram(reviewer)}
<h2 id="content">Content type lifecycle (D10)</h2>{diagram(content_flow, 'Schema changes never apply at request time; destructive changes need --allow-destructive and a data-migration note.')}
"""
    write('07-flows.html', 'Sequences & flows', body,
          'Step-by-step interactions between the apps, the cms-api modules and the database for the main use cases.')


# ================================================================ 08 frontends
def front_tables(base, groups, prefix):
    out = []
    for gid, title, inc, desc in groups:
        rows = files_under(base, inc)
        if not rows:
            continue
        out.append(f"""
<details class="mod" id="{prefix}-{gid}"><summary>{esc(title)} <span class="muted" style="font-weight:400">· {len(rows)} files</span></summary>
<div class="body"><p>{desc}</p>{file_table(f'ft-{prefix}-{gid}', rows, ROOT, base, FRONT, show_layer=False)}</div></details>""")
    return ''.join(out)


def build_frontends():
    admin_layers = """
flowchart TB
  main["main.tsx"] --> app["app/<br/>composition root: store, providers, shell, routes"]
  app --> feats["features/*<br/>one folder per feature + registry.ts"]
  app --> wiring["features/auth/app-wiring.ts<br/>(only app/ may import it)"]
  feats --> comps["components/"]
  feats --> lib["lib/<br/>api client, feature definition"]
  comps --> cfg["config/<br/>env, endpoints, routes, copy"]
  lib --> cfg
  feats --> fc["@abyss/form-commons"]
"""
    admin_features = """
flowchart RL
  content --> media
  reviewer --> media
  media --> access
  access --> ct["content-types"]
  ct --> security
  security --> auth
  status["status<br/>(imports no feature)"]
"""
    web_layers = """
flowchart TB
  app["app/<br/>routes, providers, shell, AccountMenu"] --> feats["features/auth, features/reviewer, features/status"]
  feats --> session["features/session<br/>reader account or reviewer token"]
  session --> lib["lib/<br/>api client, CSP, alerts"]
  lib --> cfg["config/<br/>env.server, env.client, endpoints"]
  proxy["proxy.ts<br/>per-request CSP nonce"] -.-> app
"""
    web_runtime = """
flowchart LR
  b(["Browser"]) -->|"page request"| px["proxy.ts<br/>nonce + CSP"]
  px --> rsc["Server Components<br/>data cache WEB_REVALIDATE_SECONDS"]
  rsc -->|"anonymous GraphQL<br/>API_INTERNAL_URL"| api["cms-api"]
  b -->|"client components<br/>TanStack Query + Axios /api/v1"| api
  b -->|"refresh cookie<br/>same origin domain.com"| api
"""
    admin_groups = [
        ('app', 'app/', ['app'], 'Composition root: store, providers, shell, routes.'),
        ('components', 'components/', ['components'], 'Shared presentational components.'),
        ('config', 'config/', ['config'], 'Env, endpoints, routes, UI copy.'),
        ('lib', 'lib/', ['lib'], 'API client, error reading, feature definition.'),
    ] + [
        (f, f'features/{f}/', [f'features/{f}'], {
            'auth': 'Sign-in, 2FA modal, password set / reset, owner setup page, session, token refresh.',
            'security': 'Own security settings: password change, TOTP / email 2FA.',
            'content-types': 'Content-type model and API, read by access, media, content and reviewer.',
            'access': 'Accounts, roles, permission matrix, API tokens.',
            'media': 'Media library, picker, alt text, delete.',
            'content': 'Dynamic document editor, collections, bulk actions, conflict merge, presence.',
            'reviewer': 'Reviewer settings and session log (owner).',
            'status': 'API health status page.',
        }.get(f, '')) for f in ('auth', 'security', 'content-types', 'access', 'media', 'content', 'reviewer', 'status')
    ] + [('root', 'entry + registry', ['main.tsx', 'features/registry.ts'], 'SPA entry and the feature registry.')]
    web_groups = [
        ('app', 'app/', ['app'], 'Routes, layout, providers, AccountMenu.'),
        ('features', 'features/', ['features'], 'auth (reader login), reviewer (reviewer entry with Turnstile), session, status.'),
        ('lib', 'lib/', ['lib'], 'API client, CSP builder, helpers.'),
        ('config', 'config/', ['config'], 'Server and client env, endpoints, security constants.'),
        ('root', 'root files', ['proxy.ts', 'instrumentation.ts', 'instrumentation-node.ts'], 'Edge proxy (CSP nonce) and instrumentation.'),
    ]
    fc_groups = [
        ('forms', 'components/forms/', ['components/forms'], 'Form components wired to react-hook-form (TextInput, RichtextInput, MediaInput, SortableSheet, ...).'),
        ('ui', 'components/ui/', ['components/ui'], 'shadcn base components.'),
        ('rest', 'constants, index', ['constants', 'index.ts', 'public-api.snapshot.ts'], 'Constants and the public API (snapshot-tested).'),
    ]
    body = f"""
<h2 id="admin">cms-admin (React 19 + Vite SPA)</h2>
<p>Feature-sliced SPA. Each feature folder exports a <code>FeatureDefinition</code> (routes + nav items) through <code>index.ts</code> and is listed once in <code>features/registry.ts</code>. Session / UI state in Redux Toolkit, server data in TanStack Query, REST through Axios. Served by nginx with its own CSP. Runs on its own origin <code>admin.domain.com</code> so XSS in public content can never run in the admin origin (D14).</p>
{diagram(admin_layers, 'Layers: higher may import lower, never the reverse.')}
{diagram(admin_features, 'Feature order: arrow = may import (through index.ts).')}
{front_tables('apps/cms-admin/src', admin_groups, 'admin')}
<h2 id="web">web (Next.js 16 App Router)</h2>
<p>Server Components by default; content is read on the server through GraphQL, anonymously, from <code>API_INTERNAL_URL</code>. Browser state with React context + TanStack Query, no Redux. A reader account uses the refresh cookie (same origin <code>domain.com</code>); a reviewer gets a token only. CSP with a fresh nonce per request from <code>proxy.ts</code>.</p>
{diagram(web_layers)}
{diagram(web_runtime, 'Runtime paths of the public site.')}
{front_tables('apps/web/src', web_groups, 'web')}
<h2 id="fc">packages/form-commons (UI kit)</h2>
<p>shadcn/ui base + form components built with tsup to <code>dist/</code>; consumed by cms-admin and web. Its public API is snapshot-tested.</p>
{front_tables('packages/form-commons/src', fc_groups, 'fc')}
<h2 id="bc">packages/base-config</h2>
{front_tables('packages/base-config/src', [('all', 'src/', [], 'Shared ESLint, oxlint and Prettier presets used by every package.')], 'bc')}
<h2 id="e2e">apps/e2e (Playwright)</h2>
<p>Runs against the smoke stack only (never in GitHub CI): <code>SMOKE_E2E=1 pnpm smoke</code>, or one spec with <code>pnpm e2e:spec</code> on a kept stack. Helpers read OTP mail from Mailpit and seed accounts with the smoke seed CLI.</p>
{front_tables('apps/e2e/src', [('all', 'src/', [], 'Shared helpers of the specs.')], 'e2e')}
"""
    write('08-frontends.html', 'Frontends & packages', body,
          'How the admin console and the public site are structured, plus the shared UI kit, config package and e2e suite.')


# ================================================================ 09 production
def build_production():
    topo = """
flowchart TB
  internet(["Internet"]) --> cf["Cloudflare (optional)<br/>CF-Connecting-IP"]
  cf --> tr
  subgraph vps["VPS: K3s, one replica per app"]
    tr["Traefik<br/>externalTrafficPolicy: Local<br/>TLS on websecure"]
    subgraph apipod["cms-api Pod (one image tag)"]
      initc["init: npm run deploy:migrate"]
      main["main: node dist/main.js :3000 uid 1000"]
    end
    webpod["web Pod<br/>Next.js standalone :8080 uid 1000"]
    admpod["cms-admin Pod<br/>nginx-unprivileged :8080 uid 101"]
    pg[("PostgreSQL 17 on a PVC")]
    sec["Secret (SOPS / sealed-secrets)"]
    bk["nightly dump + restore drill<br/>(deploy repo)"]
  end
  tr -->|"domain.com /api priority 20"| main
  tr -->|"domain.com priority 10"| webpod
  tr -->|"admin.domain.com"| admpod
  webpod -->|"API_INTERNAL_URL GraphQL"| main
  initc --> pg
  main --> pg
  sec -.-> initc
  sec -.-> main
  bk --> pg
"""
    cicd = """
flowchart LR
  push["push to develop / staging / main"] --> ch["changes<br/>turbo affected"]
  ch --> repo["repo<br/>pins-check, format:check, pnpm audit"]
  ch --> a["cms-api<br/>Checks then Build"]
  ch --> b["cms-admin<br/>Checks then Build"]
  ch --> w["web<br/>Checks then Build"]
  a --> pa["publish-cms-api"]
  b --> pb["publish-cms-admin<br/>+ bundle check"]
  w --> pw["publish-web"]
  pa --> man["manifest<br/>tags branch-sha7 + branch"]
  pb --> man
  pw --> man
  man --> dep["deploy bump<br/>APP_IMAGE_TAG in deploy repo overlay"]
  dep --> sync["deploy repo synced to the cluster"]
"""
    body = f"""
<h2 id="topology">Topology</h2>
{diagram(topo)}
{table(['Host', 'Path', 'Goes to'], [
    ['<code>domain.com</code>', '<code>/api/*</code> (priority 20)', 'cms-api :3000'],
    ['<code>domain.com</code>', 'everything else (priority 10)', 'web :8080'],
    ['<code>admin.domain.com</code>', 'all', 'cms-admin :8080'],
])}
<ul>
<li><b>Never StripPrefix</b>: cms-api serves under <code>/api/v1</code>.</li>
<li>Web and API share the origin <code>https://domain.com</code>: refresh cookie <code>__Secure-abyss_rt</code> is host-only with <code>Path=/api/v1/auth</code>. The admin origin is the only CORS origin.</li>
<li>Real client IP: <code>externalTrafficPolicy: Local</code> + <code>TRUST_PROXY_HOPS</code>, or <code>CLIENT_IP_HEADER=cf-connecting-ip</code> behind Cloudflare (D7).</li>
<li>v1 runs one replica per app: rate limits, presence and the version cache are in memory.</li>
</ul>
<h2 id="images">Images</h2>
{table(['Image', 'Runs as', 'Port', 'Role'], [
    ['<code>ghcr.io/hungnh1812dev/project-me/cms-api</code>', 'uid 1000', '3000', 'API (main) and migrations (init container), one tag for both'],
    ['<code>ghcr.io/hungnh1812dev/project-me/web</code>', 'uid 1000', '8080', 'Next.js standalone on Node'],
    ['<code>ghcr.io/hungnh1812dev/project-me/cms-admin</code>', 'uid 101', '8080', 'nginx-unprivileged, static files'],
])}
<h2 id="cicd">CI/CD (GitHub Actions)</h2>
{diagram(cicd, 'App flows never depend on each other. Publish runs only on staging / main when the app image inputs changed and its checks passed. e2e is not a CI gate.')}
{table(['Job', 'What it runs'], [
    ['changes', 'affected apps via turbo, branch target'],
    ['repo', 'pins-check (Turbo / Node pins), <code>pnpm format:check</code>, <code>pnpm audit --prod --audit-level high</code>'],
    ['cms-api Checks', 'typecheck, lint, test:unit, test:integration (Testcontainers), <code>content:generate --check</code>, <code>graphql:print-schema --check</code>, <code>contract:print --check</code>'],
    ['cms-admin / web Checks', 'typecheck, lint, Vitest'],
    ['publish-&lt;app&gt;', 'per-platform image (staging and main amd64), non-root guard, push by digest, manifest, deploy bump'],
])}
<h2 id="startup">Release order for cms-api</h2>
<ol>
<li>Init container runs <code>npm run deploy:migrate</code>: <code>db:migrate</code> (Prisma <code>migrate deploy</code> + role seed), then <code>content:migrate</code>. Stops at the first failure; idempotent; safe concurrently (Prisma lock, advisory lock).</li>
<li>Main container starts <code>node dist/main.js</code> and runs no migrations.</li>
<li>First install only: set <code>OWNER_SETUP_TOKEN</code> in the Secret, create the owner on <code>https://admin.domain.com/setup</code>, then remove the token and restart.</li>
</ol>
<h2 id="secrets">Secrets and config</h2>
<p>Secret keys (at least 32 bytes in production): <code>DB_PASSWORD</code>, <code>JWT_ACCESS_SECRET</code>, <code>OTP_PEPPER</code>, <code>TOTP_ENC_KEY</code> (+ previous key during rotation), SMTP / Cloudinary / Turnstile secrets, <code>OWNER_SETUP_TOKEN</code> (only during setup). Kept encrypted with SOPS in the deploy repo (<code>docs/deployment/k3s-secrets-sops.md</code>). With <code>NODE_ENV=production</code> the API refuses <code>MAIL_PROVIDER=console</code>, <code>MEDIA_PROVIDER=fake</code>, missing or short secrets (D17). Web and admin hold no secrets; <code>VITE_*</code> and <code>NEXT_PUBLIC_*</code> are baked at build time.</p>
<h2 id="backup">Backups</h2>
<p>The deploy repo owns a nightly PostgreSQL dump of both schemas and a restore drill: restore into a scratch database, run the migration commands (nothing pending), spot-check, drop. See <code>docs/deployment/k3s-traefik.md</code> §7.</p>
"""
    write('09-deployment-production.html', 'Production', body,
          'How the system runs in production: K3s + Traefik routing, images, the CI/CD pipeline, release order, secrets and backups.')


# ================================================================ 10 local
def build_local():
    local = """
flowchart LR
  dev(["Your browser"])
  subgraph host["Your machine"]
    adm["cms-admin: pnpm dev (Vite) :5173<br/>admin.domain.localhost"]
    web["web: pnpm dev (Next.js) :5174<br/>domain.localhost"]
    api["cms-api: pnpm start:dev :3000<br/>nest --watch, loads .env.local"]
    pg[("Postgres 17 container :5432")]
  end
  dev --> adm
  dev --> web
  adm -->|"REST + Bearer, CORS"| api
  web -->|"/api proxy (DEV_API_PROXY_TARGET)"| api
  web -->|"server GraphQL (API_INTERNAL_URL)"| api
  api --> pg
  api -.->|"MAIL_PROVIDER=console"| log["cms-api log shows OTP codes"]
"""
    first = """
flowchart TB
  a["1. Start Postgres 17"] --> b["2. Write apps/cms-api/.env.local<br/>DB_*, three secrets, ADMIN_ORIGIN, WEB_ORIGIN,<br/>MAIL_PROVIDER=console, MEDIA_PROVIDER=fake, OWNER_SETUP_TOKEN"]
  b --> c["3. Export .env.local into the shell<br/>(migrations do not read it)"]
  c --> d["4. pnpm build (in apps/cms-api)"]
  d --> e["5. pnpm deploy:migrate<br/>check DB_NAME is the database you look at"]
  e --> f["6. pnpm start:dev (cms-api)"]
  f --> g["7. pnpm dev (cms-admin)"]
  g --> h["8. open admin.domain.localhost:5173/setup"]
  h --> i["9. remove OWNER_SETUP_TOKEN, restart cms-api"]
"""
    smoke = """
flowchart LR
  sh["pnpm smoke<br/>scripts/smoke.sh"] --> build["build images"]
  build --> up["docker compose -p abyss-smoke"]
  subgraph stack["docker-compose.smoke.yml"]
    tr["Traefik :8080"]
    db[("postgres:17")]
    mp["Mailpit"]
    init["cms-api-init<br/>deploy:migrate"]
    api["cms-api"]
    web["web"]
    adm["cms-admin"]
  end
  up --> stack
  tr --> api
  tr --> web
  tr --> adm
  init --> db
  api --> db
  api --> mp
  sh --> checks["scripts/smoke/*.sh<br/>routing, auth, mail, headers, cors, owner setup"]
  sh -.->|"SMOKE_E2E=1"| e2e["Playwright apps/e2e"]
"""
    tests = """
flowchart TB
  t1["Tier 1: unit + integration<br/>pnpm test, cms-api test:integration"] --> t2["Tier 2: e2e on dev servers<br/>pnpm dev:stack, E2E_STACK=dev pnpm e2e:spec"]
  t2 --> t3["Tier 3: full prod-like stack<br/>SMOKE_E2E=1 pnpm smoke"]
  t1 -.-> tc["one shared Testcontainers Postgres per run,<br/>one database per test file"]
"""
    body = f"""
<h2 id="dev">Dev servers</h2>
{diagram(local)}
{table(['App', 'Command', 'Env file', 'URL'], [
    ['cms-api', '<code>pnpm start:dev</code> in <code>apps/cms-api</code> (or <code>pnpm start:cms-api:dev</code>)', '<code>apps/cms-api/.env.local</code> (only start:dev / start:debug load it; shell values win)', '<code>http://localhost:3000/api/v1</code>'],
    ['cms-admin', '<code>pnpm dev</code> in <code>apps/cms-admin</code>', '<code>apps/cms-admin/.env.local</code> (Vite)', '<code>http://admin.domain.localhost:5173</code>'],
    ['web', '<code>pnpm dev</code> in <code>apps/web</code>', '<code>apps/web/.env.local</code>', '<code>http://domain.localhost:5174</code>'],
    ['all three', '<code>pnpm start:dev</code> at the root', 'as above', ''],
])}
<div class="callout">Open the admin at <code>admin.domain.localhost:5173</code>, not <code>localhost:5173</code>: the origin must equal cms-api <code>ADMIN_ORIGIN</code> or CORS blocks every call.</div>

<h2 id="first">First run (empty database)</h2>
{diagram(first, 'start:dev never creates tables; migrations are a separate step.')}
<pre class="code">cd apps/cms-api
set -a; source .env.local; set +a     # db:migrate and the CLIs read the shell only
pnpm build                            # the role seed and content:migrate run from dist/
pnpm deploy:migrate                   # db:migrate (Prisma + role seed) then content:migrate
pnpm start:dev
# owner without the web page:
OWNER_EMAIL=you@example.com pnpm owner:bootstrap</pre>
{table(['Key (cms-api)', 'Local value'], [
    ['<code>DB_HOST</code>, <code>DB_PORT</code>, <code>DB_NAME</code>, <code>DB_USERNAME</code>, <code>DB_PASSWORD</code>', 'your Postgres container'],
    ['<code>JWT_ACCESS_SECRET</code>, <code>OTP_PEPPER</code>, <code>TOTP_ENC_KEY</code>', '<code>openssl rand -base64 48</code> each'],
    ['<code>ADMIN_ORIGIN</code>', '<code>http://admin.domain.localhost:5173</code>'],
    ['<code>WEB_ORIGIN</code>', '<code>http://domain.localhost:5174</code>'],
    ['<code>MAIL_PROVIDER</code>', '<code>console</code> (OTP codes in the log)'],
    ['<code>MEDIA_PROVIDER</code>', '<code>fake</code> (in memory, lost on restart)'],
    ['<code>OWNER_SETUP_TOKEN</code>', 'only until the owner exists'],
])}
{table(['Key (cms-admin / web)', 'Local value'], [
    ['<code>VITE_API_BASE_URL</code>', '<code>http://localhost:3000/api/v1</code>'],
    ['<code>NEXT_PUBLIC_API_BASE_URL</code>', '<code>/api/v1</code>'],
    ['<code>API_INTERNAL_URL</code>', '<code>http://localhost:3000/api/v1</code>'],
    ['<code>DEV_API_PROXY_TARGET</code>', '<code>http://localhost:3000</code>'],
    ['<code>WEB_REVALIDATE_SECONDS</code>', '<code>0</code> while editing content'],
])}
<h2 id="devstack">Dev stack (agents / tier-2 e2e)</h2>
<p><code>pnpm dev:stack</code> starts Postgres and Mailpit (compose project <code>abyss-dev</code>, <code>docker-compose.dev.yml</code>) and the three dev servers with env from <code>.localEnv.agent</code>; stop with <code>pnpm dev:stack:stop</code>.</p>
<h2 id="smoke">Smoke stack (prod-like, Docker only)</h2>
{diagram(smoke)}
<pre class="code">pnpm smoke                      # build, start, check, tear down
SMOKE_KEEP=1 SMOKE_E2E=1 pnpm smoke   # keep it and run Playwright
docker compose -p abyss-smoke down -v # stop a kept stack</pre>
<p>Kept stack URLs: <code>http://domain.localhost:8080</code> and <code>http://admin.domain.localhost:8080</code>. Per-run secrets are generated by <code>scripts/smoke.sh</code>.</p>
<h2 id="tests">Test tiers</h2>
{diagram(tests)}
"""
    write('10-local-setup.html', 'Local setup', body,
          'How to run everything on your machine: dev servers, env files, first-run migrations and owner, the dev and smoke stacks, and test tiers.')


def main():
    os.makedirs(os.path.join(OUT, 'assets'), exist_ok=True)
    with open(os.path.join(OUT, 'assets', 'architecture.css'), 'w', encoding='utf-8') as fh:
        fh.write(CSS.strip() + '\n')
    build_master()
    build_system()
    build_api_arch()
    build_platform()
    build_access_identity()
    build_content_modules()
    build_data()
    build_flows()
    build_frontends()
    build_production()
    build_local()
    print('written to', OUT)


if __name__ == '__main__':
    main()
