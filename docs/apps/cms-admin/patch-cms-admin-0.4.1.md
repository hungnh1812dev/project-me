# DevOps patch: cms-admin, repo version 0.4.1

What the deploy repo must change for cms-admin 0.4.1, compared with the 0.4.0 setup. The cms-admin nginx serves `/health`, `/health/live` and `/health/ready` itself and `/health/ready` asks cms-api, so the image needs the cms-api address, the pod probes move and the pod must reach cms-api (ADM-12, [cms-admin SPEC](SPEC.md)). Apply staging first, then production.

| Item                              | Deploy repo object                           | Change                                                                                                                                                                      | Target state                                                                                                           |
| --------------------------------- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| 1. ConfigMap key `APP_API_ORIGIN` | ConfigMap `cms-admin-config`, the Deployment | add `APP_API_ORIGIN: http://cms-api.<namespace>.svc.cluster.local:3000` (no path) and read it from the Deployment env. Required: the 0.4.1 image does not start without it. | [configmaps.md](../../deployments/configmaps.md) section 5, [kubernetes.md](../../deployments/kubernetes.md) section 5 |
| 2. Pod probes                     | the `cms-admin` Deployment                   | `livenessProbe` and `readinessProbe` path `/health/live` (was `GET /`), port 8080. Readiness never uses `/health/ready`, so a cms-api outage does not unready cms-admin.    | [kubernetes.md](../../deployments/kubernetes.md) section 5                                                             |
| 3. NetworkPolicy rule             | the NetworkPolicy `cms-api-ingress`          | add the cms-admin pods (`podSelector` `app: cms-admin`) to the `from` list for TCP 3000, so `/health/ready` can ask cms-api.                                                | [kubernetes.md](../../deployments/kubernetes.md) section 4                                                             |

## Order

1. Put items 1, 2 and 3 and the new cms-admin image tag (`APP_IMAGE_TAG`) in one deploy commit. An image older than 0.4.1 has no `/health/live` (its pod with the new probes never becomes ready); the 0.4.1 image without item 1 exits at start.
2. Release cms-api 0.4.1 in the same release ([cms-api patch 0.4.1](../cms-api/patch-cms-api-0.4.1.md)): `/health/ready` and the status card read its `/health/live` and `/health`.
3. Checks ([cms-admin SPEC](SPEC.md) ADM-12 "Check"): inside the cluster, cms-admin's `/health` and `/health/live` on 8080 answer 200 `{"status":"ok"}` (still 200 with cms-api stopped) and `/health/ready` answers 200 with cms-api up and 503 within about 2 s with it stopped, e.g. `kubectl -n <ns> exec deploy/cms-admin -- wget -qO- http://127.0.0.1:8080/health/ready`; through the proxy `https://admin.<domain>/health` is cms-api's answer and `/health/live` and `/health/ready` answer 403 ([traefik.md](../../deployments/traefik.md) section 1); the status card shows cms-api up.

## Rollback

Put the previous image tag back together with the previous probes in one deploy commit. The extra `APP_API_ORIGIN` key and the NetworkPolicy rule are harmless and can stay. A release tag is never moved: fix forward with the next version ([release.md](../../deployments/release.md) section 5).
