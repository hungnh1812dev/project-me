# Deploy config: remaining changes for DevOps

For: DevOps. Target: `project-me-config`, reviewed at `develop` `3e591f6` (2026-10-28).

The manifests already match the current images. What is left: one Ingress rule, the web probes, two template fixes, and the rollout order. Sections 1 and 2 must be done before the next rollout; 3 to 5 should be.

## 1. Rollout order (blocker)

The new manifests don't run on the images currently pinned (`staging-0ec389b`, `main-51b183a`), and the new images don't run on the old manifests. CI writes the `APP_IMAGE_TAG` lines after each build, so the manifests and the tags reach the environment branch in two separate commits. Until both are there, the new pods fail. The old pods keep serving (with `replicas: 1` the default rolling update keeps the old pod until a new one is ready), and Flux shows the Kustomizations as not Ready.

Per environment, staging first, then prod:

1. On the cluster, set `APP_PORT` in `api-configmap` to `"3000"` and in `web-configmap` to `"8080"`, then `kubectl apply --server-side -f …`.
2. Check that `APP_IMAGE_REPO` in `web-configmap` names the `web` image, not the old `frontend` one.
3. Merge the manifest changes from `develop` into the environment branch (`staging` or `main`). Keep that branch's `APP_IMAGE_TAG` lines: CI owns them.
4. Ask the app team to run the image build for that environment. CI commits the new tags.
5. Wait until `flux -n <ns> get kustomizations` shows all three Ready, then run the checks in section 6.

While a rollout is waiting, don't delete the old pods or the old ReplicaSet: the old pod is the only one serving.

## 2. Route `/api` on the bare domain to cms-api (blocker)

The web bundle calls the API on its own origin, at `/api/v1`. Today every path on `<domain>` goes to web, so these calls get Next's 404 (reviewer sessions, the account menu, the status card). Building web with `https://api.<domain>/api/v1` is not an option: cms-api's CORS allows only the admin origin.

In `apps/cms-api/ingress.yaml`, add the bare domain. Keep the `api.<domain>` rule for cms-admin, and never StripPrefix: cms-api serves under `/api/v1` itself.

```yaml
spec:
  tls:
    - hosts:
        - api.${APP_DOMAIN}
        - ${APP_DOMAIN:=APP_DOMAIN-is-not-set}
      secretName: ${APP_SERVICE_NAME}-${APP_ENV}-tls
  rules:
    - host: api.${APP_DOMAIN}
      # … unchanged …
    # web's browser calls use /api/v1 on the bare domain. The longer path wins over web's `/` rule.
    - host: ${APP_DOMAIN:=APP_DOMAIN-is-not-set}
      http:
        paths:
          - path: /api
            pathType: Prefix
            backend:
              service:
                name: ${APP_SERVICE_NAME}-${APP_ENV}
                port:
                  name: http
```

## 3. web probes: check the port, not `/`

`/` renders the home page, which fails when cms-api is down or slow. Then readiness takes the whole site offline. Liveness has no `timeoutSeconds`, so it uses the 1 s default, and a slow render restarts the pod. Until the app team adds a light health route, use this in `apps/web/deployment.yaml`:

```yaml
livenessProbe:
  tcpSocket:
    port: http
  initialDelaySeconds: 10
  periodSeconds: 20
readinessProbe:
  tcpSocket:
    port: http
  periodSeconds: 10
```

## 4. `templates/api-secrets.example.yaml`

- Add the reviewer switch. The app default is `false`, so the reviewer feature stays off until it is set:

  ```yaml
  # true or false (lower case). false or unset: the reviewer feature is off.
  REVIEWER_FEATURE_ENABLED: '<true-or-false>'
  ```

- Remove the "old config" block. The current app reads none of these keys:
  - `JWT_REFRESH_SECRET`
  - `COOKIE_SECURE`, `COOKIE_SAMESITE`
  - `CONTENT_TYPES_DIR`, `MEDIA_MAX_UPLOAD_BYTES`
  - `AWS_REGION`, `AWS_S3_BUCKET`
  - `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GMAIL_SENDER_EMAIL`
  - `RESEND_API_KEY`, `BREVO_API_KEY`
  - `REDIS_ENABLED`, `REDIS_URL`

## 5. `templates/web-secrets.example.yaml`

- The key reference points to `apps/frontend/.env.example`. The right file is `apps/web/.env.example`.
- Add the optional status page switch, commented out:

  ```yaml
  # true shows the /status page; unset or false: /status answers 404.
  # WEB_STATUS_PAGE_ENABLED: "<true-or-false>"
  ```

## 6. Checks and rollback

After each environment:

```sh
flux -n <ns> get kustomizations                            # all Ready=True
kubectl -n <ns> get pods                                    # Running, READY 1/1, restarts not climbing
kubectl -n <ns> logs deploy/<api-service>-<env> -c init     # migrations finished
curl -fsS https://<domain>/api/v1/health/ready              # answered by cms-api (section 2)
curl -fsS https://api.<domain>/api/v1/health/ready
curl -fsSI https://<domain>/ && curl -fsSI https://admin.<domain>/
```

Rollback: revert both the CI tag commits and the manifest merge on the environment branch, then reconcile. Reverting only one of them leaves the broken mix from section 1.

## Later (after an app release, not now)

When the app team ships a cms-admin image that reads `ADMIN_PORT`, add `APP_PORT: "8080"` to `admin-configmap` and change `apps/cms-admin/deployment.yaml`:

```yaml
command:
  [
    'sh',
    '-c',
    "ADMIN_PORT=${APP_PORT} exec /docker-entrypoint.sh nginx -g 'daemon off;'",
  ]
ports:
  - name: http
    containerPort: ${APP_PORT}
```

Don't apply this before that image is deployed: nginx would keep listening on 8080 while the probes moved.
