# Traefik: hosts, routes, timeouts, client IP

How requests reach the three apps (D7, D14). Examples to copy into the deploy repo; names in `<angle brackets>` are yours. Workloads: [kubernetes.md](kubernetes.md). The smoke stack (`docker-compose.smoke.yml`) runs the same routers with labels, and `pnpm smoke` checks them ([local run guide](../guidelines/local-run.md)).

Traefik v3.6 (3.6.x) or a later v3 release; no router-level timeouts are used.

## 1. Hosts and routes

| Host             | Path            | Goes to                  |
| ---------------- | --------------- | ------------------------ |
| `<domain>`       | all             | web Service (8080)       |
| `admin.<domain>` | `/api/*`        | cms-api Service (3000)   |
| `admin.<domain>` | everything else | cms-admin Service (8080) |

Rules that matter:

- **Never StripPrefix.** cms-api serves under `/api/v1`; the router passes the path through untouched.
- **`/api` must win over the cms-admin catch-all on the admin host, and match the whole path segment** (`PathRegexp`, not `PathPrefix`, because `/api-tokens` is an admin SPA route). Set explicit `priority` values (below) instead of relying on rule length.
- **No cms-api route on `<domain>`** (ADR 0018): web has no browser-side API calls; its Node server reaches cms-api through `APP_API_URL` inside the cluster. `<domain>/api/v1/*` is the web BFF and any other `<domain>/api/*` answers 404 from web. Traefik already sends the whole `<domain>` host to web, so this needs no deploy-repo change.
- cms-admin and cms-api share the origin `https://admin.<domain>` (the refresh cookie `__Secure-abyss_rt` is host-only, `Path=/api/v1/auth`), and that origin is the only CORS origin. Web is a different origin and holds its own sealed session cookies set by its BFF.
- TLS terminates at Traefik (`websecure`); nothing in the apps speaks TLS. Add a `web` entrypoint redirect to HTTPS.
- **No redirect on `/api/v1/*`** (section 4).
- `VITE_API_BASE_URL` (cms-admin build arg) is `https://admin.<domain>/api/v1`. Moving the route from `<domain>` to the admin host and rebuilding cms-admin with that value are one step ([patch-cms-admin-0.1.0.md](../apps/cms-admin/patch-cms-admin-0.1.0.md) gives the order). The `/api` and `api-upload` routes move together.

```yaml
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: abyss-admin
  namespace: <ns>
spec:
  entryPoints: [websecure]
  routes:
    - kind: Rule
      match: Host(`admin.<domain>`) && PathRegexp(`^/api(/|$)`)
      priority: 20
      middlewares:
        - name: api-inflight
      services:
        - name: cms-api
          port: 3000
    - kind: Rule
      # api-upload: upload and replace only, in every path form cms-api accepts
      match: Host(`admin.<domain>`) && ((Method(`POST`) && PathRegexp(`(?i)^/api/v1/media/?$`)) || (Method(`PUT`) && PathRegexp(`(?i)^/api/v1/media/[^/]+/file/?$`)))
      priority: 200
      middlewares:
        - name: api-inflight
        - name: upload-close
      services:
        - name: cms-api
          port: 3000
    - kind: Rule
      match: Host(`admin.<domain>`)
      priority: 10
      services:
        - name: cms-admin
          port: 8080
  tls:
    secretName: <admin-domain-tls>
---
apiVersion: traefik.io/v1alpha1
kind: IngressRoute
metadata:
  name: abyss-public
  namespace: <ns>
spec:
  entryPoints: [websecure]
  routes:
    - kind: Rule
      match: Host(`<domain>`)
      services:
        - name: web
          port: 8080
  tls:
    secretName: <domain-tls> # or certResolver: <resolver>
---
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: api-inflight
  namespace: <ns>
spec:
  inFlightReq:
    amount: 100 # per client IP (default sourceCriterion)
---
apiVersion: traefik.io/v1alpha1
kind: Middleware
metadata:
  name: upload-close
  namespace: <ns>
spec:
  headers:
    customResponseHeaders:
      Connection: close
```

## 2. Upload timeouts (MU-2)

Media uploads can be slow on poor links, and a slow request holds a socket.

| Item                          | Where                                                                                                                          | Effect                                                                                                               |
| ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------- |
| `websecure` `readTimeout: 5m` | entrypoint `transport.respondingTimeouts.readTimeout` (smoke: `--entrypoints.web.transport.respondingTimeouts.readTimeout=5m`) | an upload of up to about 5 minutes completes; it applies to every route and also bounds slow request headers         |
| Node `requestTimeout` 5 min   | cms-api `Bootstrap.setup.ts` (a constant, no env key); `headersTimeout` stays at the Node default                              | neither side cuts a valid slow upload earlier than the other; never set the Traefik value below it                   |
| `api-upload` route            | only `POST /api/v1/media` and `PUT /api/v1/media/<id>/file`, priority above `/api`, same service                               | uploads get their own middleware chain; other `/api` traffic keeps keep-alive                                        |
| `upload-close` middleware     | `Connection: close` on the response, on `api-upload` only                                                                      | an early 401/403 is delivered at once and the connection closes                                                      |
| `api-inflight` middleware     | `inFlightReq` 100 per client IP, on `api-upload` and on `/api` (each router counts its own 100)                                | bounds concurrent slow requests per client, because the 5 minute value applies to every `/api` route, login included |

Why `upload-close`: when cms-api rejects an upload early (401/403), Traefik still reads up to 256 KB of the unread body before it answers, bounded only by `readTimeout`, so an anonymous client sending slowly holds the answer back. A response with `Connection: close` skips that drain. cms-api does not send the header itself: the proxy drops hop-by-hop headers from the backend, and a socket cms-api closed itself with an unread body made Traefik answer 502 instead of 401. cms-api keeps the socket open and discards the unread body of any upload it answers with an error (401/403/413/415, up to 16 MiB or 5 s), so a pooled connection is never left mid-body.

Limits: the browser gives up an upload after 4 minutes (below the 5 minute server value), so a 100 MB file needs about 3.5 Mbit/s upload. Every upload response closes its connection. HTTP/2 was not exercised on the smoke stack (plain HTTP).

## 3. Client IP: `externalTrafficPolicy: Local` and `TRUST_PROXY_HOPS` (D7)

Rate limits (login, refresh, reviewer sessions) and `api-inflight` are keyed by client IP. cms-api reads it from `X-Forwarded-For`, so the IP Traefik sees must be the real one.

1. Set `externalTrafficPolicy: Local` on the Traefik Service (through its Helm values or however your cluster installs Traefik). With the default `Cluster`, kube-proxy source-NATs the connection and every client appears as a node IP, so all visitors share one rate-limit bucket. The Traefik pod must run on the node that receives the traffic. Check: `kubectl -n <traefik-namespace> get svc traefik -o jsonpath='{.spec.externalTrafficPolicy}'` prints `Local`.
2. Set `TRUST_PROXY_HOPS` on cms-api to the number of proxies between the client and the API that append to `X-Forwarded-For`:

   | Topology                                   | `TRUST_PROXY_HOPS` | `CLIENT_IP_HEADER` |
   | ------------------------------------------ | ------------------ | ------------------ |
   | client -> Traefik -> cms-api               | `1` (default)      | unset              |
   | client -> Cloudflare -> Traefik -> cms-api | `1`                | `cf-connecting-ip` |

   Never `true`: it trusts every hop and lets a client forge its IP. Behind Cloudflare, Traefik's peer is a Cloudflare address, so use `CLIENT_IP_HEADER=cf-connecting-ip`, and only when the origin accepts traffic from Cloudflare ranges alone (firewall or Traefik `forwardedHeaders.trustedIPs`); otherwise a client can send that header itself. Do not add other proxies (an extra ingress, a service mesh) without raising the value.

## 4. No redirect on the API, and CORS

**Rule:** Traefik must not redirect (308 or any other 3xx) any request to `/api/v1/*`, including the CORS preflight `OPTIONS`, from the admin and web origins. A browser does not follow a redirect on a preflight, so a trailing-slash redirect breaks browser calls. The only allowed redirect is `web` to `websecure` (HTTP to HTTPS). Do not add a redirect or trailing-slash middleware to the `/api` router.

Origins cms-api must allow ([configmaps.md](configmaps.md)): `ADMIN_ORIGIN` = `https://admin.<domain>` (the only CORS origin) and `WEB_ORIGIN` = `https://<domain>` (not a CORS origin; it is in the Origin allowlist of the refresh-cookie endpoints).

Check, for each origin (expect a 2xx status and no `Location` header):

```bash
curl -i -X OPTIONS "https://admin.<domain>/api/v1/<path>" \
  -H "Origin: https://admin.<domain>" \
  -H "Access-Control-Request-Method: POST"
```

Repeat with `Origin: https://<domain>` and with a path that ends in `/`. A `3xx` status or a `Location` header means a router or middleware redirects the API: fix it in the routes above.
