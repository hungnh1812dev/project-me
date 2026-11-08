# DevOps patch: web, repo version 0.2.0

What the deploy repo must change for web 0.2.0 (web-content-api, [web SPEC](SPEC.md) WEB-2, WEB-4, WEB-5), compared with the 0.1.0 setup. Web reads its page text and CV data from cms-api with an API token, caches each call for 180 s, and renames the cms-api URL key.

| Item                       | Deploy repo object | Change                                                                                                                                                                                                     | Target state                                                                                                           |
| -------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1. Rename the cms-api URL  | `web` Deployment   | rename env `API_INTERNAL_URL` to `APP_API_URL`; the value is unchanged (`http://cms-api.<ns>.svc.cluster.local:3000/api/v1`). Web 0.2.0 does not read the old name and fails to start without the new one. | [configmaps.md](../../deployments/configmaps.md) section 4, [kubernetes.md](../../deployments/kubernetes.md) section 4 |
| 2. Add the API token       | `web-secrets`      | add `APP_API_TOKEN` (required): a cms-api API token (`ak_live_...`) created by a read-only account, so its reads are the `public` profile. Web refuses to start in production without it.                  | [secrets.md](../../deployments/secrets.md) sections 1 and 6                                                            |
| 3. Drop the revalidate key | `web` Deployment   | remove env `WEB_REVALIDATE_SECONDS`; the cache is 180 s per call without it. Never set it, nor `ALLOW_MOCK_FALLBACK` (smoke and dev stacks only).                                                          | [web.md](../../deployments/web.md) section 4                                                                           |

## Order

1. Release the cms-api version that serves the `siteText`, `signInText`, `statusPageText` and `cvPageText` single types, and apply its migration and content ([release.md](../../deployments/release.md)).
2. Create the API token for web and add `APP_API_TOKEN` to `web-secrets` (item 2); apply items 1 and 3.
3. Only then release web 0.2.0. An earlier web finds no page text and fails start (missing `APP_API_URL` or `APP_API_TOKEN`).

## Checks

```sh
kubectl -n <ns> rollout status deploy/web
kubectl -n <ns> get deploy web -o jsonpath='{.spec.template.spec.containers[0].env[*].name}'   # APP_API_URL; no API_INTERNAL_URL, WEB_REVALIDATE_SECONDS, ALLOW_MOCK_FALLBACK
curl -s -o /dev/null -w '%{http_code}\n' https://<domain>/                                       # 200
curl -s -o /dev/null -w '%{http_code}\n' https://<domain>/cv                                     # 200
```

`APP_API_TOKEN` is a Secret value: `kubectl ... env` lists names from `env` only; check it with `kubectl -n <ns> get secret web-secrets -o jsonpath='{.data}'` keys, never print values. A web that exits at start naming `APP_API_URL` or `APP_API_TOKEN` is missing item 1 or 2.

## Rollback

Set `APP_IMAGE_TAG` back to 0.1.0 and restore `API_INTERNAL_URL` (and `WEB_REVALIDATE_SECONDS` if wanted); the extra `APP_API_TOKEN` and `APP_API_URL` entries are ignored by the old image. cms-api stays on the new release; the old web does not read the new text types.
