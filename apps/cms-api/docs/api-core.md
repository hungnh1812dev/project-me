# API core

The Nest application skeleton: bootstrap, root module and the single hello route (`Hello World!`). It is the base the real API modules will be added to.

## Feature

- `main.ts` creates the Nest app from `AppModule` and listens on `PORT` (default 3000).
- `GET /` returns the greeting from `AppService`.
- Build, lint and test commands live in `package.json`; the tsconfig layout is described in [Typecheck and build config](./typecheck-and-build-config.md).

## Files

| File | Spec |
| ---- | ---- |
| `src/main.ts` | Bootstraps `AppModule` and starts the HTTP server. |
| `src/app.module.ts` | Exports `AppModule`, the root module wiring the controller and service. |
| `src/app.controller.ts` | Exports `AppController`; the root route, delegates to `AppService`. |
| `src/app.service.ts` | Exports `AppService`; returns the greeting string. |

## Testing

- `src/app.controller.spec.ts`: unit test of `AppController` (`pnpm --filter cms-api test`).
- `test/app.e2e-spec.ts`: e2e test of the root route (`pnpm --filter cms-api test:e2e`).

## Related

- [Typecheck and build config](./typecheck-and-build-config.md)
