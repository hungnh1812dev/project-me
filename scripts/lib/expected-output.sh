#!/usr/bin/env bash
# Used by scripts/smoke.sh and scripts/lib/stack-seed.sh. Source it; do not run it.
#
# The one file that holds every cms-api / app value the smoke test asserts:
# CLI and log messages, the mail subject, security header values, the refresh
# cookie name. When an app changes one of them, only this file changes. The
# values themselves are owned by the apps:
#   header values  apps/web/src/config/SecurityHeaders.constants.ts,
#                  apps/cms-admin/nginx/security-headers.inc.template,
#                  apps/cms-api/src/common/constants/Http.constants.ts
#   cookie name    apps/cms-api/src/modules/identity/http/IdentityHttp.constants.ts
#   CLI messages   apps/cms-api/src/modules/identity/cli, content-engine/cli

# Security header values (SPEC D17).
HSTS_VALUE="max-age=63072000; includeSubDomains"
REFERRER_POLICY_VALUE="strict-origin-when-cross-origin"
API_CSP_VALUE="default-src 'none'; frame-ancestors 'none'"
REFRESH_COOKIE_NAME="__Secure-abyss_rt"

# Init container log (deploy:migrate).
DB_MIGRATE_APPLIED="All migrations have been successfully applied."
DB_MIGRATE_SEEDED="Seeded system roles: public, guest, reviewer, editor, admin, owner."
CONTENT_MIGRATE_APPLIED="Applied "

# CLI output when re-run inside the cms-api image.
DB_MIGRATE_NOTHING="No pending migrations to apply."
DB_SEED_NOTHING="System roles already seeded."
OWNER_EXISTS="An owner account already exists."
RESET_2FA_UNKNOWN="No account with this email."
RESET_2FA_NOT_ON="Two-factor authentication is not on for this account."
RESET_2FA_NO_TTY="No terminal for the confirmation prompt."
CONTENT_MIGRATE_NOTHING="No pending content migrations."
SEED_ACCOUNT_DONE="Seeded account:"

RESET_MAIL_SUBJECT="Your Abyss CMS password reset code"
