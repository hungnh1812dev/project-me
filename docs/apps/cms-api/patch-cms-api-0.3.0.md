# DevOps patch: cms-api, repo version 0.3.0

What the deploy repo must change for cms-api 0.3.0, compared with the 0.2.0 setup. cms-api now verifies a Cloudflare Turnstile token on login, 2FA verify, email challenge, owner setup, password request-otp and password reset (D25, [ADR 0027](../../adr/0027-shared-human-check.md)), so production needs the real secret and the hosts of the pages that show the widget. Apply staging first, then production.

| Item                     | Deploy repo object               | Change                                                                                                                                                                                                   | Target state                                               |
| ------------------------ | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| 1. Turnstile secret      | the cms-api Secret               | `TURNSTILE_SECRET_KEY: <the real Cloudflare secret>` is now required in every environment that runs `NODE_ENV=production` (it was only needed for reviewer sessions). cms-api stops at start without it. | [secrets.md](../../deployments/secrets.md) section 1       |
| 2. Expected hosts        | the cms-api ConfigMap            | `TURNSTILE_EXPECTED_HOSTNAME: <domain>,admin.<domain>`: comma-separated bare hosts of the web and admin pages, lower case. Required with a real secret; cms-api stops at start without it.               | [configmaps.md](../../deployments/configmaps.md) section 1 |
| 3. No test-secret opt-in | the cms-api Secret and ConfigMap | `ALLOW_TURNSTILE_TEST_SECRET` must stay unset; production refuses Cloudflare's always-pass test secret without it. Only the smoke stack sets it.                                                         | [configmaps.md](../../deployments/configmaps.md) section 2 |

## Order

1. Check that web and admin already use the same Cloudflare site key and that the key allows both hosts (Cloudflare dashboard, widget hostnames).
2. Add items 1 and 2 to the Secret and the ConfigMap, then release cms-api 0.3.0 and let the deploy repo bump `APP_IMAGE_TAG`.
3. After the rollout, sign in on the web and on the admin: the widget shows and the sign-in succeeds. A `curl` of `POST /api/v1/auth/login` without `turnstileToken` answers `400 HUMAN_CHECK_FAILED`.

## Rollback

Put the previous image tag back; the new keys may stay (0.2.0 ignores `TURNSTILE_EXPECTED_HOSTNAME` without reviewer features and reads `TURNSTILE_SECRET_KEY` as before). A release tag is never moved: fix forward with the next version ([release.md](../../deployments/release.md) section 5).
