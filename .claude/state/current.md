# Current Unit: D3
## D3 Build @abyss/base-config to dist/ and export from dist
Status: ready-for-checks
What was built: base-config now compiles with tsc (tsconfig.build.json) to dist/{prettier,eslint,oxlint}.{js,d.ts}; exports map has types/import/default pointing at dist/. Package turbo.json makes test depend on build. Root format and format:check build base-config first. README updated (dist, turbo, one manual build for editors).
Changed files:
- packages/base-config/package.json - exports to dist, files: dist, build script
- packages/base-config/tsconfig.build.json - new, emit config
- packages/base-config/turbo.json - new, test dependsOn build
- packages/base-config/README.md - dist wording, build script row
- package.json - format scripts run the base-config build first
Behaviour to verify:
- With dist absent: pnpm format:check, lint, typecheck, test:unit pass (done by builder).
- turbo dry run shows @abyss/base-config#build before cms-api and web lint.
Security-relevant: none
Checks needed: qc-cli (fresh clone run of format:check, lint, typecheck, test; three Docker image builds once daemon is up)
Risk: normal
Verification: format pass · build/type-check pass · unit tests pass (base-config 6; cms-api test:unit and ui packages pass; cms-api integration not run, Docker down) · docs packages/base-config/README.md
Proposed commit: |
  build(packages/base-config,root): build base-config to dist and export from dist

  Compile the shared Prettier, ESLint and Oxlint configs with tsc and point
  the exports (types, import, default) at dist/. Turbo test depends on
  build, and the root format scripts build base-config first.

  Affected:
  - packages/base-config
Deletions needing approval: none
Not run: Docker builds (daemon down); full git-clone fresh check (verified in place by deleting dist before each command). pnpm format:check warns only on gitignored apps/e2e report artifacts.
Stale lines: SPEC.md and conventions.md line 11 ("until D2 lands", "until D2: @abyss/prettier-config") are outdated; SPEC.md already mentions dist.
Fix log:
Fix log:
- round 1: F1 typecheck failed without dist -> packages/base-config/turbo.json: typecheck dependsOn ["$TURBO_EXTENDS$", "build"]; verified with dist removed and turbo --force (pass).
