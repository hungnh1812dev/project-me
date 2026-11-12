# DevOps patch: web, repo version 0.2.0

What the deploy repo must change for web 0.2.0 (web-content-api, [web SPEC](SPEC.md) WEB-2, WEB-4, WEB-5), compared with the 0.1.0 setup. Web reads its page text and CV data from cms-api with an API token, caches each call for 180 s, and renames the cms-api URL key.

| Item                       | Deploy repo object | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Target state                                                                                                           |
| -------------------------- | ------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| 1. Rename the cms-api URL  | `web` Deployment   | rename env `API_INTERNAL_URL` to `APP_API_URL`; the value is unchanged (`http://cms-api.<ns>.svc.cluster.local:3000/api/v1`). Web 0.2.0 does not read the old name and fails to start without the new one.                                                                                                                                                                                                                                                                                                                                                                                                                     | [configmaps.md](../../deployments/configmaps.md) section 4, [kubernetes.md](../../deployments/kubernetes.md) section 4 |
| 2. Add the API token       | `web-secrets`      | add `APP_API_TOKEN` (required): a cms-api API token (`ak_live_...`): create the token as a dedicated account with the `guest` role, never as owner or admin (steps in "Create the API token" below), with the scope `{ "permissions": [{ "subject": "*", "action": "read" }] }` (no other entry, no write action); it reads published content only, with the `guest` role's masks (the `public` profile: `references.phone`, `experiences.company` masked), and never accounts, roles, API tokens, audit logs or media (D5); a new content type read by web needs no new token. Web refuses to start in production without it. | [secrets.md](../../deployments/secrets.md) sections 1 and 6                                                            |
| 3. Drop the revalidate key | `web` Deployment   | remove env `WEB_REVALIDATE_SECONDS`; the cache is 180 s per call without it. Never set it, nor `ALLOW_MOCK_FALLBACK` (smoke and dev stacks only).                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | [web.md](../../deployments/web.md) section 4                                                                           |

## Create the API token

Every anonymous visitor sees what this token reads, and the shared cache serves it, so the creator's role decides what `/cv` shows. Only the `public`, `guest` and `reviewer` roles mask sensitive fields; a token made by an owner or admin reads `references.phone` and `experiences.company` unmasked and web would publish them.

1. Create a dedicated account with the `guest` role and no type-specific read rows that unmask fields.
2. A `guest` cannot create tokens by default. The owner temporarily adds `api_tokens:create` to the `guest` role.
3. Sign in as that account and create the token with the scope above; store it as `APP_API_TOKEN`.
4. The owner removes the `api_tokens:create` grant again, and checks that the `guest` role holds no `api_tokens` row (the dev and smoke stacks do the same: `scripts/lib/stack-seed.sh`).

## Order

1. Release the cms-api version that serves the `siteText`, `moduleSignIn`, `modulePageStatus` and `cvPageText` single types (cms-api types `module-sign-in` and `module-page-status`), and apply its migration and content ([release.md](../../deployments/release.md)).
2. Create the API token for web and add `APP_API_TOKEN` to `web-secrets` (item 2); apply items 1 and 3.
3. Only then release web 0.2.0. An earlier web finds no page text and fails start (missing `APP_API_URL` or `APP_API_TOKEN`).

## Checks

```sh
kubectl -n <ns> rollout status deploy/web
kubectl -n <ns> get deploy web -o jsonpath='{.spec.template.spec.containers[0].env[*].name}'   # APP_API_URL; no API_INTERNAL_URL, WEB_REVALIDATE_SECONDS, ALLOW_MOCK_FALLBACK
curl -s -o /dev/null -w '%{http_code}\n' https://<domain>/                                       # 200
curl -s -o /dev/null -w '%{http_code}\n' https://<domain>/cv                                     # 200
# with the API token (do not echo it): the masked list must name both fields
curl -s https://<cms-api-domain>/graphql -H "Authorization: Bearer $APP_API_TOKEN" -H 'Content-Type: application/json' \
  -d '{"query":"{ cvPageList { data { _maskedFields } } }"}'                                   # lists references.phone and experiences.company
curl -s https://<domain>/cv | grep -c '<a real referee phone or company>'                      # 0: the anonymous /cv HTML holds no sensitive value
```

If `_maskedFields` lacks either path, the token was not created as a `guest` account: revoke it, create it again by the steps above and restart web (cache 180 s). With no published `cvPage` the list is empty; publish one first.

`APP_API_TOKEN` is a Secret value: `kubectl ... env` lists names from `env` only; check it with `kubectl -n <ns> get secret web-secrets -o jsonpath='{.data}'` keys, never print values. A web that exits at start naming `APP_API_URL` or `APP_API_TOKEN` is missing item 1 or 2.

## Rollback

Set `APP_IMAGE_TAG` back to 0.1.0 and restore `API_INTERNAL_URL` (and `WEB_REVALIDATE_SECONDS` if wanted); the extra `APP_API_TOKEN` and `APP_API_URL` entries are ignored by the old image. cms-api stays on the new release; the old web does not read the new text types.
