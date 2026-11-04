---
app: cms-admin
summary: Rules every cms-admin feature and view must keep
---

# cms-admin: rules

Part of the [project spec](../../../SPEC.md). App `cms-admin`: [SPEC.md](SPEC.md) (app-wide requirements and decisions) · [FLOW.md](FLOW.md) (processes every flow of the app goes through) · [RULES.md](RULES.md) (rules every flow of the app must keep). In these files `Applies to: all flows.` means every flow that touches this app.

## Layers and feature order

Applies to: all flows.

- **cms-admin layers** (higher imports lower, never the reverse): `main.tsx` → `app/` (composition root: store, providers, shell, routes) → `features/*` → `components/`, `lib/` → `config/`. `lib/` and `components/` import no feature and no `app/`; features import no `app/`. Only `app/` imports `features/auth/app-wiring.ts`.

- **cms-admin feature order** (a feature imports only features to its left, via their `index.ts`): `auth` < `security` < `content-types` < `access` < `media` < `content`, `reviewer`. `status` imports no other feature. `content-types` owns the `ContentType` / `ContentTypeField` model and `getContentTypes`, read by `access`, `media`, `content` and `reviewer`.

## Tokens and requests

Applies to: all flows.

1. The access token lives in memory only and travels as a Bearer header (D14).
2. Every call goes through the shared API client and the auth interceptor; token header and refresh rules live only in `Auth.interceptor.ts` ([auth module doc](../../modules/cms-admin/auth.md)).
3. Calls use the default client timeout; a longer one is set per call only where a flow needs it (uploads: `MEDIA_UPLOAD_TIMEOUT_MS`, [canonical-values.md](../../global/reference/canonical-values.md)).

## CSP (D17)

Applies to: all flows.

- The CSP comes from the nginx config: `script-src 'self'`, `connect-src` from env, `img-src` including Cloudinary. No `'unsafe-eval'`: the bundle never calls `eval` or `new Function`, so Zod runs `jitless` (D17, ADR 0015).
