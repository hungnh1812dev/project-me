---
app: web
summary: BFF request pipeline and page rendering
---

# web: flows

Part of the [project spec](../../../SPEC.md). App `web`: [SPEC.md](SPEC.md) · [FLOW.md](FLOW.md) · [RULES.md](RULES.md). In these files a section without an `Applies to:` line covers every flow that touches this app.

## BFF request pipeline

Applies to flows: `sign-in`, `public-site`.

Every BFF route, in this order (D21):

1. Allowed method only.
2. State-changing routes need `Origin` exactly `WEB_ORIGIN`, and `Sec-Fetch-Site` (when sent) `same-origin`.
3. POST bodies are `application/json` only, at most 8 KiB.
4. Per-IP fixed-window rate limit (`auth` 20 / 60 s, `read` 120 / 60 s).
5. Zod schema per body: unknown keys refused, lengths capped.
6. Turnstile check where the route needs one.
7. The one upstream cms-api call, with `API_TIMEOUT_MS`, the forwarded client IP (D7) and only the headers that call needs.
8. The answer holds allowlisted fields only; errors are `{ statusCode, errorCode, message }`; `Cache-Control: no-store`.

```mermaid
flowchart LR
  req(["browser request /api/v1/*"]) --> m{"method allowed?"}
  m --> o{"Origin = WEB_ORIGIN?"}
  o --> b{"JSON, at most 8 KiB?"}
  b --> rl{"rate limit"}
  rl --> z{"Zod schema"}
  z --> t{"Turnstile (where needed)"}
  t --> up["one cms-api call on APP_API_URL"]
  up --> ans["allowlisted answer, no-store"]
```

## Page render

Applies to flows: `public-site`.

1. `src/proxy.ts` creates the per-request nonce and sets the CSP header (D17).
2. The root layout runs the shell query and the page its page query (public-site PS-1), through server GraphQL → server RESTful on `APP_API_URL` with `APP_API_TOKEN`, each cached for its own revalidate seconds (default 180 s, WEB-4).
3. Where `APP_ENV` is not `production` (WEB-9), a root field whose read failed (GraphQL `errors` with HTTP 200 included) is filled from `MockView.ts` by its mock key, above the fetch and never cached; otherwise it shows its error state. A null or empty root field without an error shows its empty state (WEB-5).
4. Client components get their text from the layout's text context and call only the BFF under `/api/v1`, through the client RESTful layer (WEB-1, WEB-3).
