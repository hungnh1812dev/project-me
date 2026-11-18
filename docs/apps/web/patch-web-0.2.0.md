# DevOps patch: web, repo version 0.2.0

What the deploy repo must change for web 0.2.0 (web-content-api, [web SPEC](SPEC.md) WEB-2, WEB-4, WEB-5, WEB-9), compared with the 0.1.0 setup. Web reads its page text and CV data from cms-api with an API token, caches each call for 180 s, and renames the cms-api URL key.

| Item                       | Deploy repo object                    | Change                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Target state                                                                                                           |
| -------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------- |
| 1. Rename the cms-api URL  | `web` Deployment                      | rename env `API_INTERNAL_URL` to `APP_API_URL`; the value is unchanged (`http://cms-api.<ns>.svc.cluster.local:3000/api/v1`). Web 0.2.0 does not read the old name and fails to start without the new one.                                                                                                                                                                                                                                                                                                                                                                                                                     | [configmaps.md](../../deployments/configmaps.md) section 4, [kubernetes.md](../../deployments/kubernetes.md) section 4 |
| 2. Add the API token       | `web-secrets`                         | add `APP_API_TOKEN` (required): a cms-api API token (`ak_live_...`): create the token as a dedicated account with the `guest` role, never as owner or admin (steps in "Create the API token" below), with the scope `{ "permissions": [{ "subject": "*", "action": "read" }] }` (no other entry, no write action); it reads published content only, with the `guest` role's masks (the `public` profile: `references.phone`, `experiences.company` masked), and never accounts, roles, API tokens, audit logs or media (D5); a new content type read by web needs no new token. Web refuses to start in production without it. | [secrets.md](../../deployments/secrets.md) sections 1 and 6                                                            |
| 3. Drop the revalidate key | `web` Deployment                      | remove env `WEB_REVALIDATE_SECONDS`; the cache is 180 s per call without it. Never set it (smoke and dev stacks only).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | [web.md](../../deployments/web.md) section 4                                                                           |
| 4. Add `APP_ENV`           | `web-secrets` and the GitHub variable | add `APP_ENV` (required) to `web-secrets`: `production` for every CI image (`staging` only for a locally built image, such as the smoke stack or a local registry); and create the GitHub Actions variable `APP_ENV` (repo or Environment variable) with the same value for the web image build. The two must match: web refuses to start when the runtime value differs from the value baked at build, and the image build refuses when the variable is missing or, in the `production` Environment, is not `production`. Any value but `production` turns the mock fallback on.                                              | [web.md](../../deployments/web.md) section 4, [ci-cd.md](../../deployments/ci-cd.md) section 5                         |

## Create the API token

Every anonymous visitor sees what this token reads, and the shared cache serves it, so the creator's role decides what `/cv` shows. Only the `public`, `guest` and `reviewer` roles mask sensitive fields; a token made by an owner or admin reads `references.phone` and `experiences.company` unmasked and web would publish them.

1. Create a dedicated account with the `guest` role and no type-specific read rows that unmask fields.
2. A `guest` cannot create tokens by default. The owner temporarily adds `api_tokens:create` to the `guest` role.
3. Sign in as that account and create the token with the scope above; store it as `APP_API_TOKEN`.
4. The owner removes the `api_tokens:create` grant again, and checks that the `guest` role holds no `api_tokens` row (the dev and smoke stacks do the same: `scripts/lib/stack-seed.sh`).

## Order

1. Release the cms-api version that serves the `siteText`, `moduleSignIn`, `modulePageStatus` and `cvPageText` single types (cms-api types `module-sign-in` and `module-page-status`), and apply its migration and content ([release.md](../../deployments/release.md)).
2. Create the API token for web and add `APP_API_TOKEN` to `web-secrets` (item 2); add `APP_ENV` to `web-secrets` and set the GitHub variable `APP_ENV` before the web image is built (item 4); apply items 1 and 3.
3. Only then release web 0.2.0. An earlier web finds no page text and fails start (missing `APP_API_URL`, `APP_API_TOKEN` or `APP_ENV`).

## Checks

```sh
kubectl -n <ns> rollout status deploy/web
kubectl -n <ns> get deploy web -o jsonpath='{.spec.template.spec.containers[0].env[*].name}'   # APP_API_URL, APP_ENV; no API_INTERNAL_URL, WEB_REVALIDATE_SECONDS
curl -s -o /dev/null -w '%{http_code}\n' https://<domain>/                                       # 200
curl -s -o /dev/null -w '%{http_code}\n' https://<domain>/cv                                     # 200
# with the API token (do not echo it): the masked list must name both fields
curl -s https://<cms-api-domain>/graphql -H "Authorization: Bearer $APP_API_TOKEN" -H 'Content-Type: application/json' \
  -d '{"query":"{ cvPageList { data { _maskedFields } } }"}'                                   # lists references.phone and experiences.company
curl -s https://<domain>/cv | grep -c '<a real referee phone or company>'                      # 0: the anonymous /cv HTML holds no sensitive value
```

If `_maskedFields` lacks either path, the token was not created as a `guest` account: revoke it, create it again by the steps above and restart web (cache 180 s). With no published `cvPage` the list is empty; publish one first.

`APP_API_TOKEN` is a Secret value: `kubectl ... env` lists names from `env` only; check it with `kubectl -n <ns> get secret web-secrets -o jsonpath='{.data}'` keys, never print values. A web that exits at start naming `APP_API_URL` or `APP_API_TOKEN` is missing item 1 or 2; naming `APP_ENV` it is missing item 4 or the Secret differs from the build variable.

## Rollback

Set `APP_IMAGE_TAG` back to 0.1.0 and restore `API_INTERNAL_URL` (and `WEB_REVALIDATE_SECONDS` if wanted); the extra `APP_API_TOKEN`, `APP_API_URL` and `APP_ENV` entries are ignored by the old image. cms-api stays on the new release; the old web does not read the new text types.

## Local k3s cluster: BFF route and clean web image (LG-api-1)

Found on the local k3s cluster (`k3d-local-k3s`, namespace `project-me-staging`) during the live check: the web BFF (`/api/v1/*` on `project-me.localhost`) never answered. Two causes, both fixed in the deploy repo (the manifests of that cluster); no code change. The target routes are in [traefik.md](../../deployments/traefik.md) section 1.

| Item                                        | Deploy repo object                                     | Change                                                                                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------- | ------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 5. Remove the cms-api route on the web host | Ingress `cms-api-staging`                              | remove the host `project-me.localhost` and its `/api/v1` (Prefix) path rule, and its entry in `tls`. Keep only the cms-api host `api.project-me.localhost`. The longer prefix beat the `web-staging` `/` rule, so cms-api answered every `/api/v1/*` request meant for the BFF (D21).                                                                                                   |
| 6. Remove it from the upload route          | IngressRoute `cms-api-staging-upload`                  | remove the `Host(`project-me.localhost`)` match for `POST /api/v1/media` and `PUT /api/v1/media/*/file`. Media upload then goes only through `api.project-me.localhost`. No cms-api route stays on the web host ([ADR 0018](../../adr/0018-web-bff.md)).                                                                                                                                |
| 7. Rebuild the web image clean              | image `web` (local registry), Deployment `web-staging` | the running image `web:0.0.1c` was built from `debe158c` with uncommitted edits, among them an `InstrumentationNode.setup.ts` change that prints the server env, secrets included, to the pod log (`Server env validated`). Build again from a clean commit (`git status` empty, no env dump in `InstrumentationNode.setup.ts`), push it under a new tag and set `APP_IMAGE_TAG` to it. |

Secrets: every value the old web pod printed is exposed in the logs of the local cluster. Rotate those values if the cluster or its secrets are reused anywhere else (production secrets are separate, Q-OPS11). Delete the old pod logs where the cluster keeps them. Do not paste a value into any doc or ticket.

Order: items 5 and 6 first (no restart; the router reloads), then item 7 (rolling update of `web-staging`). Item 5 and 6 do not depend on item 7.

Checks, from the test machine (`-k` only while the local CA is not trusted):

```sh
curl -sk https://project-me.localhost/api/v1/health                      # 200 {"status":"ok"}
curl -sk https://project-me.localhost/api/v1/session                     # 200 {"user":null}
curl -sk -i https://project-me.localhost/api/v1/cv                       # 401 BFF_SESSION_REQUIRED (signed out)
curl -sk -X POST https://project-me.localhost/api/v1/auth/login \
  -H 'Content-Type: application/json' -H 'Origin: https://project-me.localhost' -d '{}'   # 400 BFF_INVALID_REQUEST
curl -sk https://api.project-me.localhost/api/v1/health                  # cms-api still answers on its own host
kubectl -n project-me-staging logs deploy/web-staging | grep -c 'Server env validated'   # 0
```

Rollback: restore the removed Ingress host and rule and the upload match (the `/api/v1/*` on the web host then goes to cms-api again), and the previous `APP_IMAGE_TAG`. The old image is not safe to keep (it logs the env).
