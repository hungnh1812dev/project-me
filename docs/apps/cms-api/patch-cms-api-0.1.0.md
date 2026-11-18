# DevOps patch: cms-api, repo version 0.1.0

What the deploy repo must change for cms-api, compared with the 0.0.2 setup (web-bff-hardening, [ADR 0018](../../adr/0018-web-bff.md)). cms-api has no code change in this release; the change is where it is reachable: only on the admin host, and inside the cluster only from Traefik and the web pods. Apply together with [patch-web-0.1.0.md](../web/patch-web-0.1.0.md) and [patch-cms-admin-0.1.0.md](../cms-admin/patch-cms-admin-0.1.0.md).

| Item               | Deploy repo object                  | Change                                                                                                                                                                  | Target state                                                 |
| ------------------ | ----------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| 1. Routes move     | Traefik `IngressRoute`s             | the `/api` route and `api-upload` move from `Host(<domain>)` to `Host(admin.<domain>)` (same priorities and middlewares); the `<domain>` host keeps only the web route. | [traefik.md](../../deployments/traefik.md) section 1         |
| 2. NetworkPolicy   | new `cms-api-ingress` NetworkPolicy | cms-api ingress on 3000 only from the Traefik pods and the web pods. The CNI must enforce NetworkPolicy.                                                                | [kubernetes.md](../../deployments/kubernetes.md) section 4   |
| 3. Origins         | `cms-api-config`                    | no change: `ADMIN_ORIGIN=https://admin.<domain>` stays the only CORS origin; `WEB_ORIGIN` stays.                                                                        | [configmaps.md](../../deployments/configmaps.md) section 2   |
| 4. Reviewer switch | runbook                             | the web `/status` page and reviewer button are gone; the switch is `REVIEWER_FEATURE_ENABLED` only.                                                                     | [devops-runbook.md](../../deployments/devops-runbook.md) 5.2 |

## Order

1. Web 0.1.0 first ([patch-web-0.1.0.md](../web/patch-web-0.1.0.md)); the old `<domain>/api` route is still in place.
2. Add the admin-host `/api` and `api-upload` routes (item 1) next to the old ones. Then build and roll out cms-admin with `VITE_API_BASE_URL=https://admin.<domain>/api/v1` ([patch-cms-admin-0.1.0.md](../cms-admin/patch-cms-admin-0.1.0.md)); until it runs, the old admin keeps using the old host.
3. Remove the `<domain>/api` and `<domain>` `api-upload` routes.
4. Apply the NetworkPolicy (item 2) last, once web and Traefik reach cms-api as before.

## Checks

```sh
curl -s -o /dev/null -w '%{http_code}\n' https://admin.<domain>/api/v1/health/live    # 200
curl -s -o /dev/null -w '%{http_code}\n' https://<domain>/api/v1/health/live          # 404, from web
kubectl -n <ns> run np-check --rm -it --image=busybox --restart=Never -- wget -qO- -T 3 http://cms-api.<ns>.svc.cluster.local:3000/api/v1/health/live   # times out: not Traefik or web
```

Then sign in at `https://admin.<domain>` and upload one media file (the `api-upload` route).

## Rollback

Delete the NetworkPolicy, re-add the `<domain>/api` and `api-upload` routes (keep the admin-host ones), then roll cms-admin back to its 0.0.2 image if it was rebuilt. A release tag is never moved: fix forward with the next version ([release.md](../../deployments/release.md) section 5).
