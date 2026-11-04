---
flow: public-site
summary: The public CV site: CV page from published content over GraphQL, the service status card, the web BFF reads
---

# Public site: spec

Part of the [project spec](../../../SPEC.md). Flow `public-site`: [SPEC.md](SPEC.md) (what it must do) · [FLOW.md](FLOW.md) (steps and modules) · [RULE.md](RULE.md) (rules every change must keep).

## Behaviour

The public site (`domain.com`, Next.js) shows the CV from published content and a "Service status" card on the homepage. The Next server reads content anonymously over the read-only GraphQL API (D18) on `API_INTERNAL_URL`; the browser calls only the web BFF under `/bff/v1` (D21). Sensitive fields stay masked for anonymous visitors through the `public` role's field profile (D2 mechanism, [reviewer](../reviewer/RULE.md)). The full GraphQL decision is D18 in [RULE.md](RULE.md).

Endpoints: [api-contract.md](../../global/api-contract.md) rows "GraphQL (D18)" and "Web BFF". Web rules: [project-structure.md](../../global/project-structure.md) "Web rules".

## Requirements

D18 ([RULE.md](RULE.md)), D13 (rendering richtext), D17 (web CSP), D21 (BFF). New requirements of this flow go here with ids `PS-<n>`.

## Acceptance

Global success criteria of this flow ([success-criteria.md](../../global/success-criteria.md)): 14, 19, 21, 25.

## Decisions

| # | Question | Recommendation |
|---|---|---|
| Q5 | Which fields in `cv-page.json` are sensitive (masked for `public`/`reviewer` by default)? Candidates: `reference.phone`, any salary fields. | — |
| Q-G1 | GraphQL dependency | `graphql` (graphql-js, current stable, exact pin) in cms-api only, in-house handler; no Apollo/Yoga/`@nestjs/graphql` |
| Q-G2 | GraphQL scope | Document reads only, queries only; admin stays on REST |
| Q-G3 | GraphQL pagination | Offset, same as REST (Q10); cursors later if needed |
| Q-G4 | GraphQL limits | Body 32 KiB, 2 000 tokens, depth 8, 5 root fields, 500 field nodes |
| Q-G5 | Introspection in production | Off for everyone; tooling uses the committed SDL |
| Q-G6 | Web GraphQL client | No client library (fetch on server, Axios in browser); `graphql` as a web devDependency for the SDL contract test |
| Q-G7 | Which cv-page the web shows (it is a collection) | The published one with `isMain = true`, newest `updatedAt` if several; none → empty state |

## Out of scope

GraphQL mutations, subscriptions and non-document reads ([out of scope](../../../SPEC.md)).

## Open questions

None.

## Change log

- 2026-10-21 Web on Next.js, GraphQL read API (D18, Q-G1..Q-G7).
- 2026-10-31 Web BFF, homepage status card, reviewer mode removed from web (D21).
- 2026-11-04 Flow folder created from the old SPEC.
