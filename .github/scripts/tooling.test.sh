#!/usr/bin/env bash
# Config guard for the editor and tooling settings (AC-23).
# Usage: bash .github/scripts/tooling.test.sh
# Checks AC-1 to AC-4 (.vscode/settings.json), no committed useTsgo, AC-7
# (cms-api tsconfig shape), AC-12 (frontend tsconfig), AC-13 (frontend lint
# script), AC-15 (package incremental), AC-17 and AC-18 (turbo task graph via
# --dry=json), AC-21 (eslint-config removed) and the AC-B14 stale-refs rule.
# Runs locally only; not part of CI.
set -euo pipefail

root="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
work="$(mktemp -d "${TMPDIR:-/tmp}/tooling-test.XXXXXX")"
trap 'rm -rf "${work}"' EXIT
cd "${root}"

passed=0
failed=0

# Shared node helpers: readJsonc (comments and trailing commas allowed) and
# expect(cond, msg), which collects failures for the current check.
prelude='
const fs = require("fs");
const readJsonc = (p) => JSON.parse(
  fs.readFileSync(p, "utf8")
    .replace(/("(?:\\.|[^"\\])*")|\/\/[^\n]*|\/\*[\s\S]*?\*\//g, (m, s) => s ?? "")
    .replace(/,(\s*[}\]])/g, "$1"));
const errors = [];
const expect = (cond, msg) => { if (!cond) errors.push(msg); };
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const has = (list, items) => items.every((i) => (list ?? []).includes(i));
'
epilogue='
if (errors.length) { console.error(errors.join("\n")); process.exit(1); }
'

# check <name> <node code>: runs the code with the prelude, prints PASS or FAIL
check() {
  local name="$1" code="$2" log
  if log="$(node -e "${prelude}${code}${epilogue}" 2>&1)"; then
    echo "PASS ${name}"
    passed=$((passed + 1))
  else
    echo "FAIL ${name}"
    printf '%s\n' "${log}" | sed 's/^/  | /'
    failed=$((failed + 1))
  fi
}

check "AC-1 watcherExclude and search.exclude" '
const s = readJsonc(".vscode/settings.json");
const w = s["files.watcherExclude"] ?? {};
const next = ["cache", "server", "static", "standalone", "build", "turbopack"].map((d) => `**/.next/${d}/**`);
const dev = ["cache", "server", "static", "build", "logs"].map((d) => `**/.next/dev/${d}/**`);
const other = ["dist", ".turbo", "coverage", "test-results", "playwright-report", "node_modules/.tmp"].map((d) => `**/${d}/**`);
for (const k of [...next, ...dev, ...other]) expect(w[k] === true, `files.watcherExclude missing ${k}`);
for (const k of Object.keys(w)) {
  expect(!/\.next\/(dev\/)?types|\.next\/?(\*\*)?$|\.next\/(dev\/)?\*\*$/.test(k), `files.watcherExclude must keep .next/types watched: ${k}`);
}
const se = s["search.exclude"] ?? {};
for (const d of [".next", "dist", ".turbo", "coverage", "test-results", "playwright-report"]) {
  expect(se[`**/${d}`] === true || se[`**/${d}/**`] === true, `search.exclude missing ${d}`);
}
'

check "AC-2 workspace TypeScript" '
const s = readJsonc(".vscode/settings.json");
expect(s["typescript.tsdk"] === "apps/cms-admin/node_modules/typescript/lib", `typescript.tsdk is ${s["typescript.tsdk"]}`);
expect(s["typescript.enablePromptUseWorkspaceTsdk"] === true, "typescript.enablePromptUseWorkspaceTsdk is not true");
'

check "AC-3 ESLint scoped to apps/frontend" '
const s = readJsonc(".vscode/settings.json");
const dirs = (s["eslint.workingDirectories"] ?? []).map((d) => (typeof d === "string" ? d : d.directory ?? d.pattern));
expect(same(dirs, ["apps/frontend"]), `eslint.workingDirectories is ${JSON.stringify(dirs)}`);
'

check "AC-4 defaults kept" '
const s = readJsonc(".vscode/settings.json");
for (const k of ["eslint.run", "typescript.preferences.includePackageJsonAutoImports",
  "typescript.disableAutomaticTypeAcquisition", "oxc.typeAware"]) {
  expect(!(k in s), `.vscode/settings.json must not set ${k}`);
}
'

check "AC-6 no committed useTsgo" '
for (const f of fs.readdirSync(".vscode")) {
  expect(!fs.readFileSync(`.vscode/${f}`, "utf8").includes("useTsgo"), `.vscode/${f} mentions useTsgo`);
}
'

check "AC-7 cms-api tsconfig shape" '
const dir = "apps/cms-api";
const sol = readJsonc(`${dir}/tsconfig.json`);
expect(same(sol.files, []), "tsconfig.json files is not []");
expect(same((sol.references ?? []).map((r) => r.path).sort(), ["./tsconfig.app.json", "./tsconfig.spec.json"]),
  "tsconfig.json must reference tsconfig.app.json and tsconfig.spec.json");
const app = readJsonc(`${dir}/tsconfig.app.json`);
const spec = readJsonc(`${dir}/tsconfig.spec.json`);
expect(same(app.include, ["src"]), `app include is ${JSON.stringify(app.include)}`);
expect(has(app.exclude, ["src/**/*.spec.ts"]), "app exclude misses src/**/*.spec.ts");
expect(same(app.compilerOptions?.types, ["node"]), "app types is not [\"node\"]");
expect(has(spec.include, ["src/**/*.spec.ts", "test", "vitest.config.ts", "vitest.config.e2e.ts"]),
  `spec include is ${JSON.stringify(spec.include)}`);
expect(same(spec.compilerOptions?.types, ["vitest/globals", "node"]), "spec types is not [\"vitest/globals\", \"node\"]");
for (const [name, c] of [["app", app], ["spec", spec]]) {
  expect(has(c.exclude, ["node_modules", "dist", "coverage"]), `${name} exclude misses node_modules, dist or coverage`);
  expect((c.compilerOptions?.tsBuildInfoFile ?? "").startsWith("./node_modules/.tmp/"),
    `${name} tsBuildInfoFile is not under node_modules/.tmp/`);
}
const build = readJsonc(`${dir}/tsconfig.build.json`);
expect(build.extends === "./tsconfig.app.json", `tsconfig.build.json extends ${build.extends}`);
expect(build.compilerOptions?.rootDir === "./src", "tsconfig.build.json rootDir is not ./src");
'

check "AC-12 frontend tsconfig" '
const c = readJsonc("apps/frontend/tsconfig.json");
expect(has(c.exclude, ["node_modules", ".next/standalone", "out", "build"]), `exclude is ${JSON.stringify(c.exclude)}`);
expect(c.compilerOptions?.tsBuildInfoFile === "./node_modules/.tmp/tsconfig.tsbuildinfo",
  `tsBuildInfoFile is ${c.compilerOptions?.tsBuildInfoFile}`);
expect(has(c.include, [".next/types/**/*.ts", ".next/dev/types/**/*.ts"]), "include must keep .next route types");
'

check "AC-13 frontend lint script" '
const p = readJsonc("apps/frontend/package.json");
const want = "eslint --cache --cache-strategy content --cache-location node_modules/.cache/eslint/";
expect(p.scripts?.lint === want, `lint script is ${p.scripts?.lint}`);
'

check "AC-15 package incremental" '
for (const pkg of ["form-commons", "types"]) {
  const c = readJsonc(`packages/${pkg}/tsconfig.json`).compilerOptions ?? {};
  expect(c.incremental === true, `${pkg} incremental is not true`);
  expect(c.tsBuildInfoFile === "./node_modules/.tmp/tsconfig.tsbuildinfo", `${pkg} tsBuildInfoFile is ${c.tsBuildInfoFile}`);
}
'

dry="${work}/dry.json"
if ! pnpm turbo run lint typecheck --dry=json >"${dry}" 2>"${work}/dry.log"; then
  echo "FAIL turbo --dry=json"
  sed 's/^/  | /' "${work}/dry.log"
  failed=$((failed + 1))
fi

check "AC-17 and AC-19 lint graph and inputs" "const dry = '${dry}';"'
const t = readJsonc("turbo.json").tasks;
expect(!(t.lint.dependsOn ?? []).some((d) => d.includes("lint")), "turbo.json lint still depends on lint");
for (const task of JSON.parse(fs.readFileSync(dry, "utf8")).tasks.filter((x) => x.task === "lint")) {
  expect(!task.dependencies.some((d) => d.endsWith("#lint")), `${task.taskId} depends on ${task.dependencies}`);
  expect(has(task.resolvedTaskDefinition.inputs, ["!**/*.md", "!docs/**"]), `${task.taskId} inputs keep docs`);
}
'

check "AC-18 and AC-19 typecheck transit nodes" "const dry = '${dry}';"'
const t = readJsonc("turbo.json").tasks;
expect(same(t.transit?.dependsOn, ["^transit"]), "turbo.json transit must depend on ^transit");
expect(same(t.typecheck?.dependsOn, ["^transit"]), "turbo.json typecheck must depend on ^transit");
const tasks = JSON.parse(fs.readFileSync(dry, "utf8")).tasks;
for (const task of tasks.filter((x) => x.task === "typecheck")) {
  expect(!task.dependencies.some((d) => d.endsWith("#typecheck")), `${task.taskId} depends on ${task.dependencies}`);
  expect(has(task.resolvedTaskDefinition.inputs, ["!**/*.md", "!docs/**"]), `${task.taskId} inputs keep docs`);
}
for (const app of ["frontend", "cms-admin"]) {
  const task = tasks.find((x) => x.taskId === `${app}#typecheck`);
  expect(task?.dependencies.includes("@repo/form-commons#transit"), `${app}#typecheck does not depend on @repo/form-commons#transit`);
}
'

check "AC-21 eslint-config removed" '
const { execSync } = require("child_process");
expect(!fs.existsSync("packages/eslint-config"), "packages/eslint-config still exists");
const refs = execSync("git grep -n \"@repo/eslint-config\" || true", { encoding: "utf8" }).trim();
expect(refs === "", `@repo/eslint-config referenced:\n${refs}`);
expect(!fs.readFileSync("pnpm-lock.yaml", "utf8").includes("packages/eslint-config"), "pnpm-lock.yaml still lists packages/eslint-config");
for (const f of ["README.md", "docs/architecture.md"]) {
  expect(!/eslint-config\//.test(fs.readFileSync(f, "utf8")), `${f} still lists the eslint-config package`);
}
'

stale="$(grep -rn "@repo/ui\|packages/ui" --exclude-dir=node_modules --exclude-dir=.next \
  --exclude-dir=dist --exclude-dir=.turbo --exclude-dir=coverage --exclude-dir=.git \
  --exclude-dir=tasks --exclude=SPEC.md --exclude=tooling.test.sh . || true)"
if [ -z "${stale}" ]; then
  echo "PASS AC-B14 stale refs"
  passed=$((passed + 1))
else
  echo "FAIL AC-B14 stale refs"
  printf '%s\n' "${stale}" | sed 's/^/  | /'
  failed=$((failed + 1))
fi

echo "${passed} passed, ${failed} failed"
[ "${failed}" -eq 0 ]
