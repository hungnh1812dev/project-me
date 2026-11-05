---
app: cms-admin
summary: API requests with token refresh, routing and the session
---

# cms-admin: flows

Part of the [project spec](../../../SPEC.md). App `cms-admin`: [SPEC.md](SPEC.md) · [FLOW.md](FLOW.md) · [RULES.md](RULES.md). In these files a section without an `Applies to:` line covers every flow that touches this app.

## API request and token refresh

1. A feature calls cms-api through its `*.api.ts` on the shared API client.
2. The auth interceptor adds the Bearer header. A call flagged `shouldRefreshExpiringToken` (uploads) refreshes first when the token is about to expire (MU-2).
3. On `401` the interceptor runs one refresh shared by all tabs (Web Lock + BroadcastChannel), then retries the call once; a refused refresh ends the session.
4. The feature's errors file maps the failure to its copy.

The sequence across tabs: [sign-in FLOW.md](../../flows/sign-in/FLOW.md) "cms-admin: refresh across tabs".

## Routing and session

1. `app/` (composition root) builds the store, providers, shell and routes.
2. `ProtectedRoute` sends a signed-out visitor to `/login` ([sign-in](../../flows/sign-in/FLOW.md)).
3. The setup page shows only while `GET /setup/status` says `open` ([owner-setup](../../flows/owner-setup/FLOW.md)).
