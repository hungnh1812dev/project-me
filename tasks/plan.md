# Plan: Monorepo Scaffold

Spec: [../SPEC.md](../SPEC.md). Open questions resolved with their defaults: each generator keeps its own TypeScript version, zod/Tailwind/Radix are not installed, and nothing is committed.

## Order and dependencies

```
T1 root wiring ──┬─> T2 shared packages ─┐
                 ├─> T3 cms-api ─────────┤
                 ├─> T4 cms-admin ───────┼─> T6 install + verify
                 └─> T5 frontend ────────┘
```

T2–T5 each depend only on T1 and could run in parallel. They run one after another so each generator's output can be checked before the next one starts.

## Risks

| Risk | Mitigation |
|---|---|
| A CLI flag changed in the latest version (nest 12, create-vite 9, create-next-app 16.3) | Check `--help` first and use the non-interactive equivalent. Record any change in SPEC.md. |
| A generator creates a nested `.git` or lockfile | Remove it after generation. This is allowed wiring. |
| pnpm 11 blocks dependency build scripts (@swc/core, @nestjs/core, sharp, unrs-resolver) | Add them to the build-script allowlist in `pnpm-workspace.yaml`. |
| pnpm 11 `minimumReleaseAge` holds back very new releases; install auto-adds them to `minimumReleaseAgeExclude` (seen in T1 for turbo 2.11.5) | Keep the auto-added entries; review the list in T6. |
| TypeScript versions differ between apps | Accepted (Open Question 1 default). Flag it if it breaks the build. |
| `pnpm lint` fails on generator output | Report it and ask. Don't edit app code. |

## Checkpoints
- After T1: `pnpm install` works on the empty workspace.
- After each of T3–T5: the app folder exists, the name is right, and there is no stray `.git` or lockfile.
- T6: all 8 Success Criteria in SPEC.md are met.
