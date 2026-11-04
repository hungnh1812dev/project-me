# DevOps patch: media, repo version 0.0.1

What the deploy repo must change for the media upload fixes in 0.0.1 (MU-2 in [SPEC.md](SPEC.md)), compared with the deployment it runs today. Without it, an upload that takes longer than Traefik's default read timeout is cut, and an early 401/403 to a slow upload is held back. The target state is in [docs/deployments/traefik.md](../../deployments/traefik.md) section 2.

| Item                         | Deploy repo object                  | Change                                                                                                                                                                                             |
| ---------------------------- | ----------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. Entry point read timeout  | Traefik static config (`websecure`) | `transport.respondingTimeouts.readTimeout: 5m` (applies to every route; also bounds slow request headers)                                                                                          |
| 2. `api-inflight` middleware | `Middleware` in the app namespace   | new: `inFlightReq`, `amount: 100` (per client IP); attach it to the `/api` route too                                                                                                               |
| 3. `upload-close` middleware | `Middleware` in the app namespace   | new: `headers.customResponseHeaders.Connection: close`                                                                                                                                             |
| 4. `api-upload` route        | the public `IngressRoute`           | new route for `POST /api/v1/media` and `PUT /api/v1/media/<id>/file` only, in every path form cms-api accepts, priority above `/api`, same cms-api service, with `api-inflight` and `upload-close` |

The manifests to copy: [traefik.md](../../deployments/traefik.md) section 1. Traefik v3.6 or a later v3 is enough; no router-level timeout is used. cms-api already sets the matching Node `requestTimeout` (5 min) in code, so it needs no config. The client IP must be the real one (`externalTrafficPolicy: Local`, `TRUST_PROXY_HOPS`), because `api-inflight` counts per client IP ([traefik.md](../../deployments/traefik.md) section 3).

## Order

1. Apply items 2 and 3 (the middlewares).
2. Apply item 4 (the route) and attach `api-inflight` to the `/api` route.
3. Apply item 1 and restart Traefik if its static config needs it.

## Checks

1. A media upload over a throttled link that takes more than 1 minute completes.
2. `POST /api/v1/media` without a session answers 401 (not 502) with `Connection: close`; a normal `GET /api/v1/...` answer has no `Connection: close`.

## Rollback

Revert the manifests in the deploy repo. Removing `api-upload` only returns uploads to the `/api` route; without `readTimeout: 5m` slow uploads are cut at the Traefik default again.
