# DevOps patch: web, repo version 0.1.0

What the deploy repo must change for web 0.1.0 (web-bff-hardening, [ADR 0018](../../adr/0018-web-bff.md)), compared with the 0.0.2 setup. The browser no longer calls cms-api: web's own Node server (the BFF) holds the session and talks to cms-api inside the cluster. Apply together with [patch-cms-api-0.1.0.md](../cms-api/patch-cms-api-0.1.0.md) and [patch-cms-admin-0.1.0.md](../cms-admin/patch-cms-admin-0.1.0.md), in the order below.

| Item                        | Deploy repo object                                         | Change                                                                                                                                                                                                             | Target state                                                                                                           |
| --------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| 1. New Secret `web-secrets` | the web SOPS-encrypted Secret                              | add `WEB_SESSION_SECRET` (at least 32 bytes, `openssl rand -base64 48`) and `TURNSTILE_SECRET_KEY` (the real Cloudflare key; web refuses the always-pass test secret in production).                               | [secrets.md](../../deployments/secrets.md) sections 1 and 6                                                            |
| 2. Web Deployment env       | `web` Deployment                                           | `envFrom` `web-secrets`; add `WEB_ORIGIN=https://<domain>`, `TURNSTILE_EXPECTED_HOSTNAME=<domain>` (required) and `TRUST_PROXY_HOPS=1`; remove `WEB_STATUS_PAGE_ENABLED`. Never set `ALLOW_TURNSTILE_TEST_SECRET`. | [configmaps.md](../../deployments/configmaps.md) section 4, [kubernetes.md](../../deployments/kubernetes.md) section 4 |
| 3. Build args (GitHub)      | GitHub Environment variables of `staging` and `production` | delete `NEXT_PUBLIC_API_BASE_URL`; keep `NEXT_PUBLIC_ADMIN_URL` and `NEXT_PUBLIC_TURNSTILE_SITE_KEY` (required).                                                                                                   | [ci-cd.md](../../deployments/ci-cd.md) section 6                                                                       |
| 4. One replica              | `web` Deployment                                           | keep `replicas: 1` (the BFF rate-limit store is in memory).                                                                                                                                                        | [kubernetes.md](../../deployments/kubernetes.md) section 6                                                             |

## Order

1. Items 1 to 3, then release web 0.1.0 and let the GitOps tool apply it first. The old `<domain>/api` route to cms-api still exists at this point, so nothing else breaks.
2. Continue with the route move in [patch-cms-api-0.1.0.md](../cms-api/patch-cms-api-0.1.0.md) and the cms-admin build in [patch-cms-admin-0.1.0.md](../cms-admin/patch-cms-admin-0.1.0.md).

## Checks

```sh
kubectl -n <ns> rollout status deploy/web
kubectl -n <ns> get deploy web -o jsonpath='{.spec.template.spec.containers[0].env[*].name}'   # no WEB_STATUS_PAGE_ENABLED, no ALLOW_TURNSTILE_TEST_SECRET
curl -s -o /dev/null -w '%{http_code}\n' https://<domain>/                                       # 200
curl -s -o /dev/null -w '%{http_code}\n' https://<domain>/status                                 # 404
```

A web that exits at start with a message naming `TURNSTILE_EXPECTED_HOSTNAME`, `WEB_SESSION_SECRET` or the test secret is missing item 1 or 2.

## Rollback

Set `APP_IMAGE_TAG` back to 0.0.2 and restore the removed env and build arg; the extra Secret and env entries are ignored by the old image. The old image needs the `<domain>/api` route and `NEXT_PUBLIC_API_BASE_URL` back, so roll back only before the route move, or restore it with it ([patch-cms-api-0.1.0.md](../cms-api/patch-cms-api-0.1.0.md) rollback).
