# Summary: cv-page-schema

## Overview
Content fields now carry `component`, `displayName` and `width`; `text` is short text and `string` long text. Component tables and GraphQL component types are named by their component path. Existing resume and header tables were renamed with their data. cms-admin shows the new labels, inputs and widths. cv-page `references.phone` and `experiences.company` are masked as sensitive.

## Sub-features
- Field metadata and component names (phase 1): content schemas, table names, migration 0006 (renames, accepted drops), GraphQL type names, field views with `width` and `displayName`, document form layout.
- Reserved-word component field names (CPS-8), and cv-page field `referees` renamed to `references` (CPS-9).
- Sensitive cv-page fields `references.phone` and `experiences.company` (SQC-1, migration 0008, metadata only).
- Dev stack reaches the API through the cms-admin dev proxy (DS-1).

## Structure
- apps/cms-api: content-engine, content-types, graphql, content/schemas, content/migrations (0006, 0008), schema.graphql
- apps/cms-admin: features/content, features/content-types
- apps/e2e: ComponentFields, ContentForm, ContentConflict, CvPage, RichtextToolbar specs; reviewer specs removed
- docs/modules, docs/global, docs/flows, CHANGELOG.md, scripts/dev-stack.sh, scripts/e2e-spec.sh

## Commits
Base `bad52ae3`, head `f6fe38c3`. Feature commits: ceb9ef36, 471c7f91, cc5d8ec3, 336e16f3, 0918d5b2, 6b861f03, eae46479, be27a80d, e025a600, 5ada79cc, df8147c2, 2258002f, 635d3352, f6fe38c3.

## Resolved issues
- CPS-C-security#1 (medium): cv-page phone and company not masked. Problem: `references.phone` and `experiences.company` had no `sensitive` flag. Impact: third-party phone numbers readable anonymously. Root cause: the cv-page schema never flagged the fields; the masking decision was open. Fix applied: `"sensitive": true` on both fields, plus metadata-only migration 0008_content.sql.
- QC-6 (RichtextToolbar spec race): fixed in the e2e spec by waiting for the menu to close and the block-type label to update.
