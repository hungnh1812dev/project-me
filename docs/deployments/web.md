# Web: deployment guide for DevOps

How to deploy `apps/web`, the public site, to production. This page collects the web-specific facts and links to the page that owns each detail; it does not repeat them. Entry point for the whole deployment: [devops-runbook.md](devops-runbook.md).

## 1. What web is

A Next.js server (standalone output) run by Node, as uid 1000, with no nginx in front ([kubernetes.md](kubernetes.md) section 4). It serves the public site on `https://<domain>` and a backend-for-frontend (BFF) under `<domain>/api/v1/*` that holds the visitor's sealed session cookies. It has no database. All its data comes from cms-api, called from the Node server only; the browser never calls cms-api.

## 2. Build and image

- Image: `ghcr.io/hungnh1812dev/project-me/web:<app version>`, built from `apps/web/Dockerfile` (build context is the repo root) by CI on a repo tag; tags are immutable ([ci-cd.md](ci-cd.md) sections 3 and 4).
- Build args, baked into the browser bundle, so a change needs a new release image, never a restart ([ci-cd.md](ci-cd.md) section 3, [configmaps.md](configmaps.md) section 4):
  - `NEXT_PUBLIC_TURNSTILE_SITE_KEY`: required, public Cloudflare Turnstile site key; the build fails without it.
  - `NEXT_PUBLIC_ADMIN_URL`: optional; where the "Open CMS" header link points; empty hides the link.
- Both come from GitHub Environment variables ([ci-cd.md](ci-cd.md) section 5). The images set no secret.

## 3. Runtime

- Port: `WEB_PORT`, default `8080` (image default; the Service and Traefik use 8080).
- The image has a Docker `HEALTHCHECK` that requests `/` on `127.0.0.1:$WEB_PORT`. Kubernetes ignores it. In the cluster, probe the TCP port, not `/`: `/` renders on the server and calls cms-api, so an HTTP probe would take the site offline whenever the API is slow ([kubernetes.md](kubernetes.md) section 4, which holds the probes and resources). The web app has no dedicated health route.
- One replica ([kubernetes.md](kubernetes.md) section 6).
- Start fails on an invalid value (see section 4), so a bad config shows as a crash-looping pod with the key name in the log.

## 4. Environment keys

Names and meaning only. Values for production: [configmaps.md](configmaps.md) section 4. Secrets: [secrets.md](secrets.md). Source of truth: `apps/web/.env.example`.

| Key                           | Where                       | Meaning                                                                                                                                               |
| ----------------------------- | --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| `APP_API_URL`                 | env, required               | cms-api base URL as the web pod reaches it inside the cluster (server only); replaces `API_INTERNAL_URL`                                              |
| `WEB_ORIGIN`                  | env, required               | exact origin of the site, no path; the BFF accepts state-changing requests only from this `Origin`                                                    |
| `WEB_SESSION_SECRET`          | `web-secrets`, required     | key material sealing the session cookies; at least 32 bytes in production, else start fails                                                           |
| `TURNSTILE_SECRET_KEY`        | `web-secrets`, required     | Cloudflare Turnstile secret key; the BFF verifies every human check with it                                                                           |
| `TURNSTILE_EXPECTED_HOSTNAME` | env, required in production | bare lower-case hostname a Turnstile answer must carry                                                                                                |
| `TRUST_PROXY_HOPS`            | env, default 1              | proxies in front of web; the visitor IP is the Nth address from the right of `X-Forwarded-For` ([traefik.md](traefik.md) section 3)                   |
| `CLIENT_IP_HEADER`            | env, optional               | header a trusted CDN sets to the visitor IP; wins over `X-Forwarded-For` when set                                                                     |
| `APP_API_TOKEN`               | `web-secrets`, required     | cms-api API token (`ak_live_...`) that web sends as Bearer for page content; create it with a read-only account so its reads are the `public` profile |
| `WEB_PORT`                    | env, default 8080           | port the server listens on                                                                                                                            |

Never set in deploy config (smoke and dev stacks only; production web refuses or ignores them): `ALLOW_TURNSTILE_TEST_SECRET`, `BFF_AUTH_RATE_LIMIT_IP`, `ALLOW_BFF_RATE_LIMIT_OVERRIDE`, `ALLOW_MOCK_FALLBACK`, `WEB_REVALIDATE_SECONDS` (the cache is 180 s per call without it). Removed keys to delete from the deploy repo: `NEXT_PUBLIC_API_BASE_URL`, `WEB_STATUS_PAGE_ENABLED`, `API_INTERNAL_URL`, `WEB_REVALIDATE_SECONDS` ([configmaps.md](configmaps.md) section 4).

## 5. Routing (Traefik)

The whole `<domain>` host goes to the web Service on 8080; there is no cms-api route on `<domain>`. `<domain>/api/v1/*` is the web BFF, and any other `<domain>/api/*` answers 404 from web. Never StripPrefix, and no redirect on `/api/v1/*`. TLS ends at Traefik. Routes, priorities, client IP: [traefik.md](traefik.md) sections 1, 3 and 4.

## 6. Dependency on cms-api

- Web reaches cms-api through `APP_API_URL` (cluster DNS, port 3000). cms-api must accept ingress from the web pods: NetworkPolicy example in [kubernetes.md](kubernetes.md) section 4 (pod label `app: web`).
- Deploy order: cms-api first, then web ([release.md](release.md) section 2), so a new web never waits on an API still migrating.

## 7. Release, upgrade, rollback

- Release: [release.md](release.md) section 3. A web release is a new `<app version>` image, tagged by CI, with `APP_IMAGE_TAG` bumped in `web-sync-overlay.yaml` of the deploy repo ([ci-cd.md](ci-cd.md) section 4). Rolling update, `maxUnavailable: 0`.
- A change to a build arg or to `web-secrets`/env: build args need a new release; env and Secret changes need a pod restart ([release.md](release.md) section 2, step 3).
- Rollback: set `APP_IMAGE_TAG` for web back to the previous version in the deploy repo, or `git revert` the bump commit; do not use `kubectl rollout undo` ([release.md](release.md) section 5). Web holds no data, so a rollback has no schema effect.
- Rotating `WEB_SESSION_SECRET` or `TURNSTILE_SECRET_KEY`: [secrets.md](secrets.md) section 7.

## 8. Checks after a deploy

1. `kubectl -n <ns> rollout status deploy/web` finishes; the pod is `Running`, `READY 1/1`, restarts not climbing; the log has no env error naming a key.
2. `https://<domain>/` loads over HTTPS (HTTP redirects to HTTPS) and the browser console shows no CSP violations.
3. The "Open CMS" link points to `https://admin.<domain>`, or is hidden when `NEXT_PUBLIC_ADMIN_URL` is empty.
4. The sign-in dialog shows the Turnstile widget (site key baked in) and sign-in succeeds (BFF, `WEB_ORIGIN`, `WEB_SESSION_SECRET`, `TURNSTILE_*` all work).
5. `https://<domain>/api/unknown` answers 404 from web (no cms-api route on the public host).
6. The response carries no `X-Powered-By` header.
7. The Traefik access log shows real client IPs ([traefik.md](traefik.md) section 3).
8. Content on the home page is current after 180 s (the per-call data cache) once an editor publishes a change.

## 9. What lives in the deploy repo

This repo gives the image, the contract and example manifests; the deploy repo owns the real ones. DevOps changes there:

- `web-sync-overlay.yaml` in `DEPLOYMENT_CLUSTER_PATH` with an `APP_IMAGE_TAG:` line ([ci-cd.md](ci-cd.md) section 4).
- The web Deployment and Service: env, probes, resources, `securityContext` ([kubernetes.md](kubernetes.md) section 4).
- Secret `web-secrets` with `WEB_SESSION_SECRET` and `TURNSTILE_SECRET_KEY` ([secrets.md](secrets.md)).
- The Traefik IngressRoute for `<domain>` to web:8080 and the HTTPS redirect ([traefik.md](traefik.md)).
- The cms-api NetworkPolicy that admits the web pods.
- GitHub Environment variables `NEXT_PUBLIC_TURNSTILE_SITE_KEY` and `NEXT_PUBLIC_ADMIN_URL` live in this repo's GitHub settings, not the deploy repo.
