# Testing strategy

Part of the [project spec](../../SPEC.md); moved from the old SPEC §11. Global: it applies to every flow in `docs/flows/`.

| Level       | Tool                                   | Where                           | Required for                                                                  |
| ----------- | -------------------------------------- | ------------------------------- | ----------------------------------------------------------------------------- |
| Unit        | Jest (API), Vitest (UI)                | next to source, `*.spec.ts(x)`  | pure logic: policy evaluator, DSL compiler, generator, serializers, parsers   |
| Integration | Jest + Supertest + Testcontainers PG16 | `apps/cms-api/test/integration` | every endpoint: happy path, 401, 403, validation, plus the §12 security cases |
| Component   | Vitest + Testing Library               | `packages/form-commons`         | every exported component: props, a11y attributes, RHF integration             |
| E2E         | Playwright                             | `apps/e2e`                      | critical flows in §12 (login+2FA, edit+conflict, publish, reviewer, masking)  |

Coverage target: ≥ 80 % lines on `access`, `identity`, `documents` and `content-engine`. Every task in `tasks/todo.md` lands with its own tests; no "test phase" at the end.
