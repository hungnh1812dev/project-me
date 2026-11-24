# DevOps patch: web, repo version 0.5.0

What the deploy repo must change for web 0.5.0, compared with the 0.4.0 setup. The web serves `/health`, `/health/live` and `/health/ready` itself (PS-8, [public-site SPEC](../../flows/public-site/SPEC.md)), so the pod probes move from a TCP check to an HTTP check. Apply staging first, then production.

| Item          | Deploy repo object   | Change                                                                                                                                                                                            | Target state                                               |
| ------------- | -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 1. Pod probes | the `web` Deployment | `livenessProbe` and `readinessProbe` change from `tcpSocket` on 8080 to `httpGet` path `/health/live`, port 8080. Readiness never uses `/health/ready`, so a cms-api outage does not unready web. | [kubernetes.md](../../deployments/kubernetes.md) section 4 |

## Order

1. Put item 1 and the new web image tag (`APP_IMAGE_TAG`) in one deploy commit. An image older than 0.5.0 has no `/health/live` (it answers 404), so its pod with the new probes never becomes ready.
2. Checks: `kubectl -n <ns> rollout status deploy/web` finishes with `READY 1/1`; `curl -fsS https://<domain>/health` answers `{"status":"ok"}`; `https://<domain>/health/live` and `/health/ready` answer 403 from Traefik ([traefik.md](../../deployments/traefik.md) section 1); in the cluster `kubectl -n <ns> exec deploy/web -- wget -qO- http://127.0.0.1:8080/health/ready` answers `{"status":"ok"}` while cms-api runs ([web.md](../../deployments/web.md) section 8).

## Rollback

Put the previous image tag back together with the previous TCP probes in one deploy commit. A release tag is never moved: fix forward with the next version ([release.md](../../deployments/release.md) section 5).
