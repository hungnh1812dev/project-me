# DevOps patch: web, repo version 0.0.1

What the deploy repo must change for web 0.0.1, compared with the deployment it runs today (last reviewed on 2026-10-28). Apply staging first, then production, together with [patch-cms-api-0.0.1.md](../cms-api/patch-cms-api-0.0.1.md) (same rollout order). The target state is in [docs/deployments/](../../deployments/devops-runbook.md).

| Item                      | Deploy repo object              | Change                                                                                              | Target state                                               |
| ------------------------- | ------------------------------- | --------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 1. Port key (blocker)     | the web ConfigMap               | `APP_PORT: "8080"`                                                                                  | [kubernetes.md](../../deployments/kubernetes.md) section 2 |
| 2. Image name             | the web ConfigMap / Deployment  | the image repository is `ghcr.io/hungnh1812dev/project-me/web`, not the earlier `frontend` image    | [ci-cd.md](../../deployments/ci-cd.md) section 3           |
| 3. Overlay file name      | `<DEPLOYMENT_CLUSTER_PATH>/`    | the overlay CI bumps is `web-sync-overlay.yaml` (renamed from the earlier `frontend` overlay)       | [ci-cd.md](../../deployments/ci-cd.md) section 5, step 6   |
| 4. Probes                 | the web Deployment              | probe the port, not `/` (below)                                                                     | [kubernetes.md](../../deployments/kubernetes.md) section 4 |
| 5. Template key reference | the web secrets/config template | point at `apps/web/.env.example` (not `apps/frontend/.env.example`)                                 | [configmaps.md](../../deployments/configmaps.md) section 4 |
| 6. Status page switch     | the web secrets/config template | add the optional `WEB_STATUS_PAGE_ENABLED` (commented out; unset or `false`: `/status` answers 404) | [configmaps.md](../../deployments/configmaps.md) section 4 |

Item 4: `/` renders the home page, which fails when cms-api is down or slow, so an HTTP probe on `/` takes the whole site offline, and a liveness probe with the default 1 s timeout restarts the pod on a slow render:

```yaml
livenessProbe:
  tcpSocket: { port: http }
  initialDelaySeconds: 10
  periodSeconds: 20
readinessProbe:
  tcpSocket: { port: http }
  periodSeconds: 10
```

## Checks

```sh
kubectl -n <ns> get pods                 # web Running, READY 1/1, restarts not climbing
curl -fsSI https://<domain>/             # the home page loads
```

## Rollback

As for cms-api: revert both the CI tag commits and the manifest merge on the environment branch, then reconcile ([patch-cms-api-0.0.1.md](../cms-api/patch-cms-api-0.0.1.md), "Rollback").
