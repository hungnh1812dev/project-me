---
app: cms-admin
summary: Rules every cms-admin feature and view must keep
---

# cms-admin: rules

Part of the [project spec](../../../SPEC.md). App `cms-admin`: [SPEC.md](SPEC.md) · [FLOW.md](FLOW.md) · [RULES.md](RULES.md). In these files a section without an `Applies to:` line covers every flow that touches this app.

## Layers and feature order

- **cms-admin layers** (higher imports lower, never the reverse): `main.tsx` → `app/` (composition root: store, providers, shell, routes) → `features/*` → `components/`, `lib/` → `config/`. `lib/` and `components/` import no feature and no `app/`; features import no `app/`. Only `app/` imports `features/auth/app-wiring.ts`.

- **cms-admin feature order** (a feature imports only features to its left, via their `index.ts`): `auth` < `security` < `content-types` < `access` < `media` < `content`, `reviewer`. `status` imports no other feature. `content-types` owns the `ContentType` / `ContentTypeField` model and `getContentTypes`, read by `access`, `media`, `content` and `reviewer`.

## Tokens and requests

1. The access token lives in memory only and travels as a Bearer header (D14).
2. Every call goes through the shared API client and the auth interceptor; token header and refresh rules live only in `Auth.interceptor.ts` ([auth module doc](../../modules/cms-admin/auth.md)).
3. Calls use the default client timeout; a longer one is set per call only where a flow needs it (uploads: `MEDIA_UPLOAD_TIMEOUT_MS`, [canonical-values.md](../../global/reference/canonical-values.md)).

## CSP (D17)

- The CSP comes from the nginx config: `script-src 'self'`, `connect-src` from env, `img-src` including Cloudinary. No `'unsafe-eval'`: the bundle never calls `eval` or `new Function`, so Zod runs `jitless` (D17, ADR 0015).

## Look and tokens (D23)

- Components use semantic tokens only (Tailwind classes such as `bg-card`, `text-muted-foreground`, `rounded-control`, `shadow-card`, `duration-fast`); never a palette class (`bg-indigo-600`), raw colour, arbitrary radius or shadow. A missing token is added to form-commons `tokens.css` (both theme blocks) first.
- Surfaces: one `Card` (form-commons) per block; no card inside a card; no 1px frame used as decoration (inputs and table dividers keep theirs).
- Focus: never remove focus styles; interactive elements use the shared focus classes of form-commons (ADM-9).
- Motion: animate only colour, background, shadow, opacity and transform, with `duration-fast` or `duration-base`; every animation honours reduced motion.

## Buttons and action placement (D23)

- One primary button per view or dialog; the variant follows the action's meaning (ui-direction §2).
- Order: secondary left, primary right, end-aligned. Create sits in the page header's `action`; Save at the bottom right of its form. A destructive action beside a Save sits at the left end of the bar or in a bottom "Danger zone" card; a confirm dialog puts its destructive confirm in the primary position and names the action (ADM-6).

## Feedback: toast or inline (D23)

- **Toast** (`useToast().showToast`): the outcome of an action the user just took that asks nothing more of them: saved, created, uploaded, replaced, deleted, invited, revoked, copied; and the failure of an action started outside a form (a row or bulk action), with its error text.
- **Inline** (`FormAlert` next to the form, `LoadError` with retry): validation and submit errors of a form or dialog (the user must fix something there), load errors, and anything the user must read or copy before it goes away (a one-time API token, recovery codes, a reviewer notice). Never a toast for these.
- One toast per action; a repeat of the same action replaces its previous toast rather than stacking.
