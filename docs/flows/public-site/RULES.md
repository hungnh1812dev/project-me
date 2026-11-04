# Public site: rules

Part of the [project spec](../../../SPEC.md). Flow `public-site`: [SPEC.md](SPEC.md) (what it must do) · [FLOW.md](FLOW.md) (steps and modules) · [RULES.md](RULES.md) (rules every change must keep).

Rules of this flow only. Rules it shares with other flows are in the files under "Also follows"; read them too. A decision id (`D..`) is indexed in [DECISIONS.md](../../global/DECISIONS.md).

## Must

1. GraphQL authz is the REST read path, not a copy: `DocumentAuthGuard`, then `DocumentsQueryService` unchanged; no other data path (D18).
2. Keep the GraphQL limits, introspection off in production and `Cache-Control: no-store` (D18).
3. The homepage shows the CV and the service status card; the card renders even when the CV fails to load (D21, criterion 25).
4. The web shows the published `cv-page` with `isMain = true`, the newest `updatedAt` if several (Q-G7).

## Must never

1. Add a `/status` route on web (D21, criterion 25).
2. Add GraphQL mutations or subscriptions (v2, [out of scope](../../../SPEC.md)).

## Also follows

- [global/RULES.md](../../global/RULES.md): richtext (D13), client IP (D7).
- [apps/cms-api/RULES.md](../../apps/cms-api/RULES.md): field-level reads (D3).
- [apps/web/RULES.md](../../apps/web/RULES.md): layers, web rules, BFF (D21), CSP (D17).
