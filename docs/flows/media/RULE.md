# Media: rules

Part of the [project spec](../../../SPEC.md). Flow `media`: [SPEC.md](SPEC.md) (what it must do) · [FLOW.md](FLOW.md) (steps and modules) · [RULE.md](RULE.md) (rules every change must keep).

Every change in this flow must keep these rules. A rule cites where it comes from; a decision id (`D..`) without a link lives in [global/security.md](../../global/security.md). Changing a rule or a decision is an **ask first** ([boundaries](../../global/boundaries.md)).

## Must

1. Detect the type from magic bytes against the allowlist; reject SVG and HTML always; re-encode images with sharp (D12, criterion 13).
2. Keep the upload limits per kind and the upload timeouts of [canonical-values.md](../../global/canonical-values.md) (MU-2).
3. Name stored files only through `storedFileNameOf`, applied once where the hash is known; the rename SQL and the rule give the same name for the same row (MU-3).
4. Block delete with `409 MEDIA_IN_USE` while any document references the file; audit media delete (D12, D15).
5. Show no progress bar at 100 % before the server has answered for every file it covers (MU-1).

## Must never

1. Change storage keys (UUIDv7), object names or URLs (D12, §15 scope).
2. Change rate limits, size limits or the D12 checks as part of a timeout change (MU-2).

## Global decisions this flow follows

D3, D4, D7, D15, D17 (CSP `img-src` includes Cloudinary).

## Decisions owned by this flow

**D12 Media.** Type detected from magic bytes against an allowlist (`jpeg png webp gif avif pdf mp4`); SVG and HTML always rejected. Images re-encoded with sharp (strips EXIF/GPS). Storage keys UUIDv7; full SHA-256 stored for dedupe. Soft delete, blocked (`409 MEDIA_IN_USE`) while any document references the file; a job purges cloud objects afterwards. The stored `fileName` is `<stem>_<hash8>.<ext>` (§15 MU-3); existing rows are renamed by one SQL migration; storage keys stay UUIDv7.
