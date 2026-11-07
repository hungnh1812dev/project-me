# Configuration: ConfigMaps, env contract, build args

The non-secret configuration of each app. Secret keys: [secrets.md](secrets.md). The authoritative, commented key list of each app is its `.env.example` (`apps/<app>/.env.example`); cms-api validates its env at boot (`apps/cms-api/src/config/Env.schema.ts`) and refuses to start on any error, listing the failing key names and never a value.

Env values are read once at process start: after a ConfigMap change, restart the pods (`kubectl -n <ns> rollout restart deploy/<app>`).

## 1. ConfigMap `cms-api-config`

Read by both cms-api containers (`envFrom`).

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: cms-api-config
  namespace: <ns>
data:
  NODE_ENV: production
  PORT: '3000'
  DB_HOST: <database host> # a session-mode connection (database.md section 2)
  DB_PORT: '5432'
  DB_NAME: <database>
  DB_SSL_MODE: verify-full # disable (default) | require | verify-full
  DB_SSL_ROOT_CERT_PATH: /etc/abyss/database-ca/ca.crt # absolute path; required with verify-full
  TRUST_PROXY_HOPS: '1'
  CLIENT_IP_HEADER: cf-connecting-ip # only when Cloudflare proxies and the origin accepts Cloudflare ranges only
  ADMIN_ORIGIN: https://admin.<domain>
  WEB_ORIGIN: https://<domain>
  MAIL_PROVIDER: smtp
  SMTP_HOST: <relay>
  SMTP_PORT: '<port>'
  SMTP_SECURE: '<true|false>'
  MAIL_FROM: Abyss CMS <no-reply@<domain>>
  MEDIA_PROVIDER: cloudinary
  CLOUDINARY_CLOUD_NAME: <name>
  CLOUDINARY_API_KEY: <key>
  CLOUDINARY_FOLDER: <folder>
  REVIEWER_FEATURE_ENABLED: 'false' # true or false (lower case); false or unset: reviewer features off
  TURNSTILE_EXPECTED_HOSTNAME: <domain>
  JWT_ACCESS_KID: <kid>
  TOTP_ENC_KID: <kid>
  TOTP_ISSUER: <name shown in authenticator apps>
  # Backup download (D20); all six BACKUP_STORAGE_* keys or none (backups.md section 5)
  BACKUP_STORAGE_ENDPOINT: https://<account-id>.r2.cloudflarestorage.com
  BACKUP_STORAGE_REGION: auto
  BACKUP_STORAGE_BUCKET: <bucket>
  BACKUP_STORAGE_PREFIX: postgres/
```

**Never set in production:** `LOGIN_RATE_LIMIT_*`, `REFRESH_RATE_LIMIT_IP`, `SETUP_STATUS_RATE_LIMIT_IP`, `SETUP_SUBMIT_RATE_LIMIT_IP`, `TWO_FACTOR_EMAIL_RATE_LIMIT_IP`, `TWO_FACTOR_MANAGE_RATE_LIMIT_IP`, `ALLOW_LOGIN_RATE_LIMIT_OVERRIDE` (boot fails; smoke and e2e only), `OWNER_EMAIL` / `OWNER_DISPLAY_NAME` (CLI only). `DB_USERNAME` goes in the Secrets, never here ([secrets.md](secrets.md)).

## 2. cms-api env contract

| Variable                                                                                             |  Secret  |      Required in production      | Production value                                                                                                                                                           |
| ---------------------------------------------------------------------------------------------------- | :------: | :------------------------------: | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                                                                           |          |               yes                | `production` (enables the production guards, D17)                                                                                                                          |
| `PORT`                                                                                               |          |                                  | `3000`                                                                                                                                                                     |
| `DB_HOST`, `DB_NAME`                                                                                 |          |               yes                | the database host and name ([database.md](database.md))                                                                                                                    |
| `DB_PORT`                                                                                            |          |                                  | `5432`                                                                                                                                                                     |
| `DB_USERNAME`                                                                                        |   yes    |               yes                | per container: the API role in `cms-api-secrets`, the migration role in `cms-api-migrate-db` (the full login name the server expects)                                      |
| `DB_PASSWORD`                                                                                        |   yes    |               yes                | the password of that role, next to its `DB_USERNAME`                                                                                                                       |
| `DB_SSL_MODE`                                                                                        |          |                                  | `verify-full` for a database reached over a network you do not control; `disable` (default) only for a database inside the cluster or a local stack                        |
| `DB_SSL_ROOT_CERT_PATH`                                                                              |          |        with `verify-full`        | `/etc/abyss/database-ca/ca.crt` (ConfigMap `database-ca`, section 3)                                                                                                       |
| `TRUST_PROXY_HOPS`, `CLIENT_IP_HEADER`                                                               |          |                                  | [traefik.md](traefik.md) section 3                                                                                                                                         |
| `ADMIN_ORIGIN`                                                                                       |          |               yes                | `https://admin.<domain>` (scheme + host, no trailing slash)                                                                                                                |
| `WEB_ORIGIN`                                                                                         |          |               yes                | `https://<domain>`                                                                                                                                                         |
| `MAIL_PROVIDER`                                                                                      |          |               yes                | `smtp` (`console` is rejected in production)                                                                                                                               |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_SECURE`, `MAIL_FROM`                                                 |          |           with `smtp`            | your mail relay; `MAIL_FROM` for example `Abyss CMS <no-reply@<domain>>`                                                                                                   |
| `SMTP_USER`, `SMTP_PASSWORD`                                                                         |   yes    |         both or neither          |                                                                                                                                                                            |
| `MEDIA_PROVIDER`                                                                                     |          |               yes                | `cloudinary` (`fake` is rejected in production)                                                                                                                            |
| `CLOUDINARY_CLOUD_NAME`, `CLOUDINARY_API_KEY`, `CLOUDINARY_FOLDER`                                   |          | name and key (with `cloudinary`) | from the Cloudinary console                                                                                                                                                |
| `CLOUDINARY_API_SECRET`                                                                              |   yes    |               yes                |                                                                                                                                                                            |
| `REVIEWER_FEATURE_ENABLED`                                                                           |          |                                  | `false` in production until the owner turns reviewer features on (`true` or `false` only; unset means `false`) ([devops-runbook.md](devops-runbook.md), "Reviewer switch") |
| `TURNSTILE_SECRET_KEY`                                                                               |   yes    |      for reviewer sessions       | only with `REVIEWER_FEATURE_ENABLED=true`; unset answers 503 on `POST /reviewer/sessions`                                                                                  |
| `TURNSTILE_EXPECTED_HOSTNAME`                                                                        |          |                                  | only with `REVIEWER_FEATURE_ENABLED=true`; `<domain>`                                                                                                                      |
| `JWT_ACCESS_SECRET`, `OTP_PEPPER`, `TOTP_ENC_KEY`                                                    |   yes    |               yes                | each at least 32 bytes: `openssl rand -base64 48`                                                                                                                          |
| `JWT_ACCESS_KID`, `TOTP_ENC_KID`                                                                     |          |               yes                | key ids; change them when rotating the matching secret                                                                                                                     |
| `TOTP_ENC_PREVIOUS_KEY` / `TOTP_ENC_PREVIOUS_KID`                                                    | yes / no |                                  | only during a TOTP key rotation (both or neither)                                                                                                                          |
| `TOTP_ISSUER`                                                                                        |          |                                  | name shown in authenticator apps                                                                                                                                           |
| `OWNER_SETUP_TOKEN`                                                                                  |   yes    |                                  | first install only, at least 32 bytes; remove once the owner exists ([devops-runbook.md](devops-runbook.md), "First owner")                                                |
| `BACKUP_STORAGE_ENDPOINT`, `BACKUP_STORAGE_REGION`, `BACKUP_STORAGE_BUCKET`, `BACKUP_STORAGE_PREFIX` |          |         all six or none          | the backup bucket ([backups.md](backups.md) section 5); none set turns the Backups page off                                                                                |
| `BACKUP_STORAGE_ACCESS_KEY_ID`, `BACKUP_STORAGE_SECRET_ACCESS_KEY`                                   |   yes    |       with the four above        | a read-only bucket token (list and get)                                                                                                                                    |

## 3. ConfigMap `database-ca`

The CA certificate of the database server (public, not a secret), needed with `DB_SSL_MODE=verify-full`. Mounted read-only at `/etc/abyss/database-ca` in both cms-api containers and in the backup job ([kubernetes.md](kubernetes.md) section 3).

```yaml
apiVersion: v1
kind: ConfigMap
metadata: { name: database-ca, namespace: <ns> }
data:
  ca.crt: |
    -----BEGIN CERTIFICATE-----
    <the CA certificate of the database server>
    -----END CERTIFICATE-----
```

## 4. web

Web has a Secret, `web-secrets` ([secrets.md](secrets.md) section 1), and plain `env` entries on the Deployment ([kubernetes.md](kubernetes.md) section 4), read at start. `NEXT_PUBLIC_*` values are build args (GitHub Environment variables, [ci-cd.md](ci-cd.md)); changing one means a new image. The browser calls only web's own BFF routes; web has no `NEXT_PUBLIC_API_BASE_URL` and no `/status` page switch (ADR 0018). An invalid or missing required value fails the start.

| Kind        | Name                                                      | Value in production                                                                                                              |
| ----------- | --------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| build arg   | `NEXT_PUBLIC_ADMIN_URL`                                   | `https://admin.<domain>` (optional; hides the "Open CMS" link when empty)                                                        |
| build arg   | `NEXT_PUBLIC_TURNSTILE_SITE_KEY`                          | public Cloudflare site key (required: the web Dockerfile fails without it)                                                       |
| runtime env | `API_INTERNAL_URL`                                        | `http://cms-api.<ns>.svc.cluster.local:3000/api/v1` (server-only; the web server reaches cms-api inside the cluster)             |
| runtime env | `WEB_ORIGIN`                                              | `https://<domain>` (exact origin; the BFF accepts state-changing requests only from it)                                          |
| runtime env | `TURNSTILE_EXPECTED_HOSTNAME`                             | `<domain>` (bare host; **required** in production: web refuses to start without it)                                              |
| runtime env | `TRUST_PROXY_HOPS`                                        | `1` (Traefik is the one proxy in front of web)                                                                                   |
| runtime env | `CLIENT_IP_HEADER`                                        | optional; a header a trusted CDN sets to the visitor IP                                                                          |
| runtime env | `WEB_REVALIDATE_SECONDS`                                  | `60` (data cache for server-side fetches; `0` disables it)                                                                       |
| runtime env | `WEB_PORT`                                                | `8080` (image default)                                                                                                           |
| never set   | `BFF_AUTH_RATE_LIMIT_IP`, `ALLOW_BFF_RATE_LIMIT_OVERRIDE` | never in deploy config; smoke and dev stacks only (production web refuses the override without the opt-in, ADR 0018 section 2.7) |
| never set   | `ALLOW_TURNSTILE_TEST_SECRET`                             | never in deploy config; it exists only for the smoke stack (ADR 0018 section 2.6)                                                |

Removed: `NEXT_PUBLIC_API_BASE_URL` (build arg) and `WEB_STATUS_PAGE_ENABLED` (runtime env). Delete both from the deploy repo.

## 5. cms-admin

No Secret and no ConfigMap. `VITE_API_BASE_URL` is a **build arg**: the full API base on the admin host, `https://admin.<domain>/api/v1`. The CSP `connect-src` is derived from it at container start; the optional env `CSP_CONNECT_SRC` (space-separated origins) overrides it if the API origin ever differs.

## 6. ConfigMap `postgres-backup-config`

For the backup job ([backups.md](backups.md) section 3): `DB_HOST`, `DB_PORT`, `DB_NAME` (the same values as `cms-api-config`), `PGSSLMODE` and `PGSSLROOTCERT` (with TLS: `verify-full` and `/etc/abyss/database-ca/ca.crt`), `BACKUP_BUCKET`, `BACKUP_PREFIX=postgres/`, `BACKUP_MAX_DATABASE_BYTES`, `BACKUP_MAX_DUMP_BYTES=200000000`, and optionally `RCLONE_S3_UPLOAD_CONCURRENCY` / `RCLONE_S3_CHUNK_SIZE`.

## 7. Keys the app no longer reads

Remove them from any deploy-repo template; cms-api ignores them: `JWT_REFRESH_SECRET`, `COOKIE_SECURE`, `COOKIE_SAMESITE`, `CONTENT_TYPES_DIR`, `MEDIA_MAX_UPLOAD_BYTES`, `AWS_REGION`, `AWS_S3_BUCKET`, `GMAIL_CLIENT_ID`, `GMAIL_CLIENT_SECRET`, `GMAIL_REFRESH_TOKEN`, `GMAIL_SENDER_EMAIL`, `RESEND_API_KEY`, `BREVO_API_KEY`, `REDIS_ENABLED`, `REDIS_URL`. The web app's key reference is `apps/web/.env.example` (the earlier setup called the app `frontend`).
