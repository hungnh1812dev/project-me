# Local registry push

Builds the three app images and pushes them to a local k3d registry, for test deploys on a local k3d/k3s cluster only. Production and staging images come from GHCR through the release pipeline ([release.md](release.md)); never use this script for them.

The script is `scripts/local-registry-push.sh`. It reads no `.env*` file: every value comes from the shell that runs it, and it never prints a build-arg value.

## 1. Prerequisites

- Docker is running.
- A k3d registry on port 5001, and a cluster that uses it:

  ```sh
  k3d registry create registry.localhost --port 5001
  k3d cluster create <cluster> --registry-use k3d-registry.localhost:5001
  ```

- The host resolves `k3d-registry.localhost`. If it does not, add the line `127.0.0.1 k3d-registry.localhost` to the hosts file.

The script checks that the registry answers (`http://<registry>/v2/`) before it builds anything, and stops with a message naming the registry when it does not.

## 2. Environment keys

| Key                              | App       | Required          | Meaning                                                                        |
| -------------------------------- | --------- | ----------------- | ------------------------------------------------------------------------------ |
| `LOCAL_REGISTRY`                 | all       | no                | Registry `host:port`; default `k3d-registry.localhost:5001`                    |
| `LOCAL_IMAGE_TAG`                | all       | no                | Image tag; default the short git hash, plus `-dirty` when the tree has changes |
| `VITE_API_BASE_URL`              | cms-admin | yes for cms-admin | API base URL baked into the admin build                                        |
| `NEXT_PUBLIC_ADMIN_URL`          | web       | no                | Admin URL baked into the web build                                             |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | web       | yes for web       | Turnstile site key baked into the web build (value from you, never a file)     |
| `TURBO_VERSION`                  | all       | no                | Turbo version for the image build; the Dockerfile default applies when empty   |

The build args are resolved by `.github/scripts/build-args.sh` with `ENVIRONMENT=local`. A check fails before anything is built, so a missing required key never leaves a half-pushed set. On the local cluster the hosts are `localhost`, for example:

```sh
export VITE_API_BASE_URL=http://localhost/api/v1
```

Set the other keys the same way in your shell; do not create a file for them.

## 3. Usage

```sh
# all three apps, in the order cms-api, cms-admin, web
bash scripts/local-registry-push.sh

# one or more apps
bash scripts/local-registry-push.sh cms-admin
bash scripts/local-registry-push.sh cms-api web

# a fixed tag
LOCAL_IMAGE_TAG=dev1 bash scripts/local-registry-push.sh
```

An unknown app name stops the script with its usage line. On success it prints each pushed image ref, one per line.

## 4. Use the images in k3s

Reference the pushed refs in the manifests:

```
k3d-registry.localhost:5001/<app>:<tag>
```

with `<app>` one of `cms-api`, `cms-admin`, `web`. Use a new tag for every build (the default tag follows the commit; `-dirty` marks uncommitted changes, so set `LOCAL_IMAGE_TAG` when you rebuild the same tree): a reused tag with `imagePullPolicy: IfNotPresent` keeps the stale image on the node.

The runtime env and Secrets of each workload stay as described in [kubernetes.md](kubernetes.md), [configmaps.md](configmaps.md) and [secrets.md](secrets.md). A local cluster needs no `ghcr-pull` Secret for these images.
