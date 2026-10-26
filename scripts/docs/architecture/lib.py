"""Shared page shell, file scanning and file-table rendering for the architecture docs."""
import html
import json
import os
import re

GENERATED_ON = '2026-10-26'

PAGES = [
    ('project-architecture.html', 'Overview', 'Master page: system map and reading order'),
    ('01-system-overview.html', 'System & monorepo', 'Actors, apps, packages, tech stack'),
    ('02-cms-api-architecture.html', 'cms-api architecture', 'Clean-architecture layers, module graph, pipeline, errors'),
    ('03-cms-api-platform.html', 'cms-api platform', 'common, config, infrastructure, architecture guards'),
    ('04-modules-access-identity.html', 'Access & identity modules', 'access core, security-audit, identity, management, document-auth'),
    ('05-modules-content.html', 'Content modules', 'content-engine, content-types, documents, graphql, media, reviewer, health'),
    ('06-data-model.html', 'Data model & classes', 'ER diagrams, ports and adapters class diagrams'),
    ('07-flows.html', 'Sequences & flows', 'Login, refresh, setup, publish, GraphQL, media, reviewer'),
    ('08-frontends.html', 'Frontends & packages', 'cms-admin, web, form-commons, base-config, e2e'),
    ('09-deployment-production.html', 'Production', 'K3s + Traefik, images, CI/CD, secrets, backups'),
    ('10-local-setup.html', 'Local setup', 'Dev servers, env files, migrations, owner, smoke stack, tests'),
]

CSS = r"""
:root{
  --bg:#f7f8fa;--surface:#ffffff;--surface-2:#f1f3f6;--text:#1d2330;--muted:#5b6475;
  --border:#dfe3ea;--accent:#2f5bd3;--accent-soft:#e8eefc;--ok:#1f7a4d;--warn:#9a5b00;
  --code-bg:#f1f3f6;--shadow:0 1px 2px rgba(16,24,40,.06),0 1px 3px rgba(16,24,40,.08);
  --tag-domain:#e7f5ec;--tag-app:#e8eefc;--tag-adapter:#fdf0e1;--tag-http:#f3e8fc;--tag-wiring:#eceff3;--tag-cli:#fcebec;
}
@media (prefers-color-scheme: dark){:root:not([data-theme="light"]){
  --bg:#11141a;--surface:#181c24;--surface-2:#1f2430;--text:#e4e7ee;--muted:#9aa3b5;
  --border:#2c3342;--accent:#7ea2ff;--accent-soft:#1e2a47;--ok:#5fd19b;--warn:#f0b35a;
  --code-bg:#1f2430;--shadow:none;
  --tag-domain:#16301f;--tag-app:#1e2a47;--tag-adapter:#3a2a14;--tag-http:#2f1f3d;--tag-wiring:#262b35;--tag-cli:#3d1f22;
}}
:root[data-theme="dark"]{
  --bg:#11141a;--surface:#181c24;--surface-2:#1f2430;--text:#e4e7ee;--muted:#9aa3b5;
  --border:#2c3342;--accent:#7ea2ff;--accent-soft:#1e2a47;--ok:#5fd19b;--warn:#f0b35a;
  --code-bg:#1f2430;--shadow:none;
  --tag-domain:#16301f;--tag-app:#1e2a47;--tag-adapter:#3a2a14;--tag-http:#2f1f3d;--tag-wiring:#262b35;--tag-cli:#3d1f22;
}
*{box-sizing:border-box}
html{scroll-behavior:smooth}
body{margin:0;background:var(--bg);color:var(--text);font:15px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:var(--accent);text-decoration:none}a:hover{text-decoration:underline}
code{font:13px/1.4 ui-monospace,SFMono-Regular,Menlo,monospace;background:var(--code-bg);padding:1px 5px;border-radius:4px}
pre.code{background:var(--code-bg);padding:12px 14px;border-radius:8px;overflow-x:auto;font:13px/1.5 ui-monospace,Menlo,monospace}
.layout{display:grid;grid-template-columns:260px minmax(0,1fr);min-height:100vh}
nav.side{position:sticky;top:0;height:100vh;overflow-y:auto;background:var(--surface);border-right:1px solid var(--border);padding:20px 14px}
nav.side .brand{font-weight:700;font-size:16px;margin:0 8px 14px}
nav.side .brand small{display:block;font-weight:400;color:var(--muted);font-size:12px}
nav.side a{display:block;padding:7px 10px;border-radius:6px;color:var(--text);font-size:14px}
nav.side a small{display:block;color:var(--muted);font-size:12px;line-height:1.3}
nav.side a:hover{background:var(--surface-2);text-decoration:none}
nav.side a.active{background:var(--accent-soft);color:var(--accent);font-weight:600}
main{padding:28px 36px 60px;max-width:1240px}
h1{font-size:28px;margin:0 0 6px;letter-spacing:-.01em}
h2{font-size:21px;margin:36px 0 10px;padding-top:6px;border-top:1px solid var(--border)}
h3{font-size:17px;margin:24px 0 8px}
.lead{color:var(--muted);margin:0 0 18px;max-width:80ch}
.card{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:16px 18px;box-shadow:var(--shadow);margin:12px 0}
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(250px,1fr));gap:12px}
.grid .card{margin:0}
.card h3{margin-top:0}
.diagram{background:var(--surface);border:1px solid var(--border);border-radius:10px;padding:14px;overflow-x:auto;margin:12px 0}
.diagram .cap{font-size:13px;color:var(--muted);margin:0 0 8px}
pre.mermaid{margin:0;text-align:center;background:transparent}
table{border-collapse:collapse;width:100%;font-size:14px;background:var(--surface);border:1px solid var(--border);border-radius:8px;overflow:hidden}
th,td{text-align:left;padding:7px 10px;border-bottom:1px solid var(--border);vertical-align:top}
th{background:var(--surface-2);font-weight:600;font-size:13px}
tr:last-child td{border-bottom:0}
td.path{white-space:nowrap}
.tbl{overflow-x:auto;margin:10px 0}
.tag{display:inline-block;font-size:11px;font-weight:600;padding:1px 7px;border-radius:999px;white-space:nowrap}
.t-domain{background:var(--tag-domain)}.t-application{background:var(--tag-app)}.t-adapters{background:var(--tag-adapter)}
.t-http{background:var(--tag-http)}.t-wiring{background:var(--tag-wiring)}.t-cli,.t-jobs{background:var(--tag-cli)}
.t-other{background:var(--surface-2)}
.muted{color:var(--muted)}
.filter{width:100%;max-width:420px;padding:8px 10px;border:1px solid var(--border);border-radius:8px;background:var(--surface);color:var(--text);font:inherit;margin:6px 0}
details.mod{background:var(--surface);border:1px solid var(--border);border-radius:10px;margin:14px 0;box-shadow:var(--shadow)}
details.mod>summary{cursor:pointer;padding:12px 16px;font-weight:600;font-size:16px;list-style:none}
details.mod>summary::-webkit-details-marker{display:none}
details.mod>summary::before{content:"▸ ";color:var(--muted)}
details.mod[open]>summary::before{content:"▾ "}
details.mod .body{padding:0 16px 14px}
.kv{display:grid;grid-template-columns:max-content 1fr;gap:4px 14px;font-size:14px}
.kv dt{color:var(--muted)}.kv dd{margin:0}
.callout{border-left:3px solid var(--warn);background:var(--surface);padding:10px 14px;border-radius:0 8px 8px 0;margin:12px 0}
footer{margin-top:48px;color:var(--muted);font-size:13px;border-top:1px solid var(--border);padding-top:12px}
.toc{columns:2;font-size:14px;margin:6px 0 0;padding-left:18px}
@media (max-width:860px){
  .layout{grid-template-columns:1fr}
  nav.side{position:static;height:auto;border-right:0;border-bottom:1px solid var(--border)}
  main{padding:20px 16px 48px}
  .toc{columns:1}
  td.path{white-space:normal;word-break:break-all}
}
"""

JS = r"""
import mermaid from 'https://cdn.jsdelivr.net/npm/mermaid@11.4.1/dist/mermaid.esm.min.mjs';
const theme = document.documentElement.dataset.theme
  || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
mermaid.initialize({
  startOnLoad: false,
  theme: theme === 'dark' ? 'dark' : 'neutral',
  securityLevel: 'strict',
  flowchart: { curve: 'basis', useMaxWidth: true },
  sequence: { showSequenceNumbers: true, useMaxWidth: true, wrap: true },
  er: { useMaxWidth: true },
  class: { useMaxWidth: true },
});
await mermaid.run({ querySelector: 'pre.mermaid' });
for (const input of document.querySelectorAll('input.filter')) {
  const target = document.getElementById(input.dataset.target);
  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    for (const row of target.querySelectorAll('tbody tr')) {
      row.hidden = q !== '' && !row.textContent.toLowerCase().includes(q);
    }
  });
}
"""


def esc(text):
    return html.escape(str(text), quote=True)


def diagram(source, caption=''):
    cap = f'<p class="cap">{caption}</p>' if caption else ''
    return f'<div class="diagram">{cap}<pre class="mermaid">{esc(source.strip())}</pre></div>'


def page(filename, title, body, lead=''):
    nav = []
    for f, label, sub in PAGES:
        cls = ' class="active"' if f == filename else ''
        nav.append(f'<a href="{f}"{cls}>{esc(label)}<small>{esc(sub)}</small></a>')
    lead_html = f'<p class="lead">{lead}</p>' if lead else ''
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)}</title>
<link rel="stylesheet" href="assets/architecture.css">
</head>
<body>
<div class="layout">
<nav class="side" aria-label="Architecture pages">
<div class="brand">Abyss architecture<small>Headless CMS + portfolio monorepo</small></div>
{''.join(nav)}
</nav>
<main>
<h1>{esc(title)}</h1>
{lead_html}
{body}
<footer>Generated {GENERATED_ON} from the working tree of <code>abyss</code> (file lists and the module graph are read from the code; descriptions come from SPEC.md, the ADRs, docs/ and the source). File names follow ADR 0008 and were being renamed on the day this was generated, so re-generate after big renames: <code>pnpm docs:architecture</code>.</footer>
</main>
</div>
<script type="module">{JS}</script>
</body>
</html>
"""


# ---------- file scanning ----------

SKIP_DIRS = {'node_modules', 'dist', '.next', 'generated', 'test-results', 'coverage', '.turbo'}


def scan(root, base, exts=('.ts', '.tsx')):
    """Non-test source files under base, relative to base, sorted."""
    out = []
    top = os.path.join(root, base)
    for dp, dns, fns in os.walk(top):
        dns[:] = sorted(d for d in dns if d not in SKIP_DIRS)
        for fn in fns:
            if not fn.endswith(exts):
                continue
            if re.search(r'\.(spec|test)\.tsx?$', fn) or fn.endswith('.d.ts'):
                continue
            p = os.path.join(dp, fn)
            out.append(os.path.relpath(p, top).replace(os.sep, '/'))
    return sorted(out)


def line_count(path):
    with open(path, encoding='utf-8') as fh:
        return sum(1 for _ in fh)


def norm(path):
    return re.sub(r'[-_]', '', path.lower())


LAYER_DIRS = ('domain', 'application', 'adapters', 'http', 'cli', 'jobs')

# ADR 0008 function words -> what a file with that word is.
ROLE_WORDS = {
    'service': 'Use case / application service',
    'repository': 'Persistence adapter for one aggregate (implements a port)',
    'adapter': 'Adapter: implements a port over a library or I/O',
    'port': 'Ports: interfaces + DI tokens this layer needs',
    'rules': 'Pure rules (no I/O)',
    'entity': 'Types / value objects',
    'constants': 'Named constants',
    'errors': 'Error factories (DomainError)',
    'module': 'Nest module wiring',
    'controller': 'HTTP routes',
    'requests': 'Zod request parsing',
    'guard': 'Nest guard',
    'strategy': 'Passport strategy',
    'middleware': 'Express middleware',
    'filter': 'Exception filter',
    'job': 'Scheduled job (calls a use case)',
    'command': 'CLI command entry point',
    'setup': 'Bootstrap / composition helper',
    'client': 'Client of an external system',
    'store': 'In-memory store',
    'executor': 'Executor',
    'resolver': 'Resolver',
    'analyzer': 'Architecture-test analyzer',
    'sender': 'Mail sender (implements MailSender)',
    'contract': 'Contract',
    'api': 'REST calls of this feature (Axios)',
    'slice': 'Redux Toolkit slice',
    'copy': 'UI text (copy) constants',
    'queries': 'TanStack Query hooks',
    'query': 'TanStack Query hook',
    'mutation': 'TanStack Query mutation hook',
    'state': 'Local state hook',
    'types': 'Types',
    'config': 'Configuration',
    'styles': 'Style constants',
    'schema': 'Schema',
}


def role_of(path):
    """Layer (folder) and role (function word) of a file path inside a module."""
    parts = path.split('/')
    name = parts[-1]
    layer = next((p for p in parts[:-1] if p in LAYER_DIRS), None)
    base = re.sub(r'\.(ts|tsx)$', '', name)
    if name in ('index.ts', 'index.tsx'):
        return layer or 'wiring', 'Public interface (facade): the only file other code may import'
    if re.search(r'\.module$', base) and layer is None:
        return 'wiring', 'Nest wiring: binds ports to adapters, lists controllers and providers'
    word = base.split('.')[-1] if '.' in base else None
    if word is None:
        # kebab-case frontend names: last dash segment as a hint
        m = re.search(r'-(api|queries|error|columns|context|constants|form|slice)$', base)
        if base.startswith('use-') or re.match(r'use[A-Z]', base):
            return layer, 'React hook'
        if base.endswith('Page'):
            return layer, 'Routed page component'
        if base.endswith('Dialog') or base.endswith('Modal'):
            return layer, 'Dialog component'
        if name.endswith('.tsx'):
            return layer, 'React component'
        if m:
            hint = {'api': 'REST calls', 'queries': 'TanStack Query hooks', 'error': 'Maps API errors to UI messages',
                    'columns': 'Table column definitions', 'context': 'React context (injects the API in tests)',
                    'constants': 'Named constants', 'form': 'Form schema and helpers', 'slice': 'Redux slice'}[m.group(1)]
            return layer, hint
        return layer, ''
    return layer, ROLE_WORDS.get(word, '')


def file_table(table_id, rows, root_abs, base, notes, show_layer=True):
    """rows: relative paths. Renders a filterable table with layer tag, role and note."""
    body = []
    for rel in rows:
        layer, role = role_of(rel)
        key = norm(base + '/' + rel)
        note = ''
        for k, v in notes.items():
            if key.endswith(norm(k)):
                note = v
                break
        lines = line_count(os.path.join(root_abs, base, rel))
        desc = note or role
        role_html = f'<span class="muted">{esc(role)}</span>' if note and role else ''
        tag = layer or 'other'
        layer_cell = f'<td><span class="tag t-{esc(tag)}">{esc(tag)}</span></td>' if show_layer else ''
        body.append(
            f'<tr><td class="path"><code>{esc(rel)}</code></td>{layer_cell}'
            f'<td>{esc(desc)}{"<br>" + role_html if role_html else ""}</td><td class="muted">{lines}</td></tr>'
        )
    layer_head = '<th>Layer</th>' if show_layer else ''
    return (
        f'<input class="filter" type="search" placeholder="Filter files…" data-target="{table_id}" aria-label="Filter files">'
        f'<div class="tbl"><table id="{table_id}"><thead><tr><th>File</th>{layer_head}<th>Meaning</th><th>Lines</th></tr></thead>'
        f'<tbody>{"".join(body)}</tbody></table></div>'
    )


def module_edges(root):
    """MODULE_NODES and ALLOWED_MODULE_EDGES parsed from the architecture constants."""
    path = os.path.join(root, 'apps/cms-api/test/architecture')
    fname = next(f for f in os.listdir(path) if norm(f) == 'moduleedges.constants.ts')
    src = open(os.path.join(path, fname), encoding='utf-8').read()
    block = src.split('ALLOWED_MODULE_EDGES', 1)[1].split('};', 1)[0]
    edges = {}
    for m in re.finditer(r"'?([a-z-]+)'?\s*:\s*\[([^\]]*)\]", block):
        edges[m.group(1)] = re.findall(r"'([a-z-]+)'", m.group(2))
    return edges


def workspace_deps(root):
    deps = {}
    for group in ('apps', 'packages'):
        for name in sorted(os.listdir(os.path.join(root, group))):
            pj = os.path.join(root, group, name, 'package.json')
            if not os.path.exists(pj):
                continue
            data = json.load(open(pj, encoding='utf-8'))
            all_deps = {**data.get('dependencies', {}), **data.get('devDependencies', {})}
            deps[f'{group}/{name}'] = sorted(d for d in all_deps if d.startswith('@abyss/'))
    return deps
