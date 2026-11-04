# DevOps patch: cms-api, repo version 0.0.1

What the deploy repo must change for cms-api 0.0.1, compared with the deployment it runs today (the deploy repo was last reviewed against this repo on 2026-10-28). Apply staging first, then production. The target state is described in [docs/deployments/](../../deployments/devops-runbook.md); this page lists only the changes.

| Item                                   | Deploy repo object                  | Change                                                                                                                                                                                        | Target state                                               |
| -------------------------------------- | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 1. Port key (blocker)                  | the cms-api ConfigMap               | `APP_PORT: "3000"`                                                                                                                                                                            | [kubernetes.md](../../deployments/kubernetes.md) section 2 |
| 2. `/api` on the bare domain (blocker) | the cms-api Ingress / route         | add the bare domain `<domain>` with path prefix `/api` to cms-api, next to the existing `api.<domain>` host; never StripPrefix. Without it the web bundle's calls to `/api/v1` get web's 404. | [traefik.md](../../deployments/traefik.md) section 1       |
| 3. Reviewer switch                     | the cms-api secrets/config template | add `REVIEWER_FEATURE_ENABLED: '<true-or-false>'` (`false` or unset: reviewer features off)                                                                                                   | [configmaps.md](../../deployments/configmaps.md) section 1 |
| 4. Keys the app no longer reads        | the cms-api secrets template        | remove the "old config" block                                                                                                                                                                 | [configmaps.md](../../deployments/configmaps.md) section 7 |

Example of item 2 on a plain Kubernetes Ingress (keep the existing `api.<domain>` rule unchanged; the longer path wins over web's `/` rule):

```yaml
spec:
  tls:
    - hosts: [api.<domain>, <domain>]
      secretName: <cms-api-tls>
  rules:
    - host: api.<domain>
      # unchanged
    - host: <domain>
      http:
        paths:
          - path: /api
            pathType: Prefix
            backend:
              service: { name: <cms-api-service>, port: { name: http } }
```

## Order

The new manifests do not run on the images pinned before this release, and the new images do not run on the old manifests. Per environment:

1. Set the port keys on the cluster (item 1 here, and the web port in [patch-web-0.0.1.md](../web/patch-web-0.0.1.md)) and apply them.
2. Merge the manifest changes into the environment branch; keep that branch's `APP_IMAGE_TAG` lines (CI owns them).
3. Run the image build for that environment; CI commits the new tags.
4. Wait until every sync is healthy, then run the checks below. While a rollout waits, do not delete the old pods or the old ReplicaSet: the old pod is the only one serving.

## Checks

```sh
kubectl -n <ns> get pods                                    # Running, READY 1/1, restarts not climbing
kubectl -n <ns> logs deploy/<cms-api-deployment> -c <init>  # migrations finished
curl -fsS https://<domain>/api/v1/health/ready              # answered by cms-api (item 2)
curl -fsS https://api.<domain>/api/v1/health/ready
```

## Rollback

Revert both the CI tag commits and the manifest merge on the environment branch, then reconcile. Reverting only one of them leaves the broken mix described in "Order".
