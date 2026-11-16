# Public site: rules

Part of the [project spec](../../../SPEC.md). Flow `public-site`: [SPEC.md](SPEC.md) · [FLOW.md](FLOW.md) · [RULES.md](RULES.md).

Rules of this flow only. Rules it shares with other flows are in the files under "Also follows"; read them too. A decision id (`D..`) is indexed in [DECISIONS.md](../../global/DECISIONS.md).

## Must

1. GraphQL authz is the REST read path, not a copy: `DocumentAuthGuard`, then `DocumentsQueryService` unchanged; no other data path (D18).
2. Keep the GraphQL limits, introspection off in production and `Cache-Control: no-store` (D18).
3. The homepage `/` and `/status` show only the module status and load no CV data; the CV is served on `/cv` (D21, Q-BFF2, Q-PS5, criterion 25).
4. The web shows the published `page-cv-a` with `isMain = true`, the newest `updatedAt` if several, and shows the no-CV-live state (HTTP 200) when there is none or its read failed with no mock; `/cv` never answers 404 or 500 for its content (Q-G7, PS-2).
5. Page content reads use `APP_API_TOKEN`, whose read profile is the `public` role's and no wider; sensitive fields stay masked on cached pages (WEB-2, Q5).

## Must never

1. Add GraphQL mutations or subscriptions (v2, [out of scope](../../../SPEC.md)).

## Also follows

- [global/RULES.md](../../global/RULES.md): richtext (D13), client IP (D7).
- [apps/cms-api/RULES.md](../../apps/cms-api/RULES.md): field-level reads (D3).
- [apps/web/RULES.md](../../apps/web/RULES.md): layers, web rules, BFF (D21), CSP (D17).
