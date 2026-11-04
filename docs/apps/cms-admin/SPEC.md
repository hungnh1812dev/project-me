---
app: cms-admin
summary: React and Vite admin console for content, media and access, on admin.domain.com
replaces: 
---

# cms-admin: spec

Part of the [project spec](../../../SPEC.md). App `cms-admin`: [SPEC.md](SPEC.md) (app-wide requirements and decisions) · [FLOW.md](FLOW.md) (processes every flow of the app goes through) · [RULES.md](RULES.md) (rules every flow of the app must keep). In these files `Applies to: all flows.` means every flow that touches this app.

## Behaviour

cms-admin is a React 19 + Vite single-page app served by nginx on `admin.domain.com`. Redux Toolkit holds the session and UI state, TanStack Query the server data, and Axios calls the cms-api REST API only ([stack-and-commands.md](../../global/reference/stack-and-commands.md)).

## Requirements

The requirements of the flows that use cms-admin (Docs table of the [project spec](../../../SPEC.md)). New app-wide requirements go here with ids `ADM-<n>`.

## Decisions

None owned by this app. It follows D14 and D17 ([DECISIONS.md](../../global/DECISIONS.md)).

## Change log

- 2026-11-04 Created from the old SPEC.
