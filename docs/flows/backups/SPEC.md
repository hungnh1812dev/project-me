---
flow: backups
summary: Owner-only list of nightly database dumps and 60-second download links after re-authentication
---

# Backups: spec

Part of the [project spec](../../../SPEC.md). Flow `backups`: [SPEC.md](SPEC.md) (what it must do) · [FLOW.md](FLOW.md) (steps and modules) · [RULE.md](RULE.md) (rules every change must keep).

## Behaviour

The deploy repo's nightly job dumps the database, encrypts it and uploads it to a Cloudflare R2 bucket. In cms-admin the owner lists the dumps and, after entering the password and a 2FA code, gets a download link valid 60 s. The page warns when no daily dump is newer than 26 hours. The full decision is D20 in [RULE.md](RULE.md).

Endpoints: [api-contract.md](../../global/api-contract.md) row "Backups (D20)". Stack: [stack-and-commands.md](../../global/stack-and-commands.md) row "Backups".

## Requirements

D20 ([RULE.md](RULE.md)) and D19 (`abyss_backup` role). New requirements of this flow go here with ids `BK-<n>`.

## Acceptance

No global success criterion is owned by this flow; its acceptance lives in tasks BK-* (ADR 0013).

## Decisions

Q-BK1..Q-BK7 were answered by the user on 2026-10-27 and are recorded in D20 and ADR 0013.

## Out of scope

On-demand dumps and streaming dump bytes through cms-api (D20).

## Open questions

None.

## Change log

- 2026-10-27 Backup download (D20, ADR 0013, Q-BK1..Q-BK7).
- 2026-11-04 Flow folder created from the old SPEC.
