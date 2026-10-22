# Deployment guide: K3s + Traefik

For the separate deploy repo (SPEC §1, §6, D7). This repo builds and publishes the images (`docs/ci-cd.md`); the deploy repo owns the manifests, secrets and backups. Everything below is a contract plus example manifests to copy from, not files that live here. Names in `<angle brackets>` are yours to choose.

Scope in v1: one VPS, K3s with the bundled Traefik, **one replica per app**, PostgreSQL 16 in the cluster on a PVC.

## 1. Images and the three public hosts

| Image (from `docs/ci-cd.md`)                 | Runs as                      | Port | Role                                                 |
| -------------------------------------------- | ---------------------------- | ---- | ---------------------------------------------------- |
| `ghcr.io/hungnh1812dev/project-me/cms-api`   | uid 1000                     | 3000 | REST + GraphQL API, and the migration init container |
| `ghcr.io/hungnh1812dev/project-me/web`       | uid 1000                     | 8080 | public site, Next.js standalone on Node (not nginx)  |
| `ghcr.io/hungnh1812dev/project-me/cms-admin` | uid 101 (nginx-unprivileged) | 8080 | admin console, static files                          |

Every image has a numeric non-root user, so `runAsNonRoot: true` works. Pin the images with the tag the publish job writes to `APP_IMAGE_TAG` in the overlay; cms-api uses **one tag for both of its containers**.

| Host               | Path            | Goes to                  |
| ------------------ | --------------- | ------------------------ |
| `domain.com`       | `/api/*`        | cms-api Service (3000)   |
| `domain.com`       | everything else | web Service (8080)       |
| `admin.domain.com` | all             | cms-admin Service (8080) |

Rules that matter:

- **Never StripPrefix.** cms-api serves under `/api/v1`; the router passes the path through untouched.
- **`/api` must win over the web catch-all.** Set explicit `priority` values (below) instead of relying on rule length.
- Web and API share the origin `https://domain.com` (refresh cookie `__Secure-abyss_rt` is host-only, `Path=/api/v1/auth`). The admin is a different origin and is the only CORS origin.
- TLS terminates at Traefik (`websecure`); nothing in the apps speaks TLS.

```yaml
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: abyss-public
  namespace: <namespace>
spec:
  entryPoints: [websecure]
  routes:
    - kind: Rule
      match: Host(`domain.com`) && PathPrefix(`/api`)
      priority: 20
      services:
        - name: cms-api
          port: 3000
    - kind: Rule
      match: Host(`domain.com`)
      priority: 10
      services:
        - name: web
          port: 8080
  tls:
    secretName: <domain-com-tls> # or certResolver: <resolver>
---
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: abyss-admin
  namespace: <namespace>
spec:
  entryPoints: [websecure]
  routes:
    - kind: Rule
      match: Host(`admin.domain.com`)
      services:
        - name: cms-admin
          port: 8080
  tls:
    secretName: <admin-domain-com-tls>
```

Add a `web` entrypoint redirect to HTTPS in your Traefik config. The smoke stack (`docker-compose.smoke.yml`) uses the same routers with labels; the assertions in `pnpm smoke` check `/api` reaching cms-api, the web catch-all and the admin host.

## 2. Client IP: `externalTrafficPolicy: Local` and `TRUST_PROXY_HOPS`

Rate limits (login, refresh, reviewer sessions) are keyed by client IP. cms-api reads it from `X-Forwarded-For`, so the IP Traefik sees must be the real one (SPEC D7).

1. Set `externalTrafficPolicy: Local` on the Traefik Service. With the default `Cluster`, kube-proxy source-NATs the connection and every client appears as a node IP, so all visitors share one rate-limit bucket. On K3s the bundled Traefik is configured through a `HelmChartConfig` in `kube-system`:

   ```yaml
   apiVersion: helm.cattle.io/v1
   kind: HelmChartConfig
   metadata:
     name: traefik
     namespace: kube-system
   spec:
     valuesContent: |-
       service:
         spec:
           externalTrafficPolicy: Local
   ```

   The Traefik pod must run on the node that receives the traffic (one VPS: it does). Check with `kubectl -n kube-system get svc traefik -o jsonpath='{.spec.externalTrafficPolicy}'`.

2. Set `TRUST_PROXY_HOPS` on cms-api to the number of proxies between the client and the API that append to `X-Forwarded-For`:

   | Topology                                   | `TRUST_PROXY_HOPS` | `CLIENT_IP_HEADER` |
   | ------------------------------------------ | ------------------ | ------------------ |
   | client -> Traefik -> cms-api               | `1` (default)      | unset              |
   | client -> Cloudflare -> Traefik -> cms-api | `1`                | `cf-connecting-ip` |

   Never `true`: it trusts every hop and lets a client forge its IP. Behind Cloudflare, Traefik's peer is a Cloudflare address, so use `CLIENT_IP_HEADER=cf-connecting-ip`, and only when the origin accepts traffic from Cloudflare ranges alone (firewall or Traefik `forwardedHeaders.trustedIPs`), otherwise a client can send that header itself. Do not add other proxies (an extra ingress, a service mesh) without raising the value.

## 3. cms-api: init container + main container

One Deployment, one pod template, **the same image for both containers**:

| Container | Kind | Command                       | Does                                                                                                                                                                     |
| --------- | ---- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `migrate` | init | `npm run deploy:migrate`      | `db:migrate` (Prisma `migrate deploy`, then the idempotent role/permission seed), then `content:migrate` (parse and merge `content/schemas`, apply `content/migrations`) |
| `cms-api` | main | `node dist/main.js` (default) | serves the API                                                                                                                                                           |

Behaviour to rely on:

- The main container starts only after the init container **exits 0**. A failed migration leaves the pod in `Init:Error` / `Init:CrashLoopBackOff` and, with `maxUnavailable: 0`, the old ReplicaSet keeps serving. Look at it with `kubectl logs <pod> -c migrate`.
- It applies only **committed** migrations. It never runs `content:generate` (CI fails a missing migration with `content:generate --check`) and never runs `owner:bootstrap`.
- Concurrent runs are safe: Prisma takes its own migrate lock and the content runner takes `pg_advisory_xact_lock`. v1 still runs a single replica.
- The command is safe to re-run: with nothing pending it prints "No pending migrations to apply." / "No pending content migrations." and exits 0.
- During a rollout the old pod keeps running against the **new** schema while the init container runs. Destructive content migrations (drop or rename a column or content type) therefore need expand/contract: release 1 adds the new shape and the code that tolerates both, release 2 removes the old one.
- The init container loads the same configuration as the API, so it needs the same `envFrom` Secret/ConfigMap as the main container (all required secrets, not only the DB ones). Narrowing it to the DB values is an open follow-up.
- Use `RollingUpdate` with `maxSurge: 1`, `maxUnavailable: 0`, so the new pod migrates before the old one stops. Do not use `Recreate`.

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: cms-api
  namespace: <namespace>
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
            - secretRef: { name: cms-api-secrets }
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
            - secretRef: { name: cms-api-secrets }
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
---
apiVersion: v1
kind: Service
metadata:
  name: cms-api
  namespace: <namespace>
spec:
  selector: { app: cms-api }
  ports:
    - port: 3000
```

Probes: `GET /api/v1/health/live` and `/ready` answer `{"status":"ok"}` only. `ready` checks the database. Memory: image uploads are re-encoded with sharp, which at the 50-megapixel guard uses about 200 MB on top of the Node baseline (about 120 MB idle), so keep the limit at 768Mi or more. The numbers above are starting points; adjust after watching `kubectl top pod`. The image bundles the sharp binary for its own platform (checked: `node -e "require('sharp')"` loads sharp 0.35.5 on linux/arm64 Alpine); after building for another architecture run the same check.

### First install: the owner

`owner:bootstrap` is a one-time manual step, never part of init. After the first rollout is ready:

```
kubectl -n <namespace> exec -it deploy/cms-api -c cms-api -- \
  env OWNER_EMAIL=owner@domain.com npm run owner:bootstrap
```

The password is typed at a hidden prompt (use `--password-stdin` to pipe it). A second run refuses: there is one owner. Enable two-factor for it right after the first sign-in. Break-glass: `npm run owner:reset-2fa -- --email <email>` the same way.

## 4. web

Next.js standalone server run by Node as uid 1000. It is not behind nginx; its security headers (CSP with a per-request nonce) come from Next.js itself.

| Kind        | Name                             | Value in this deployment                                                           |
| ----------- | -------------------------------- | ---------------------------------------------------------------------------------- |
| build arg   | `NEXT_PUBLIC_API_BASE_URL`       | `/api/v1` (same origin). Baked into the browser bundle at **image build**.         |
| build arg   | `NEXT_PUBLIC_ADMIN_URL`          | `https://admin.domain.com` (optional; hides the "Open CMS" link when empty)        |
| build arg   | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` | public Cloudflare site key (optional; hides "Reviewer access" when empty)          |
| runtime env | `API_INTERNAL_URL`               | in-cluster Service URL: `http://cms-api.<namespace>.svc.cluster.local:3000/api/v1` |
| runtime env | `WEB_REVALIDATE_SECONDS`         | `60` (data cache for server-side fetches; `0` disables it)                         |
| runtime env | `WEB_PORT`                       | `8080` (image default)                                                             |

The build args are GitHub Environment variables (`docs/ci-cd.md`, "What you must create in GitHub"); changing one means a new image, not a new rollout of the old one. The runtime variables are read by the Node server at start, so changing them needs a pod restart. `API_INTERNAL_URL` is server-only: it never reaches the browser, and the server calls cms-api anonymously.

```yaml
containers:
  - name: web
    image: ghcr.io/hungnh1812dev/project-me/web:<APP_IMAGE_TAG>
    ports:
      - containerPort: 8080
    env:
      - {
          name: API_INTERNAL_URL,
          value: 'http://cms-api.<namespace>.svc.cluster.local:3000/api/v1',
        }
      - { name: WEB_REVALIDATE_SECONDS, value: '60' }
    readinessProbe:
      httpGet: { path: /, port: 8080 }
      periodSeconds: 5
    livenessProbe:
      httpGet: { path: /, port: 8080 }
      initialDelaySeconds: 10
      periodSeconds: 10
    resources:
      requests: { cpu: 50m, memory: 128Mi }
      limits: { memory: 384Mi }
    securityContext:
      allowPrivilegeEscalation: false
      capabilities: { drop: [ALL] }
```

The probe on `/` renders the home page on the server, which fetches content from cms-api, so a pod whose API is down may report not ready; `kubectl rollout status` then waits on the API too. Resources: the Node process idles around 60 MiB and grows with the data cache and concurrent renders; 128Mi request and 384Mi limit are a starting point. The web response carries no `X-Powered-By` header.

## 5. cms-admin

Static files on `nginx-unprivileged` (uid 101, port 8080). `VITE_API_BASE_URL` is a **build arg**: the full API base, for example `https://domain.com/api/v1`. The CSP `connect-src` is derived from it at container start; `CSP_CONNECT_SRC` (space-separated origins) overrides it at run time if the API origin ever differs. No other runtime configuration. Probe `GET /` on 8080.

```yaml
containers:
  - name: cms-admin
    image: ghcr.io/hungnh1812dev/project-me/cms-admin:<APP_IMAGE_TAG>
    ports:
      - containerPort: 8080
    readinessProbe:
      httpGet: { path: /, port: 8080 }
    resources:
      requests: { cpu: 20m, memory: 32Mi }
      limits: { memory: 128Mi }
    securityContext:
      allowPrivilegeEscalation: false
      capabilities: { drop: [ALL] }
```

If you set `readOnlyRootFilesystem: true`, mount `emptyDir` volumes on `/tmp`, `/var/cache/nginx` and `/etc/nginx/security` (the entrypoint renders the CSP file there). This was not tried; test it before relying on it.

## 6. Environment contract (cms-api)

Validated at boot by `apps/cms-api/src/config/env.schema.ts`; the process refuses to start on any error. The authoritative, commented list is `apps/cms-api/.env.example`. Put the Secret column in a Secret, the rest in a ConfigMap.

| Variable                                                                         |  Secret  |      Required in production      | Production value                                                    |
| -------------------------------------------------------------------------------- | :------: | :------------------------------: | ------------------------------------------------------------------- |
| `NODE_ENV`                                                                       |          |               yes                | `production` (enables the guards below)                             |
| `PORT`                                                                           |          |                                  | `3000`                                                              |
| `DB_HOST`, `DB_NAME`, `DB_USERNAME`                                              |          |               yes                | the Postgres Service, database, role                                |
| `DB_PORT`                                                                        |          |                                  | `5432`                                                              |
| `DB_PASSWORD`                                                                    |   yes    |               yes                |                                                                     |
| `TRUST_PROXY_HOPS`, `CLIENT_IP_HEADER`                                           |          |                                  | see section 2                                                       |
| `ADMIN_ORIGIN`                                                                   |          |               yes                | `https://admin.domain.com` (scheme + host, no trailing slash)       |
| `WEB_ORIGIN`                                                                     |          |               yes                | `https://domain.com`                                                |
| `MAIL_PROVIDER`                                                                  |          |               yes                | `smtp` (`console` is rejected in production)                        |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `MAIL_FROM`                             |          |           with `smtp`            | your mail relay; `MAIL_FROM` e.g. `Abyss CMS <no-reply@domain.com>` |
| `SMTP_USER`, `SMTP_PASSWORD`                                                     |   yes    |         both or neither          |                                                                     |
| `MEDIA_PROVIDER`                                                                 |          |               yes                | `cloudinary` (`fake` is rejected in production)                     |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_FOLDER`               |          | name and key (with `cloudinary`) | from the Cloudinary console                                         |
| `CLOUDINARY_API_SECRET`                                                          |   yes    |               yes                |                                                                     |
| `TURNSTILE_SECRET_KEY`                                                           |   yes    |      for reviewer sessions       | real key; unset answers 503 on `POST /reviewer/sessions`            |
| `TURNSTILE_EXPECTED_HOSTNAME`                                                    |          |                                  | `domain.com`                                                        |
| `JWT_ACCESS_SECRET`, `OTP_PEPPER`, `TOTP_ENC_KEY`                                |   yes    |               yes                | each at least 32 bytes: `openssl rand -base64 48`                   |
| `JWT_ACCESS_KID`, `TOTP_ENC_KID`                                                 |          |               yes                | key ids; change them when rotating the matching secret              |
| `TOTP_ENC_PREVIOUS_KEY` / `TOTP_ENC_PREVIOUS_KID`                                | yes / no |                                  | only during a TOTP key rotation (both or neither)                   |
| `TOTP_ISSUER`                                                                    |          |                                  | name shown in authenticator apps                                    |
| `LOGIN_RATE_LIMIT_*`, `REFRESH_RATE_LIMIT_IP`, `ALLOW_LOGIN_RATE_LIMIT_OVERRIDE` |          |                                  | **never set in production** (startup fails; smoke/e2e only)         |

Web and admin have no secrets (section 4 and 5). Database: use a role that owns the application database; `db:migrate` and `content:migrate` run DDL with the same `DB_USERNAME` as the API (a separate migration role is an open follow-up). Never reuse the Cloudflare always-pass test keys outside test stacks.

### Secrets: SOPS or sealed-secrets

Secrets never go into the deploy repo in plain text. Pick one:

- **SOPS + age**: keep `cms-api-secrets.sops.yaml` in the deploy repo, encrypted to an age key; the cluster decrypts with Flux/Argo's SOPS support (or `sops -d | kubectl apply -f -` in a manual flow). Keep the private age key off the repo and back it up separately.
- **sealed-secrets**: run the controller in the cluster, create the Secret locally, `kubeseal` it, commit the `SealedSecret`. Back up the controller's sealing key; without it the committed files cannot be decrypted after a cluster rebuild.

Either way: one Secret per app, rotate with the KID variables (`JWT_ACCESS_KID`, `TOTP_ENC_KID`) changed together with the key, and restart the pod after any Secret change (env is read at start).

## 7. PostgreSQL: storage, nightly dump, restore drill

PostgreSQL 16 (`postgres:16-alpine`) as a single-replica StatefulSet with a PVC (K3s `local-path` storage class is enough on one VPS; it is node-local, so the dump below is the only copy that survives losing the disk). One database holds everything: the Prisma-managed `public` tables and the content engine's `content` schema, so **a plain `pg_dump` of the database covers both** and a restore needs nothing else.

What the backup must cover: the whole database (accounts, audit logs, `file_library` rows, all content and its migration history). It does **not** contain the uploaded files themselves: they live in Cloudinary (`MEDIA_PROVIDER=cloudinary`); back that up with Cloudinary's own tooling.

Nightly CronJob, custom format, shipped off the VPS (the example uses rclone to an S3-compatible bucket; any off-site target works):

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: postgres-backup
  namespace: <namespace>
spec:
  schedule: '15 2 * * *'
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 3
  failedJobsHistoryLimit: 3
  jobTemplate:
    spec:
      backoffLimit: 1
      template:
        spec:
          restartPolicy: Never
          containers:
            - name: dump
              image: <image with pg_dump 16 and rclone>
              command: ['sh', '-c']
              args:
                - |
                  set -eu
                  f="abyss-$(date -u +%Y%m%dT%H%M%SZ).dump"
                  PGPASSWORD="$DB_PASSWORD" pg_dump -h "$DB_HOST" -U "$DB_USERNAME" -d "$DB_NAME" -Fc -f "/tmp/$f"
                  rclone copyto "/tmp/$f" "offsite:<bucket>/postgres/$f"
              envFrom:
                - secretRef: { name: cms-api-secrets } # DB_PASSWORD (and the rclone remote config)
                - configMapRef: { name: cms-api-config } # DB_HOST, DB_NAME, DB_USERNAME
```

Keep at least 14 daily dumps and a few monthly ones (a bucket lifecycle rule), encrypt them at rest, and alert when the job fails or no new object appeared in 26 hours.

### Restore drill

A backup that was never restored is not a backup. Run this at setup and then every quarter, into a **scratch** database, never over production:

```
# 1. fetch the latest dump, then create a scratch database
createdb -h <db-host> -U <user> abyss_restore
# 2. restore (stop at the first error)
pg_restore -h <db-host> -U <user> -d abyss_restore --no-owner --exit-on-error abyss-<stamp>.dump
# 3. the schema is complete: the migration commands find nothing pending
#    (run the cms-api image with DB_NAME=abyss_restore)
npm run --silent deploy:migrate        # expect exit 0, "No pending ..." twice
# 4. spot-check data
psql -h <db-host> -U <user> -d abyss_restore -c 'select count(*) from accounts' \
     -c 'select count(*) from content._migrations'
# 5. drop it
dropdb -h <db-host> -U <user> abyss_restore
```

Record the date, the dump used and the time it took. For a real disaster: restore into the new database, point `DB_NAME` at it, roll out (the init container confirms the schema is current), then check `GET /api/v1/health/ready`.

## 8. Single replica in v1

Run exactly one replica of cms-api, web and cms-admin. cms-api keeps the rate-limit store and the permission-version cache (`VersionCache`) in memory (`docs/modules/access-control.md`, "Swap point"); a second replica would split the rate-limit counters, and permission changes made on one replica reach the other only after the 5 s cache TTL. Before scaling out, replace `VersionCache` and the rate-limit store as described there, and revisit `TRUST_PROXY_HOPS`. PostgreSQL is a single instance too: a node loss means downtime until the pod is rescheduled or the dump is restored. The rolling update (section 3) briefly runs two cms-api pods; that is safe because migrations are lock-protected and the in-memory state is rebuilt per process.

## 9. Release checklist

1. The publish job pushed the three images and bumped `APP_IMAGE_TAG` in the overlays (`docs/ci-cd.md`, "Publish").
2. The cms-api pod shows `Init:0/1` then `Running`; `kubectl logs <pod> -c migrate` ends with "No pending ..." or the applied list.
3. `curl -fsS https://domain.com/api/v1/health/ready` returns `{"status":"ok"}`.
4. `https://domain.com/` and `https://admin.domain.com/` load, and the browser console shows no CSP violations.
5. Sign in as the owner; the Traefik access log shows real client IPs, not node IPs (section 2).
6. The last nightly dump exists off-site, and the last restore drill is younger than three months.
