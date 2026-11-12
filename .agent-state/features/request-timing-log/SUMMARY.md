# Summary: request-timing-log

## Overview
- cms-api logs one line per finished request: method, path without query, status, duration in ms. Requests over 1000 ms log at warn. Health probes are skipped. Aborted requests are not logged.
- The app logger gained the `info` level so these lines are emitted at info.

## Sub-features
- RTL-1: `info` level on the cms-api app logger (port, Nest adapter, test fakes).
- RTL-2: request duration middleware, mounted in the app setup.
- API-1: requirement recorded in `docs/apps/cms-api/SPEC.md`.

## Structure
- `apps/cms-api/src/common/middleware/`: new RequestTiming middleware and its spec.
- `apps/cms-api/src/infrastructure/logging/`: logger port and Nest adapter, with specs.
- `apps/cms-api/src/App.setup.ts`: middleware wiring.
- `apps/cms-api/src/modules/` and `test/`: spec and fixture updates for the new logger level.
- `docs/apps/cms-api/SPEC.md`, `docs/modules/cms-api/` (`common.md`, `logging.md`), `CHANGELOG.md`.

## Commits
- `0042314d` feat(cms-api): add the info level to the app logger
- `d9196721` feat(cms-api): log the duration of every request
- `65508bae` docs(cms-api): add the request duration log requirement (API-1)
- Head: 65508bae

## Known issues
- None (no resolved findings recorded).
- qc notes accepted by the user: CRTL-3 was run on `%20` rather than `%0A`; CRTL-6 emits `finish` twice rather than `finish` then `close`.
