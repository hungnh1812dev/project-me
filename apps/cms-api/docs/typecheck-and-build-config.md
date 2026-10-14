# Typecheck and build config

How cms-api is typechecked, built and linted. Aimed at anyone touching tsconfig, scripts or the editor setup.

## Feature

`tsconfig.json` is solution-style (`files: []`) and references two projects, following the cms-admin pattern. `pnpm --filter cms-api typecheck` runs `tsc -b --noEmit`.

- `tsconfig.app.json`: `src` without `*.spec.ts`, `composite`, `types: ["node"]`, tsbuildinfo in `node_modules/.tmp`.
- `tsconfig.spec.json`: `src/**/*.spec.ts`, `test/` and the two vitest configs, `types: ["vitest/globals", "node"]`.
- `tsconfig.build.json`: extends the app project with `rootDir: ./src`; used by `nest build`. It writes its tsbuildinfo into `dist/`.

Decisions:

- Separate build tsbuildinfo: sharing the app one would let `nest build` overwrite it with build options, and the next typecheck would re-check the app. In `dist/` it is deleted with the output, so a clean build always emits everything.
- The spec project has no `references` to the app project: `tsc -b --noEmit` rejects a referenced project that doesn't emit (TS6310). Each file belongs to one project for the editor.
- Lint is `oxlint --type-aware src/ test/`; the editor keeps `oxc.typeAware` off, CLI and CI run it.

Measurements and the verification method are in the "Editor and tooling performance" section of [architecture](../../../docs/architecture.md).

## Files

| File                   | Spec                                                        |
| ---------------------- | ----------------------------------------------------------- |
| `tsconfig.json`        | Solution root, references the app and spec projects only.   |
| `tsconfig.app.json`    | Composite project for production sources.                   |
| `tsconfig.spec.json`   | Project for specs, e2e tests and vitest configs.            |
| `tsconfig.build.json`  | Build project for `nest build`; own tsbuildinfo in `dist/`. |
| `vitest.config.ts`     | Unit test config (`**/*.spec.ts`, tsconfig paths).          |
| `vitest.config.e2e.ts` | e2e test config.                                            |

## Testing

`bash .github/scripts/tooling.test.sh` (repo root) checks the cms-api tsconfig shape. Run it locally; it is not in CI.

## Related

- [API core](./api-core.md)
