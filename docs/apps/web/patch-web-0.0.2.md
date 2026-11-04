# DevOps patch: web, repo version 0.0.2

What the deploy repo must change for web 0.0.2, compared with the release 0.0.1 setup. CI no longer writes `main-<sha7>` or `staging-<sha7>`; it writes the app version, and only from a repo tag run ([ADR 0016](../../adr/0016-tag-driven-release-ci.md)). Apply together with [patch-cms-api-0.0.2.md](../cms-api/patch-cms-api-0.0.2.md) and [patch-cms-admin-0.0.2.md](../cms-admin/patch-cms-admin-0.0.2.md); the three have the same items and order.

| Item                       | Deploy repo object                                          | Change                                                                                                                                                                              | Target state                                     |
| -------------------------- | ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 1. Tag value format        | `<DEPLOYMENT_CLUSTER_PATH>/web-sync-overlay.yaml` on `main` | the value of `APP_IMAGE_TAG:` changes from `main-<sha7>` to `<x.y.z>` (CI writes `"0.0.2"`). Set the first value to `0.0.2` before the first release run, or let that run write it. | [ci-cd.md](../../deployments/ci-cd.md) section 4 |
| 2. `staging` branch        | the deploy repo branch `staging`                            | CI no longer bumps it. Nothing to change in the repo; whoever applies `staging` sets its tag by hand, or retires the branch.                                                        | [ci-cd.md](../../deployments/ci-cd.md) section 3 |
| 3. Image automation filter | any image-automation controller, if one exists              | a filter or policy on `main-*` (or `staging-*`) matches no tag any more; change it to the semver `<x.y.z>`, or remove the controller (CI is the only writer of the field).          | [ci-cd.md](../../deployments/ci-cd.md) section 4 |

## Order

1. Apply items 1 and 3 in the deploy repo before the first release run, so a bump commit does not collide with another writer.
2. Make the release (`release-tag` skill, repo tag `v0.0.2`, [release.md](../../deployments/release.md) section 3). The run publishes the apps and bumps `main`.
3. The GitOps tool applies the bump; cms-api first, then web and cms-admin (the deploy repo's own order applies).

## Checks

```sh
git -C <deploy-repo> log -3 --format=%s -- <DEPLOYMENT_CLUSTER_PATH>/web-sync-overlay.yaml   # chore(main): bump web to 0.0.2
kubectl -n <ns> get deploy web -o jsonpath='{.spec.template.spec.containers[*].image}'      # ghcr.io/hungnh1812dev/project-me/web:0.0.2
```

## Rollback

Set `APP_IMAGE_TAG` back to the previous value (a `main-<sha7>` tag of 0.0.1, which stays in GHCR) or revert the bump commit; the GitOps tool rolls back. A release tag is never moved or re-pushed: fix forward with the next version ([release.md](../../deployments/release.md) section 5).
