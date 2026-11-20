# DevOps patch: web, repo version 0.3.0

What the deploy repo and the GitHub Environment must change for web 0.3.0 ([web SPEC](SPEC.md) WEB-12), compared with the 0.2.0 setup. The web BFF forwards the Turnstile token to cms-api, which now verifies it (D25, [ADR 0027](../../adr/0027-shared-human-check.md)), so web holds no Turnstile secret. Web no longer links to cms-admin or knows its URL.

| Item                       | Deploy repo object                     | Change                                                                                                                                                                         | Target state                                     |
| -------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------ |
| 1. Drop the Turnstile keys | `web-secrets` and the `web` Deployment | delete `TURNSTILE_SECRET_KEY` from `web-secrets`, and `TURNSTILE_EXPECTED_HOSTNAME` and `ALLOW_TURNSTILE_TEST_SECRET` from the Deployment env. Web 0.3.0 never reads them.     | [web.md](../../deployments/web.md) section 4     |
| 2. Drop the admin URL      | the GitHub Actions variable            | delete the variable `NEXT_PUBLIC_ADMIN_URL`; the web image build no longer reads it and the header has no "Open CMS" link.                                                     | [ci-cd.md](../../deployments/ci-cd.md) section 5 |
| 3. Keep the site key       | the GitHub Actions variable            | `NEXT_PUBLIC_TURNSTILE_SITE_KEY` stays, and must be the same public key as cms-admin's `VITE_TURNSTILE_SITE_KEY`; its Cloudflare widget lists `<domain>` and `admin.<domain>`. | [ci-cd.md](../../deployments/ci-cd.md) section 5 |

## Order

1. Release cms-api 0.3.0 first, with `TURNSTILE_SECRET_KEY` and `TURNSTILE_EXPECTED_HOSTNAME: <domain>,admin.<domain>` ([cms-api patch 0.3.0](../cms-api/patch-cms-api-0.3.0.md)).
2. Release cms-admin 0.3.0 ([cms-admin patch 0.3.0](../cms-admin/patch-cms-admin-0.3.0.md)) and web 0.3.0, then bump `APP_IMAGE_TAG` in `web-sync-overlay.yaml`.
3. After web 0.3.0 runs, delete items 1 and 2. Web 0.2.0 needs the old keys, so a rollback of web to 0.2.0 needs them back.
