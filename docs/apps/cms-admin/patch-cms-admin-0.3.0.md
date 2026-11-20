# DevOps patch: cms-admin, repo version 0.3.0

What the deploy repo and the GitHub Environment must change for cms-admin 0.3.0, compared with the 0.2.0 setup. cms-admin now shows the Turnstile widget on sign-in, the 2FA step, owner setup and password reset (D25, [ADR 0027](../../adr/0027-shared-human-check.md)); the browser needs the public site key at build time. Web no longer holds a Turnstile secret or the admin URL (WEB-12).

| Item                        | Deploy repo object                     | Change                                                                                                                                                                                                                                                        | Target state                                     |
| --------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| 1. Admin Turnstile site key | the GitHub Actions variable            | add the variable `VITE_TURNSTILE_SITE_KEY` (Environment variable, never a secret): the real public Cloudflare site key of the widget that allows the admin host. The cms-admin image build refuses to run without it (CI `build-args.sh` and the Dockerfile). | [ci-cd.md](../../deployments/ci-cd.md) section 5 |
| 2. Allow the admin host     | the Cloudflare Turnstile widget        | the widget of that site key lists `admin.<domain>` in its hostnames; cms-api checks the same host through `TURNSTILE_EXPECTED_HOSTNAME` ([cms-api patch 0.3.0](../cms-api/patch-cms-api-0.3.0.md)).                                                           | [ci-cd.md](../../deployments/ci-cd.md) section 5 |
| 3. Drop web variables       | the GitHub variable and the web Secret | delete the variable `NEXT_PUBLIC_ADMIN_URL` (the web build no longer reads it) and any `TURNSTILE_SECRET_KEY`, `TURNSTILE_EXPECTED_HOSTNAME` and `ALLOW_TURNSTILE_TEST_SECRET` from the web Secret and ConfigMap (web never reads them).                      | [ci-cd.md](../../deployments/ci-cd.md) section 5 |

## Order

1. Release cms-api 0.3.0 first (it needs the secret and expected hosts).
2. Add `VITE_TURNSTILE_SITE_KEY` before the cms-admin image is built.
3. Drop the web items after web 0.3.0 runs.
