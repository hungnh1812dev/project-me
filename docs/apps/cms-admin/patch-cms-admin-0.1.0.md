# DevOps patch: cms-admin, repo version 0.1.0

What the deploy repo and GitHub must change for cms-admin 0.1.0, compared with the 0.0.2 setup (web-bff-hardening, [ADR 0018](../../adr/0018-web-bff.md)). cms-admin now reaches cms-api on its own origin, `https://admin.<domain>/api/v1`, so the API route must exist on the admin host before this image runs. Apply together with [patch-web-0.1.0.md](../web/patch-web-0.1.0.md) and [patch-cms-api-0.1.0.md](../cms-api/patch-cms-api-0.1.0.md).

| Item         | Where                                           | Change                                                                                                                                                         | Target state                                               |
| ------------ | ----------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 1. Build arg | GitHub Environment variable `VITE_API_BASE_URL` | set to `https://admin.<domain>/api/v1` in `staging` and `production` (it was `https://<domain>/api/v1` or an `api.<domain>` host). A change needs a new image. | [ci-cd.md](../../deployments/ci-cd.md) section 6           |
| 2. CSP       | cms-admin env `CSP_CONNECT_SRC`                 | none: `connect-src` is derived from the build arg at start. Remove an old `CSP_CONNECT_SRC` override that names the previous API host.                         | [configmaps.md](../../deployments/configmaps.md) section 5 |

## Order

1. Web 0.1.0, then the admin-host `/api` and `api-upload` routes ([patch-cms-api-0.1.0.md](../cms-api/patch-cms-api-0.1.0.md) order, steps 1 and 2).
2. Set item 1, release, and let the GitOps tool roll out cms-admin 0.1.0.
3. Remove the `<domain>/api` routes and apply the NetworkPolicy (cms-api patch steps 3 and 4).

## Checks

```sh
kubectl -n <ns> get deploy cms-admin -o jsonpath='{.spec.template.spec.containers[0].image}'   # ghcr.io/hungnh1812dev/project-me/cms-admin:0.1.0
curl -sI https://admin.<domain>/ | grep -i content-security-policy                             # connect-src 'self' https://admin.<domain>
```

Sign in at `https://admin.<domain>`: the browser network tab shows `/api/v1/...` calls on the admin host only, with no CORS preflight.

## Rollback

Set `APP_IMAGE_TAG` back to 0.0.2 and `VITE_API_BASE_URL` to its old value; the old image needs the old API host route, so roll back before step 3 of the order or restore the route first.
