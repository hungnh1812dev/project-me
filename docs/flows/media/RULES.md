# Media: rules

Part of the [project spec](../../../SPEC.md). Flow `media`: [SPEC.md](SPEC.md) · [FLOW.md](FLOW.md) · [RULES.md](RULES.md).

Rules of this flow only. Rules it shares with other flows are in the files under "Also follows"; read them too. A decision id (`D..`) is indexed in [DECISIONS.md](../../global/DECISIONS.md).

## Must

1. Detect the type from magic bytes against the allowlist; reject SVG and HTML always; re-encode images with sharp (D12, criterion 13).
2. Keep the upload limits per kind and the upload timeouts of [canonical-values.md](../../global/reference/canonical-values.md) (MU-2).
3. Name stored files only through `storedFileNameOf`, applied once where the hash is known; the rename SQL and the rule give the same name for the same row (MU-3).
4. Block delete with `409 MEDIA_IN_USE` while any document references the file; audit media delete (D12, D15).
5. Show no progress bar at 100 % before the server has answered for every file it covers (MU-1).

## Must never

1. Change storage keys (UUIDv7), object names or URLs (D12).
2. Change rate limits, size limits or the D12 checks as part of a timeout change (MU-2).

## Also follows

- [global/RULES.md](../../global/RULES.md): client IP and rate limits (D7), headers (D17).
- [apps/cms-api/RULES.md](../../apps/cms-api/RULES.md): field-level reads and writes (D3, D4).
- [apps/cms-admin/RULES.md](../../apps/cms-admin/RULES.md): tokens and requests (fresh token before an upload).
