# Kubernetes workloads

The contract for the deploy repo: what each workload must look like. The manifests below are examples to copy from, not files that live here; the deploy repo owns its own layout. Names in `<angle brackets>` are yours to choose. Routing is in [traefik.md](traefik.md), configuration in [configmaps.md](configmaps.md), secrets in [secrets.md](secrets.md), the database in [database.md](database.md), the backup job in [backups.md](backups.md).

Scope in v1: one cluster per environment, Traefik as the ingress controller, **one replica per app** (section 6), PostgreSQL 17 ([database.md](database.md)).

## 1. Cluster prerequisites

- **Local k3d test deploys.** Images come from a local registry, not GHCR: see [local-registry.md](local-registry.md).
- **Namespace.** Recommended `abyss` on every cluster (Q-OPS9). Written `<ns>` below.
- **Image pull secret.** The GHCR packages are private, so `<ns>` needs a `kubernetes.io/dockerconfigjson` Secret `ghcr-pull`, referenced as `imagePullSecrets` by all three Deployments. Its token needs only `read:packages`; GHCR does not accept fine-grained PATs for packages, so a classic PAT with only that scope, from an account that can read the packages, is the usual choice. Check it once (**not run**):

  ```sh
  kubectl -n <ns> run pull-test --image=ghcr.io/hungnh1812dev/project-me/cms-admin:<tag> \
    --overrides='{"spec":{"imagePullSecrets":[{"name":"ghcr-pull"}]}}' --restart=Never
  ```

  Then delete the pod.

- **Ingress controller.** Traefik v3, with `externalTrafficPolicy: Local` on its Service and an HTTP to HTTPS redirect ([traefik.md](traefik.md) sections 1 and 3).
- **CPU architecture.** The images are single-platform `linux/amd64` ([ci-cd.md](ci-cd.md)), so every node must be amd64 (x86_64). Check with `kubectl get node <n> -o jsonpath='{.status.nodeInfo.architecture}'`.

## 2. Workloads

| Workload          | Kind       | Replicas | Containers                                                                         | Probes                                                           | Strategy                                               |
| ----------------- | ---------- | -------- | ---------------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------ |
| `cms-api`         | Deployment | 1        | init `migrate` (`npm run --silent deploy:migrate`), main `cms-api` (image default) | live `/api/v1/health/live`, ready `/api/v1/health/ready` on 3000 | `RollingUpdate`, `maxSurge: 1`, `maxUnavailable: 0`    |
| `web`             | Deployment | 1        | `web`                                                                              | TCP on 8080 (section 4)                                          | same                                                   |
| `cms-admin`       | Deployment | 1        | `cms-admin`                                                                        | `/` on 8080                                                      | same                                                   |
| `postgres-backup` | CronJob    | -        | `dump`                                                                             | -                                                                | `concurrencyPolicy: Forbid` ([backups.md](backups.md)) |

| Image                                        | Runs as                      | Port | Role                                                 |
| -------------------------------------------- | ---------------------------- | ---- | ---------------------------------------------------- |
| `ghcr.io/hungnh1812dev/project-me/cms-api`   | uid 1000                     | 3000 | REST + GraphQL API, and the migration init container |
| `ghcr.io/hungnh1812dev/project-me/web`       | uid 1000                     | 8080 | public site, Next.js standalone on Node (not nginx)  |
| `ghcr.io/hungnh1812dev/project-me/cms-admin` | uid 101 (nginx-unprivileged) | 8080 | admin console, static files                          |

- Every image has a numeric non-root user, so `runAsNonRoot: true` works. Pod security for all: `runAsNonRoot: true`, `allowPrivilegeEscalation: false`, drop all capabilities.
- Pin each image with the tag the publish job writes to `APP_IMAGE_TAG` ([ci-cd.md](ci-cd.md)); cms-api uses **one tag for both of its containers**. Never reference the moving `<branch>` tag.
- If the deploy repo templates the container port (an `APP_PORT` key in each app's ConfigMap), the values are cms-api `"3000"`, web `"8080"` and cms-admin `"8080"`; the images listen on these ports (cms-admin's is fixed until an image reads `ADMIN_PORT`, section 5).

## 3. cms-api: init container + main container

One Deployment, one pod template, **the same image for both containers**:

| Container | Kind | Command                       | Does                                                                                                                                                                                                                    |
| --------- | ---- | ----------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `migrate` | init | `npm run deploy:migrate`      | `db:migrate` (Prisma `migrate deploy`, then the idempotent role/permission seed), then `content:migrate` (apply pending `content/migrations` and sync `content._content_types` from `content/migrations/snapshot.json`) |
| `cms-api` | main | `node dist/main.js` (default) | serves the API                                                                                                                                                                                                          |

A new or changed `content/schemas/*.json` takes effect only after `pnpm content:generate` and a commit of the generated migration (D10); the init container never reads the schemas.

Behaviour to rely on:

- The main container starts only after the init container **exits 0**. A failed migration leaves the pod in `Init:Error` / `Init:CrashLoopBackOff` and, with `maxUnavailable: 0`, the old ReplicaSet keeps serving. Look at it with `kubectl logs <pod> -c migrate`.
- It applies only **committed** migrations. It never runs `content:generate` (CI fails a missing migration with `content:generate --check`) and never creates the owner ([devops-runbook.md](devops-runbook.md), "First owner").
- Concurrent runs are safe: Prisma takes its own migrate lock and the content runner takes `pg_advisory_xact_lock`. v1 still runs a single replica.
- The command is safe to re-run: with nothing pending it prints "No pending migrations to apply." / "No pending content migrations." and exits 0.
- During a rollout the old pod keeps running against the **new** schema while the init container runs. Destructive content migrations (drop or rename a column or content type) therefore need expand/contract: release 1 adds the new shape and the code that tolerates both, release 2 removes the old one.
- The init container loads only the database part of the configuration (`DB_*`, `NODE_ENV`), so it gets `cms-api-config` plus its own Secret `cms-api-migrate-db` (the migration role), and **not** `cms-api-secrets`. The main container gets `cms-api-config` plus `cms-api-secrets` (the API role and every app secret). Neither container holds the other's database credential, and `DB_USERNAME` is in neither the ConfigMap nor a shared Secret ([secrets.md](secrets.md) section 6).
- Use `RollingUpdate` with `maxSurge: 1`, `maxUnavailable: 0`, so the new pod migrates before the old one stops. Do not use `Recreate`.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cms-api
  namespace: <ns>
spec:
  replicas: 1
  strategy:
    type: RollingUpdate
    rollingUpdate: { maxSurge: 1, maxUnavailable: 0 }
  selector:
    matchLabels: { app: cms-api }
  template:
    metadata:
      labels: { app: cms-api }
    spec:
      imagePullSecrets: [{ name: ghcr-pull }]
      securityContext:
        runAsNonRoot: true
        runAsUser: 1000
        runAsGroup: 1000
      initContainers:
        - name: migrate
          image: ghcr.io/hungnh1812dev/project-me/cms-api:<APP_IMAGE_TAG>
          command: ['npm', 'run', '--silent', 'deploy:migrate']
          envFrom:
            - configMapRef: { name: cms-api-config }
            - secretRef: { name: cms-api-migrate-db } # migration role only; no app secrets
          volumeMounts: # only with DB_SSL_MODE=verify-full
            - { name: database-ca, mountPath: /etc/abyss/database-ca, readOnly: true }
          resources:
            requests: { cpu: 100m, memory: 256Mi }
            limits: { memory: 512Mi }
          securityContext:
            allowPrivilegeEscalation: false
            capabilities: { drop: [ALL] }
      containers:
        - name: cms-api
          image: ghcr.io/hungnh1812dev/project-me/cms-api:<APP_IMAGE_TAG>
          ports:
            - containerPort: 3000
          envFrom:
            - configMapRef: { name: cms-api-config }
            - secretRef: { name: cms-api-secrets } # API role + app secrets
          volumeMounts: # only with DB_SSL_MODE=verify-full
            - { name: database-ca, mountPath: /etc/abyss/database-ca, readOnly: true }
          livenessProbe:
            httpGet: { path: /api/v1/health/live, port: 3000 }
            periodSeconds: 10
          readinessProbe:
            httpGet: { path: /api/v1/health/ready, port: 3000 }
            periodSeconds: 5
          resources:
            requests: { cpu: 100m, memory: 256Mi }
            limits: { memory: 768Mi }
          securityContext:
            allowPrivilegeEscalation: false
            capabilities: { drop: [ALL] }
      volumes: # only with DB_SSL_MODE=verify-full: the public CA certificate
        - name: database-ca
          configMap: { name: database-ca }
---
apiVersion: v1
kind: Service
metadata:
  name: cms-api
  namespace: <ns>
spec:
  selector: { app: cms-api }
  ports:
    - port: 3000
```

- Probes: `GET /api/v1/health/live` and `/ready` answer `{"status":"ok"}` only; `ready` checks the database.
- Memory: image uploads are re-encoded with sharp, which at the 50-megapixel guard uses about 200 MB on top of the Node baseline (about 120 MB idle), so keep the limit at 768Mi or more. The numbers are starting points; adjust after watching `kubectl top pod`.
- The image bundles the sharp binary for its own platform. After building for another architecture, check `node -e "require('sharp')"` inside the image.

## 4. web

Next.js standalone server run by Node as uid 1000. It is not behind nginx; its security headers (CSP with a per-request nonce) come from Next.js itself. Its build args and runtime env: [configmaps.md](configmaps.md) section 4.

```yaml
containers:
  - name: web
    image: ghcr.io/hungnh1812dev/project-me/web:<APP_IMAGE_TAG>
    ports:
      - { name: http, containerPort: 8080 }
    env:
      - { name: APP_API_URL, value: 'http://cms-api.<ns>.svc.cluster.local:3000/api/v1' }
      - { name: WEB_ORIGIN, value: 'https://<domain>' }
      - { name: TURNSTILE_EXPECTED_HOSTNAME, value: '<domain>' }
      - { name: TRUST_PROXY_HOPS, value: '1' }
    envFrom:
      - secretRef: { name: web-secrets } # WEB_SESSION_SECRET, TURNSTILE_SECRET_KEY, APP_API_TOKEN
    livenessProbe:
      tcpSocket: { port: http }
      initialDelaySeconds: 10
      periodSeconds: 20
    readinessProbe:
      tcpSocket: { port: http }
      periodSeconds: 10
    resources:
      requests: { cpu: 50m, memory: 128Mi }
      limits: { memory: 384Mi }
    securityContext:
      allowPrivilegeEscalation: false
      capabilities: { drop: [ALL] }
```

- **Never set `ALLOW_TURNSTILE_TEST_SECRET`, `BFF_AUTH_RATE_LIMIT_IP`, `ALLOW_BFF_RATE_LIMIT_OVERRIDE` or `WEB_REVALIDATE_SECONDS`** in the web env (smoke and dev stacks only, ADR 0018 sections 2.6 and 2.7). `APP_ENV` (`production` for every CI image, equal to the build variable) is set in `web-secrets`. Web has no browser-side API calls, so it needs no Traefik route to cms-api.
- **NetworkPolicy on cms-api:** cms-api accepts ingress on 3000 only from the Traefik pods (the admin-host `/api` route) and the web pods (BFF and content calls through `APP_API_URL`); every other pod is refused. Example, adjust the namespace and pod labels to the deploy repo:

```yaml
apiVersion: networking.k8s.io/v1
kind: NetworkPolicy
metadata:
  name: cms-api-ingress
  namespace: <ns>
spec:
  podSelector: { matchLabels: { app: cms-api } }
  policyTypes: [Ingress]
  ingress:
    - from:
        - namespaceSelector: { matchLabels: { kubernetes.io/metadata.name: <traefik-ns> } }
          podSelector: { matchLabels: { app.kubernetes.io/name: traefik } }
        - podSelector: { matchLabels: { app: web } }
      ports: [{ protocol: TCP, port: 3000 }]
```

The cluster's CNI must enforce NetworkPolicy. The backup CronJob and the `kubectl exec` commands do not use the cms-api Service port, so they are not affected.

- **Probe the port, not `/`.** `/` renders the home page on the server, which fetches content from cms-api: when the API is down or slow, an HTTP probe on `/` takes the whole site offline, and a liveness probe with the default 1 s timeout restarts the pod on a slow render. Use the TCP probes above until the web app has a light health route.
- Resources: the Node process idles around 60 MiB and grows with the data cache and concurrent renders; 128Mi request and 384Mi limit are a starting point. The response carries no `X-Powered-By` header.

## 5. cms-admin

Static files on `nginx-unprivileged` (uid 101, port 8080). `VITE_API_BASE_URL` is a **build arg** ([configmaps.md](configmaps.md) section 5). No other runtime configuration. Probe `GET /` on 8080.

```yaml
containers:
  - name: cms-admin
    image: ghcr.io/hungnh1812dev/project-me/cms-admin:<APP_IMAGE_TAG>
    ports:
      - { name: http, containerPort: 8080 }
    readinessProbe:
      httpGet: { path: /, port: 8080 }
    resources:
      requests: { cpu: 20m, memory: 32Mi }
      limits: { memory: 128Mi }
    securityContext:
      allowPrivilegeEscalation: false
      capabilities: { drop: [ALL] }
```

- With `readOnlyRootFilesystem: true`, mount `emptyDir` volumes on `/tmp`, `/var/cache/nginx` and `/etc/nginx/security` (the entrypoint renders the CSP file there). **Not run**: test it before relying on it.
- The port is fixed at 8080. Once a cms-admin image reads `ADMIN_PORT`, the port can come from config (`command: ['sh', '-c', "ADMIN_PORT=${APP_PORT} exec /docker-entrypoint.sh nginx -g 'daemon off;'"]`); never change the probes before that image is deployed, or nginx keeps listening on 8080 while the probes move.

## 6. Single replica in v1

Run exactly one replica of cms-api, web and cms-admin. cms-api keeps the rate-limit store and the permission-version cache (`VersionCache`) in memory ([access module doc](../modules/access-control.md), "Swap point"); a second replica would split the rate-limit counters, and permission changes made on one replica reach the other only after the 5 s cache TTL. Before scaling out, replace `VersionCache` and the rate-limit store as described there, and revisit `TRUST_PROXY_HOPS` ([traefik.md](traefik.md) section 3).

The rolling update (section 3) briefly runs two cms-api pods; that is safe because migrations are lock-protected and the in-memory state is rebuilt per process. A self-managed PostgreSQL is a single instance too: a node loss means downtime until the pod is rescheduled or the dump is restored ([backups.md](backups.md)).
