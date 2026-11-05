# Security audit: rules

Part of the [project spec](../../../SPEC.md). Flow `security-audit`: [SPEC.md](SPEC.md) · [FLOW.md](FLOW.md) · [RULES.md](RULES.md).

Rules of this flow only. Rules it shares with other flows are in the files under "Also follows"; read them too. A decision id (`D..`) is indexed in [DECISIONS.md](../../global/DECISIONS.md).

## Must

1. Write every event of the D15 list in the same transaction as the change; always on, even when activity tracking is `none` (D15, criterion 18).
2. Store field names only in metadata, never values (D15).

## Must never

1. Store tokens, passwords, codes, setup tokens or presigned URLs in a row (D15, D20).

## Ask first

- Adding, removing or renaming an audit action (a change to D15).

## Also follows

- [global/RULES.md](../../global/RULES.md): boundaries (no OTPs, tokens or passwords in logs).
- [apps/cms-api/RULES.md](../../apps/cms-api/RULES.md): module directions (`security-audit` imports `access` core types only).
