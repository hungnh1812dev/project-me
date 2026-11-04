# Decided questions (all answered; kept as the decision record)

Part of the [project spec](../../SPEC.md); moved from the old SPEC §14. Global: it applies to every flow in `docs/flows/`. Questions owned by one flow moved to the Decisions section of that flow's `SPEC.md` (see the root spec's Old references).

| #    | Question                                                                                       | Recommendation                                                                                                                 |
| ---- | ---------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Q1   | Use Kysely for content queries (new dependency) instead of Prisma for content tables?          | Yes: Prisma can't model runtime-defined tables safely; Kysely keeps parameterized, typed-ish SQL                               |
| Q4   | Real domain names, and is Cloudflare in front (affects `CLIENT_IP_HEADER` and Turnstile keys)? | —                                                                                                                              |
| Q10  | List pagination style (convention for documents, media, audit logs)?                           | Offset: `page` (default 1), `pageSize` (default 20, max 100), response `meta { page, pageSize, total }`                        |
| Q-W4 | Web CSP `style-src` (D17)                                                                      | `'self' 'nonce-<n>'` plus `style-src-attr 'unsafe-inline'` (React/Radix inline style attributes; attributes cannot run script) |
