# DevOps patch: cms-api, repo version 0.5.0

What the deploy repo must change for cms-api 0.5.0, compared with the 0.4.0 setup. cms-api serves its health routes at the server root (`/health`, `/health/live`, `/health/ready`) and no longer at `/api/v1/health/*` (API-3, [cms-api SPEC](SPEC.md)), so the Kubernetes probes and the admin-host Traefik route change. Apply staging first, then production.

| Item                     | Deploy repo object                     | Change                                                                                                                                                   | Target state                                               |
| ------------------------ | -------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 1. cms-api probe paths   | the cms-api Deployment                 | `livenessProbe` path `/health/live` (was `/api/v1/health/live`) and `readinessProbe` path `/health/ready` (was `/api/v1/health/ready`), port 3000.       | [kubernetes.md](../../deployments/kubernetes.md) section 3 |
| 2. Admin-host route rule | the Traefik `IngressRoute` `api` route | `match` becomes ``Host(`admin.<domain>`) && PathRegexp(`^/(api\|health)(/\|$)`)``, same priority; `/healthz` stays cms-admin; the web host is unchanged. | [traefik.md](../../deployments/traefik.md) section 1       |

## Order

1. Put items 1 and 2 and the new cms-api image tag (`APP_IMAGE_TAG`) in one deploy commit. A new pod with the old probes never becomes ready (the old paths answer 404); an old pod with the new probes is killed.
2. Then release the cms-admin and web images of the same release. Their status cards read cms-api's `/health/live` and show cms-api down until cms-api 0.5.0 runs.
3. Checks, through the proxy ([cms-api SPEC](SPEC.md) API-3 "Check"): `GET https://admin.<domain>/health`, `/health/live` and `/health/ready` answer 200 `{"status":"ok"}` from cms-api; with the database stopped `/health/ready` answers 503 while the other two stay 200; `/api/v1/health/live` answers cms-api's 404; on `<domain>`, `/health` is still the web's check and `/health/live` the web's 404; both status cards show cms-api up.

## Rollback

Put the previous image tag back together with the previous probe paths and route rule (items 1 and 2) in one deploy commit. A release tag is never moved: fix forward with the next version ([release.md](../../deployments/release.md) section 5).
