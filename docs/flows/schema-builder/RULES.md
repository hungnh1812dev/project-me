# Schema builder: rules

Part of the [project spec](../../../SPEC.md). Flow `schema-builder`: [SPEC.md](SPEC.md) · [FLOW.md](FLOW.md) · [RULES.md](RULES.md).

Rules of this flow only. Rules it shares with other flows are in the files under "Also follows"; read them too. A decision id (`D..`) is indexed in [DECISIONS.md](../../global/DECISIONS.md).

## Must

1. The validate route is owner only as a hard rule (`requireOwnerActor`) that no role grant can open; `no-store`; throttled per actor (SB-10, D24).
2. Check definitions only with the validator content-engine exports; a new definition rule is added there, never in cms-admin or in the content-types module (D24).
3. Return only the errors whose path lies in the submitted definition; never echo another type's definition or its paths (SB-10).
4. Add a field type to the palette as one registry entry (SB-4).

## Must never

1. Write a schema file, a migration, the registry or any database row from this flow (D24, D10).
2. Enable export for a tree whose last validation is missing, failed or older than the tree (SB-12).
3. Use `@dnd-kit` outside cms-admin (D24).

## Also follows

- [content-modeling/RULES.md](../content-modeling/RULES.md): identifiers, depth and destructive changes (what the exported file must meet).
- [global/RULES.md](../../global/RULES.md): boundaries, constants and literals, client IP and rate limits (D7).
- [apps/cms-admin/RULES.md](../../apps/cms-admin/RULES.md): layers and feature order, tokens and requests, CSP (D17), look, buttons and feedback (D23).
- [apps/cms-api/RULES.md](../../apps/cms-api/RULES.md): module directions and layers (the content-types module calls content-engine only through its `index.ts`), API headers (D17).
