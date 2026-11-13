# Secrets

How the secret values reach the cluster without ever being committed in plain text. The full env contract is in [configmaps.md](configmaps.md) section 2; this page adds the secret side. The files below live in the **deploy repo**, not here.

Status: **not run** against a cluster. The `sops` and `age` commands follow their documented behaviour; test the flow once on a scratch namespace before relying on it.

## 1. Which keys are secret

| App       | Secret keys                                                                                                                                                                                                                                                                                                                           | Not secret                                                                                     |
| --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| cms-api   | `DB_USERNAME`, `DB_PASSWORD`, `JWT_ACCESS_SECRET`, `OTP_PEPPER`, `TOTP_ENC_KEY`, `CLOUDINARY_API_SECRET`, `TURNSTILE_SECRET_KEY`, `SMTP_USER`, `SMTP_PASSWORD`, `BACKUP_STORAGE_ACCESS_KEY_ID`, `BACKUP_STORAGE_SECRET_ACCESS_KEY`, `TOTP_ENC_PREVIOUS_KEY` (only during a rotation), `OWNER_SETUP_TOKEN` (only during first install) | everything else in `apps/cms-api/.env.example`: the ConfigMap ([configmaps.md](configmaps.md)) |
| web       | `WEB_SESSION_SECRET`, `TURNSTILE_SECRET_KEY`, `APP_API_TOKEN`                                                                                                                                                                                                                                                                         | all of `apps/web/.env.example` (`NEXT_PUBLIC_*` are public by design)                          |
| cms-admin | none                                                                                                                                                                                                                                                                                                                                  | `VITE_API_BASE_URL` (build arg), `CSP_CONNECT_SRC`                                             |

The database credentials are split by consumer (D19). A pod gets only the login it needs:

| Secret               | Keys                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | Mounted into                                      |
| -------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `cms-api-secrets`    | `DB_USERNAME` = the API role, `DB_PASSWORD`, and every cms-api app secret above                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | main container `cms-api` only                     |
| `web-secrets`        | `WEB_SESSION_SECRET` (at least 32 bytes, e.g. `openssl rand -base64 48`; it seals the session cookies), `TURNSTILE_SECRET_KEY` (the real Cloudflare key), `APP_ENV` (`staging` or `production`, equal to the GitHub variable `APP_ENV` of the image build; required), `APP_API_TOKEN` (a cms-api API token; create the token as a dedicated `guest`-role account, never owner or admin, so the `public` masks apply ([patch-web-0.2.0.md](../apps/web/patch-web-0.2.0.md) "Create the API token"), with the scope `{ "permissions": [{ "subject": "*", "action": "read" }] }` (no other entry, no write action); it reads published content only, with that account's masks, and never accounts, roles, API tokens, audit logs or media (D5); a new content type read by web needs no new token; required) | container `web` only                              |
| `cms-api-migrate-db` | `DB_USERNAME` = the migration role, `DB_PASSWORD`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          | init container `migrate` only                     |
| `postgres-backup`    | `DB_USERNAME` = the backup role, `DB_PASSWORD`, the rclone remote `offsite`, `BACKUP_AGE_RECIPIENT`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | backup CronJob only ([backups.md](backups.md))    |
| `postgres-superuser` | `POSTGRES_USER`, `POSTGRES_PASSWORD`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | a self-managed Postgres StatefulSet only          |
| `ghcr-pull`          | registry login (`read:packages`)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | all Deployments, as `imagePullSecrets`            |
| `sops-age`           | the cluster's age private key; created by hand, never in git (section 3)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   | the GitOps tool that decrypts (its own namespace) |

Notes:

- `DB_USERNAME` is the full login name the database server expects (some managed services add a suffix to the role name). It lives only in these Secrets, never in `cms-api-config`.
- `SMTP_USER` and `SMTP_PASSWORD` are set both or neither. `CLOUDINARY_API_SECRET` is required with `MEDIA_PROVIDER=cloudinary`. `TURNSTILE_SECRET_KEY` unset makes `POST /reviewer/sessions` answer 503. `JWT_ACCESS_SECRET`, `OTP_PEPPER` and `TOTP_ENC_KEY` must each be at least 32 bytes (`openssl rand -base64 48`).
- `OWNER_SETUP_TOKEN` is optional and temporary: it opens the one-time owner setup page ([devops-runbook.md](devops-runbook.md), "First owner").
- The key ids (`JWT_ACCESS_KID`, `TOTP_ENC_KID`, `TOTP_ENC_PREVIOUS_KID`) are labels, not secrets: they go in the ConfigMap. The Turnstile **site** key is public and is a web build arg.
- Secrets outside the cluster: `DEPLOYMENT_REPO_TOKEN` and the registry login of CI live in GitHub Environments ([ci-cd.md](ci-cd.md)).
- The backup job's bucket token can write; cms-api's `BACKUP_STORAGE_*` token is a different, read-only one (list and get) of the same bucket. `BACKUP_AGE_RECIPIENT` is a public key, kept with the job's config; the matching private age key is never in the cluster or in git.
- Never use the Cloudflare always-pass test keys, `console` mail or `fake` media outside test stacks; production boot rejects the last two.

## 2. Pick a mechanism

Secrets never go into the deploy repo in plain text. Pick one:

- **SOPS + age** (sections 3 to 5): encrypted files in the deploy repo, decrypted by your GitOps tool's SOPS support at apply time, or by hand with `sops -d <file> | kubectl apply -f -`.
- **sealed-secrets**: run the controller in the cluster, create the Secret locally, `kubeseal` it, commit the `SealedSecret`. Back up the controller's sealing key; without it the committed files cannot be decrypted after a cluster rebuild.

Either way: one Secret per consumer, one set of files per environment (a staging key never opens production), and a restart after any change (section 6).

## 3. SOPS layout and one-time setup

```
.sops.yaml                               # which files are encrypted, to which keys
clusters/<env>/
  config/cms-api-config.yaml             # ConfigMap, plain (no secrets)
  secrets/cms-api-secrets.sops.yaml      # API role + app secrets
  secrets/cms-api-migrate-db.sops.yaml   # the migration role (init container only)
  secrets/postgres-backup.sops.yaml      # backup role + bucket write token (backup job only)
```

`.sops.yaml` (a public key is safe to commit):

```yaml
creation_rules:
  - path_regex: clusters/production/secrets/.*\.sops\.yaml$
    encrypted_regex: ^(data|stringData)$
    age: <age-public-key-of-production-cluster>,<age-public-key-of-the-operator>
  - path_regex: clusters/staging/secrets/.*\.sops\.yaml$
    encrypted_regex: ^(data|stringData)$
    age: <age-public-key-of-staging-cluster>,<age-public-key-of-the-operator>
```

`encrypted_regex` leaves `metadata` readable, so reviews show which Secret changed but never a value. The operator's key lets a person edit the file; the cluster key lets the cluster decrypt it.

One-time setup on the operator machine:

```sh
age-keygen -o cluster-production.agekey     # prints the public key (age1...)
age-keygen -o operator.agekey
kubectl -n <gitops-namespace> create secret generic sops-age \
  --from-file=age.agekey=cluster-production.agekey
```

- Put the **public** keys in `.sops.yaml`. Never commit an `.agekey` file (add `*.agekey` to the deploy repo's `.gitignore`). Back up each private key separately: losing the cluster key means every committed secret must be re-issued.
- `sops-age` is the only secret that is never in git. Check the data-key name your GitOps tool expects.

## 4. The Secrets, before encryption

Use `stringData` so nothing needs base64:

```yaml
apiVersion: v1
kind: Secret
metadata: { name: cms-api-secrets, namespace: <ns> }
type: Opaque
stringData:
  DB_USERNAME: <the API role's login>
  DB_PASSWORD: <value>
  JWT_ACCESS_SECRET: <value>
  OTP_PEPPER: <value>
  TOTP_ENC_KEY: <value>
  CLOUDINARY_API_SECRET: <value>
  TURNSTILE_SECRET_KEY: <value>
  SMTP_USER: <value>
  SMTP_PASSWORD: <value>
  BACKUP_STORAGE_ACCESS_KEY_ID: <value> # read-only bucket token; with the next key, or neither
  BACKUP_STORAGE_SECRET_ACCESS_KEY: <value>
  # OWNER_SETUP_TOKEN: <value>   # first install only; remove after the owner exists
---
apiVersion: v1
kind: Secret
metadata: { name: cms-api-migrate-db, namespace: <ns> }
type: Opaque
stringData:
  DB_USERNAME: <the migration role's login>
  DB_PASSWORD: <value>
---
apiVersion: v1
kind: Secret
metadata: { name: postgres-backup, namespace: <ns> }
type: Opaque
stringData:
  DB_USERNAME: <the backup role's login>
  DB_PASSWORD: <value>
  RCLONE_CONFIG_OFFSITE_TYPE: s3
  RCLONE_CONFIG_OFFSITE_PROVIDER: Cloudflare
  RCLONE_CONFIG_OFFSITE_ENDPOINT: https://<account-id>.r2.cloudflarestorage.com
  RCLONE_CONFIG_OFFSITE_ACCESS_KEY_ID: <value>
  RCLONE_CONFIG_OFFSITE_SECRET_ACCESS_KEY: <value>
  RCLONE_CONFIG_OFFSITE_NO_CHECK_BUCKET: 'true'
  BACKUP_AGE_RECIPIENT: <age1... public key>
```

The rclone names follow rclone's `RCLONE_CONFIG_<REMOTE>_<OPTION>` convention; they are **not run** until the first backup run proves them.

## 5. Create and edit the encrypted files

```sh
export SOPS_AGE_KEY_FILE=operator.agekey
sops clusters/production/secrets/cms-api-secrets.sops.yaml   # opens an editor, encrypts on save
```

Or fill a template and run `sops --encrypt --in-place <file>`. Before committing: `grep -c ENC\\[ <file>` finds the encrypted values, and `git diff --cached` shows no plain value. Never commit a filled template. Edit later with `sops <file>`; read with `sops -d <file>`, never redirecting the output into the repo.

## 6. How the apps consume them

- **cms-api:** each container reads its own database Secret: the init container `envFrom` `cms-api-config` + `cms-api-migrate-db`, the main container `cms-api-config` + `cms-api-secrets` ([kubernetes.md](kubernetes.md) section 3). Containers in one pod do not share process environments, and the init container has exited before the main one starts, so the main container never sees the migration password. Because each Secret holds its own `DB_USERNAME`, `envFrom` never has two sources for one key. A missing or short secret stops the main container with the failing key names; a wrong database login stops the init container (`Init:Error`).
- **web:** the container `envFrom` `web-secrets`; the other web values are plain `env` entries ([configmaps.md](configmaps.md) section 4). `TURNSTILE_SECRET_KEY` must be the real key: in production web refuses to start with Cloudflare's always-pass test secret, and `ALLOW_TURNSTILE_TEST_SECRET` is never set in deploy config (ADR 0018 section 2.6). Changing `WEB_SESSION_SECRET` signs every visitor out. `APP_API_TOKEN` is required: web refuses to start without it; create it as a dedicated `guest`-role account (an owner or admin token reads `references.phone` and `experiences.company` unmasked and web would publish them; steps and the post-deploy `_maskedFields` check in the patch note) with the scope `{ "permissions": [{ "subject": "*", "action": "read" }] }` and nothing else (read-only, published content only; D5 bounds it; see [patch-web-0.2.0.md](../apps/web/patch-web-0.2.0.md) item 2); revoke and replace it like any API token. Restart after any change.
- **cms-admin:** no Secret.
- Manual one-time commands (`owner:bootstrap`, `owner:reset-2fa`) run with `kubectl exec` inside the running main container, so they already have the Secret; their password is typed at a prompt and never stored in a file.

`envFrom` of a Secret does not update a running container: after any change, restart.

## 7. Rotate

For any value: `sops <file>`, change it, commit, apply, then restart:

```sh
kubectl -n <ns> rollout restart deploy/cms-api
kubectl -n <ns> rollout status deploy/cms-api
```

The restart also reruns the init container, so a wrong migration password shows as `Init:Error` while the old pod keeps serving.

| Secret                       | How                                                                                                                                                                                                                                                                           | Effect to expect                                                                                                               |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| `DB_PASSWORD` (API role)     | change the role password at a psql prompt first (`\password <api role>`), then `cms-api-secrets`, then restart cms-api. Never put a password in a SQL file.                                                                                                                   | brief gap between the two steps; do them back to back                                                                          |
| `DB_PASSWORD` (migrator)     | change the migration role's password (on a managed service, where the provider sets it), then `cms-api-migrate-db`. Nothing to restart: the next rollout's init container reads it.                                                                                           | a rollout between the two steps fails in the init container while the old pod keeps serving                                    |
| `DB_PASSWORD` (backup role)  | `\password <backup role>`, then `postgres-backup`. No restart: the next scheduled run takes it.                                                                                                                                                                               | one night's dump fails if the two steps are far apart                                                                          |
| bucket tokens                | rotate in the bucket provider's dashboard: the job token in `postgres-backup`, the read-only token in `cms-api-secrets` (restart cms-api). Roll the age key by generating a new pair and changing `BACKUP_AGE_RECIPIENT`; keep the old private key for the dumps already made | the Backups page shows an error between the two steps; the next dump fails with a wrong job token                              |
| `JWT_ACCESS_SECRET`          | new value and a new `JWT_ACCESS_KID` (ConfigMap) together, restart                                                                                                                                                                                                            | there is no previous-key slot for the access secret, so existing access tokens stop validating; users sign in or refresh again |
| `OTP_PEPPER`                 | new value, restart                                                                                                                                                                                                                                                            | one-time codes issued before the change no longer verify; users request a new code                                             |
| `TOTP_ENC_KEY`               | move the old key to `TOTP_ENC_PREVIOUS_KEY`, its id to `TOTP_ENC_PREVIOUS_KID`, set the new key and a new `TOTP_ENC_KID`, restart. Remove the previous pair after every user has signed in with a valid code once (each secret is re-encrypted on its next valid code)        | no user is locked out; the previous pair must be set both or neither and its id must differ from the current one               |
| `CLOUDINARY_API_SECRET`      | rotate in the Cloudinary console, update the Secret, restart                                                                                                                                                                                                                  | uploads fail between the two steps                                                                                             |
| `TURNSTILE_SECRET_KEY`       | rotate in the Cloudflare dashboard, update, restart                                                                                                                                                                                                                           | reviewer sessions fail between the two steps                                                                                   |
| `OWNER_SETUP_TOKEN`          | not rotated: replace it and restart if it leaked before setup; remove it once the owner exists                                                                                                                                                                                | the old token stops working at once; with an owner the route stays closed (404)                                                |
| `SMTP_USER`, `SMTP_PASSWORD` | rotate at the mail provider, update both, restart                                                                                                                                                                                                                             | OTP mail fails between the two steps                                                                                           |

Rotate the **age keys** separately from the values:

1. Generate the new key pair and add its public key to `.sops.yaml` next to the old one.
2. Re-encrypt every file for the new recipients: `sops updatekeys <file>`. Rotate the data key too with `sops --rotate --in-place <file>` when someone who held the old key should no longer be trusted; then also rotate the secrets themselves, because a leaked key can read every earlier commit.
3. Replace the `sops-age` Secret in the cluster with the new private key, confirm the apply still works, then remove the old public key from `.sops.yaml` and run `updatekeys` again.

If a private key or a decrypted value leaks: rotate every value it covered (table above), then the age key.

## 8. Rules of thumb

- Plain secrets only ever exist in the cluster and in the operator's editor buffer.
- CI in this repo holds no cluster secrets; it only bumps `APP_IMAGE_TAG` in the deploy repo ([ci-cd.md](ci-cd.md)).
- Review a secret change by its commit metadata and the key names in the diff.
- A cluster rebuild needs the age key before anything encrypted can be applied: back up the private age keys and the database dumps.
