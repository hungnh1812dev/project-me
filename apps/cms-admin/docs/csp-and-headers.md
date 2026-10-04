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
an external script, Tiptap runs with `injectCSS: false`, and the JSON editor keeps its styles in a
shadow root (below). The policy did not change for the luxury restyle; `csp.ts` and its test are
untouched.

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

**The image.** The `runner` stage (`nginx-unprivileged:alpine`) runs as the non-root user `abyss`,
numeric `USER 1001`, and listens on 8080. `VITE_API_URL` is a build arg of the `builder` stage only
(`--build-arg VITE_API_URL=https://cms-api.example.com`; empty keeps the relative `/api/v1`), so the
runner stage holds neither the arg nor the env var. In CI the value comes from the GitHub
Environment variable `VITE_API_URL`. `.env` files never reach the image (`.dockerignore`).

Image check by hand:

```bash
docker build -f apps/cms-admin/Dockerfile -t cms-admin .
docker run --rm -p 8081:8080 -e CSP_API_ORIGIN=https://api.example.test -e CSP_IMG_ORIGINS=https://cdn.example.test cms-admin
curl -sI localhost:8081/admin   | grep -i -E 'content-security-policy|referrer-policy'  # both
curl -sI localhost:8081/healthz | grep -i -E 'content-security-policy|referrer-policy'  # neither
```

### JSON editor under the CSP

CodeMirror 6 (through style-mod) normally injects a `<style>` element into `document`, which
`style-src 'self'` blocks. Instead of a nonce, `JsonInput` mounts the editor inside an **open shadow
root** of the custom element `<repo-json-editor>` (form-associated, `delegatesFocus`, defined once).
CodeMirror resolves its root to that ShadowRoot, so style-mod writes every rule into a constructed
`CSSStyleSheet` in `shadowRoot.adoptedStyleSheets`. Constructed stylesheets and CSSOM
`element.style` writes are not governed by `style-src`, so no `<style>` element is created and the
policy stays `style-src 'self'` with no `'unsafe-inline'`, nonce or hash.

- **Rejected: `EditorView.cspNonce`.** It would add `'nonce-…'` to `style-src`, and nginx and
  `vite preview` would have to inject a fresh nonce into `index.html` and the header per request.
- **Closed shadow roots are not allowed**: tests and axe must reach the editor.
- **Supported browsers:** evergreen Chrome/Edge 73+, Firefox 101+ and Safari 16.4+ (constructable
  stylesheets and `adoptedStyleSheets`). Older browsers would fall back to a `<style>` element inside
  the shadow root, which the policy blocks, and show an unstyled editor; they are out of scope.
- **Tolerated Chromium report.** When a single edit replaces a selection spanning several
  `.cm-line`s, Chromium's native contenteditable code merges the lines through an inline-styled
  span. The browser blocks that attribute and raises one `style-src-attr` report (`blockedURI`
  `inline`, no source file); the editor stays styled and works. The CSP spec tolerates at most that
  one report, only on the Chromium `csp` project; any other violation, or the same report on Firefox
  or WebKit, still fails.

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
- **Runtime env, not build env.** The CSP origins are read by nginx at start, so they can change
  without a rebuild. The API origin is the exception: `VITE_API_URL` is a Docker build arg of the
  `builder` stage, set in CI from the GitHub Environment variable `VITE_API_URL` and baked into the
  bundle (see [Testing and config](./testing-and-config.md#env-vars)). Keep `CSP_API_ORIGIN` in
  line with it when the API is on another origin.
- **A library that needs inline scripts or styles is a stop-and-ask**, not a policy change. The
  JSON editor is the worked example: a shadow root, not a nonce.
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
- `e2e/csp.spec.ts` (projects `csp`, `csp-firefox` and `csp-webkit`: Chromium, Firefox and WebKit on
  the built app on 5175 with `CSP_IMG_ORIGINS=https://media.example.test`):
  the exact policy and `Referrer-Policy` headers plus the referrer meta (AC-11); `/login`, `/admin`
  and `/admin/settings/media` render with zero `securitypolicyviolation` events and the thumbnails
  load (AC-12); later phases added the document list, the open date picker, a detail page with the
  editor mounted and the open media picker; a control image from `https://blocked.example.test`
  fires a violation, so the policy is really active. The JSON editor test opens a document with a
  JSON field and checks zero violations, the same `document` `<style>` count before and after the
  editor mounts, `adoptedStyleSheets.length >= 1` on the host's shadow root, a visible line-number
  gutter and a monospace `.cm-content`, also after formatting and typing (with the Chromium
  tolerance above). Another test checks that clicking the field label focuses the editor and that
  Tab and Shift+Tab leave and re-enter it. Every test runs on all three projects.
- Run: `pnpm --filter cms-admin exec vitest run src/core/security` and
  `PLAYWRIGHT_BROWSERS_PATH=0 pnpm --filter cms-admin test:e2e --project=csp --project=csp-firefox --project=csp-webkit`.

## Related

- [Testing and config](./testing-and-config.md) (env vars, the `csp`, `csp-firefox` and `csp-webkit` Playwright projects)
- [Design system](./design-system.md#json-editor-jsoninput-on-codemirror-6) (the JSON editor)
- [Theme](./theme.md) (why `theme-init.js` is external)
- [Settings media](./settings-media.md) and [Schema form](./schema-form.md) (use `safeImageSrc` through `MediaThumbnail`)
- [Roadmap](./roadmap.md) (open header findings)
