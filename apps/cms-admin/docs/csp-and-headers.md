# CSP and headers

The admin's browser hardening (SEC-4, P4-SEC-2): one Content-Security-Policy builder shared by nginx
and `vite preview`, `Referrer-Policy: same-origin`, the nginx image that serves them, and the image
URL allowlist used for media thumbnails. For operators deploying the image and for anyone adding a
script, style or image source.

## Feature

### The policy

`buildContentSecurityPolicy({ apiOrigin, imgOrigins })` is the single source of the policy:

```
default-src 'self'; script-src 'self'; style-src 'self';
img-src 'self' data: blob: <CSP_API_ORIGIN> <CSP_IMG_ORIGINS>; font-src 'self';
connect-src 'self' <CSP_API_ORIGIN>; object-src 'none'; base-uri 'self';
form-action 'self'; frame-ancestors 'none'
```

One line in practice; empty origins are left out. Each origin must be a bare `http(s)://host[:port]`,
otherwise the builder throws. There is no `'unsafe-inline'`: `index.html` loads `theme-init.js` as
an external script, and Tiptap runs with `injectCSS: false`.

| Variable          | Meaning                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------- |
| `CSP_API_ORIGIN`  | The API origin added to `img-src` and `connect-src`. Empty when the API is same-origin  |
| `CSP_IMG_ORIGINS` | Extra image origins (CDN, media host), space separated. Added to `img-src`. Empty by default |

They are not `VITE_` vars, so they never reach the bundle: nginx reads them when the container
starts, and one image serves any deployment. Set `CSP_IMG_ORIGINS` to the media host that serves
thumbnails, or the media library images are blocked.

### Where it is served

- **Production (nginx):** `nginx.conf` is an envsubst template copied to
  `/etc/nginx/templates/default.conf.template`. Every app `location` (`/`, the SPA fallback,
  `/assets/`) adds both headers with `always`; `/healthz` does not. The `Dockerfile` sets
  `ENV CSP_API_ORIGIN="" CSP_IMG_ORIGINS=""`, so unset values give a self-only policy.
- **`vite preview`:** `preview.headers` in `vite.config.ts` sends the same two headers from the
  environment.
- **Dev server:** no CSP (Vite injects inline styles for HMR).
- **`index.html`:** `<meta name="referrer" content="same-origin">`, so the referrer rule holds where
  the header is missing.

Image check by hand:

```bash
docker build -f apps/cms-admin/Dockerfile -t cms-admin .
docker run --rm -p 8081:80 -e CSP_API_ORIGIN=https://api.example.test -e CSP_IMG_ORIGINS=https://cdn.example.test cms-admin
curl -sI localhost:8081/admin   | grep -i -E 'content-security-policy|referrer-policy'  # both
curl -sI localhost:8081/healthz | grep -i -E 'content-security-policy|referrer-policy'  # neither
```

### Image URL allowlist

`safeImageSrc(url, origins)` returns a URL safe to render, or `null`. It allows any absolute `https:`
URL, or `http:` on the API or page origin (so the dev backend on `http://localhost:8080` works).
Anything else (`http:` to another host, `data:`, `blob:`, `javascript:`, relative or unparsable)
gives `null`, and the caller shows a placeholder with no `src`, so no request is sent. Callers render
allowed images with `referrerPolicy="no-referrer"` (see `MediaThumbnail` in
[Settings media](./settings-media.md)).

### Decisions

- **One builder, pinned to the template.** The policy text lives in `csp.ts`; a test compares the
  nginx template against it, so the two can't drift.
- **Runtime env, not build env.** The CSP origins are read by nginx at start, so the same image is
  promoted across environments.
- **A library that needs inline scripts or styles is a stop-and-ask**, not a policy change.
- **Known gap:** nginx sends no `X-Content-Type-Options: nosniff` (H-SEC-3, see
  [Roadmap](./roadmap.md)).

## Files

| File                               | Spec                                                                                             |
| ---------------------------------- | ------------------------------------------------------------------------------------------------ |
| `src/core/security/csp.ts`         | Exports `buildContentSecurityPolicy`, `CspOrigins`. Validates the origins and builds the policy. |
| `src/core/security/safeImageSrc.ts`| Exports `safeImageSrc`, `ImageOrigins`. The image URL allowlist; fails closed to `null`.         |
| `nginx.conf`                       | envsubst template: SPA serving, both headers on every app location, none on `/healthz`.          |
| `Dockerfile`                       | Builds the app and the nginx image; defaults both `CSP_` vars to empty.                         |
| `index.html`                       | The HTML shell: referrer meta, external `theme-init.js` before the module script.                |

## Testing

- `src/core/security/csp.test.ts`: the policy text, origin validation, empty origins left out.
- `src/core/security/nginxTemplate.test.ts`: the template carries the builder's policy on every app
  location and none on `/healthz`.
- `src/core/security/safeImageSrc.test.ts`: allowed and rejected schemes and origins.
- `e2e/csp.spec.ts` (project `csp`, built app on 5175 with `CSP_IMG_ORIGINS=https://media.example.test`):
  the exact policy and `Referrer-Policy` headers plus the referrer meta (AC-11); `/login`, `/admin`
  and `/admin/settings/media` render with zero `securitypolicyviolation` events and the thumbnails
  load (AC-12); later phases added the document list, the open date picker, a detail page with the
  editor mounted and the open media picker; a control image from `https://blocked.example.test`
  fires a violation, so the policy is really active.
- Run: `pnpm --filter cms-admin exec vitest run src/core/security` and
  `PLAYWRIGHT_BROWSERS_PATH=0 pnpm --filter cms-admin test:e2e --project=csp`.

## Related

- [Testing and config](./testing-and-config.md) (env vars, the `csp` Playwright project)
- [Theme](./theme.md) (why `theme-init.js` is external)
- [Settings media](./settings-media.md) and [Schema form](./schema-form.md) (use `safeImageSrc` through `MediaThumbnail`)
- [Roadmap](./roadmap.md) (open header findings)
