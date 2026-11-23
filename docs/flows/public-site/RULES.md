# Public site: rules

Part of the [project spec](../../../SPEC.md). Flow `public-site`: [SPEC.md](SPEC.md) · [FLOW.md](FLOW.md) · [RULES.md](RULES.md).

Rules of this flow only. Rules it shares with other flows are in the files under "Also follows"; read them too. A decision id (`D..`) is indexed in [DECISIONS.md](../../global/DECISIONS.md).

## Must

1. GraphQL authz is the REST read path, not a copy: `DocumentAuthGuard`, then `DocumentsQueryService` unchanged; no other data path (D18).
2. Keep the GraphQL limits, introspection off in production and `Cache-Control: no-store` (D18).
3. The homepage `/` and `/status` show only the module status and load no CV data; each CV is served on `/cv/<documentId>` only (D21, Q-BFF2, Q-PS5, PS-5, criteria 25, 31).
4. The web reads a `page-cv-a` by the `documentId` of the URL only, never through a list; a malformed, unknown or unpublished id gets the one not-found answer (HTTP 404), a failed read with no mock the no-CV-live state (HTTP 200); `/cv/<documentId>` never answers 500 (PS-2, PS-5).
5. Every response under `/cv` carries `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet`, the same robots meta tag and `Cache-Control: private, no-store`; production `robots.txt` disallows `/cv` and the sitemap lists no `/cv` path (PS-4, PS-5).
6. Page content reads use `APP_API_TOKEN`, whose read profile is the `public` role's and no wider; sensitive fields stay masked on cached pages (WEB-2, Q5).

## Must never

1. Add GraphQL mutations or subscriptions (v2, [out of scope](../../../SPEC.md)).
2. Hand out a `page-cv-a` `documentId` anywhere a visitor or crawler can read it, other than the CV's own `/cv/<documentId>` page and its refetch (a page, a built-in header entry, the sitemap, a crawler file, a BFF answer, a log line, a printed page or its PDF title), or let an actor that only reads list a link-only type (CM-13, PS-5, PS-7).

## Also follows

- [global/RULES.md](../../global/RULES.md): richtext (D13), client IP (D7).
- [apps/cms-api/RULES.md](../../apps/cms-api/RULES.md): field-level reads (D3).
- [content-modeling/SPEC.md](../content-modeling/SPEC.md): link-only types (CM-13).
- [apps/web/RULES.md](../../apps/web/RULES.md): layers, web rules, BFF (D21), CSP (D17).
