# Content editing: rules

Part of the [project spec](../../../SPEC.md). Flow `content-editing`: [SPEC.md](SPEC.md) · [FLOW.md](FLOW.md) · [RULES.md](RULES.md).

Rules of this flow only. Rules it shares with other flows are in the files under "Also follows"; read them too. A decision id (`D..`) is indexed in [DECISIONS.md](../../global/DECISIONS.md).

## Must

1. Check `version` on save and `expectedVersion` on publish; at most one draft and one published row per `document_id` (D11, criterion 12).
2. Keep the bulk limits: 50 records per request, 200 component rows per record, 1 MB body; bulk only on collections ([canonical-values.md](../../global/reference/canonical-values.md)).
3. Presence needs `update` on the document and returns only `{ accountId, displayName, state, lastSeenAt }` (D16).

## Also follows

- [global/RULES.md](../../global/RULES.md): richtext (D13), boundaries (parameterized SQL).
- [apps/cms-api/RULES.md](../../apps/cms-api/RULES.md): field-level reads and writes (D3, D4), API tokens (D5), code style.
- [apps/cms-admin/RULES.md](../../apps/cms-admin/RULES.md): tokens and requests.
