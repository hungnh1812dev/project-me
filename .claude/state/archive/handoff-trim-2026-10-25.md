# Handoff trim 2026-10-25

Lines moved out of `handoff.md` by the manager. Phase R4 is closed (see `board-archive.md`); its "awaiting checks/commit" lines were stale because the commits exist in git. Unscheduled follow-ups are kept here for lookup, not as open tasks. Grep by ID.

## Phase R4 in-progress lines (stale: commits exist)
- R4-01 .. R4-29 task lines (cms-api, admin, web, kit, scripts, e2e, workflows; "awaiting checks/commit" and "next:" pointers).
- R4-24 user decisions: baseline the two failing specs in a separate worktree; do not stash the working tree.
- R4-16 user decision: content-row-mapping allowlist entry committed; no planner review requested.
- R4-15 user decision: reviewer session expiry computed before the Turnstile call is accepted.
- R4-13 user decision: approved permission.validator.ts -> permission-set.validator.ts (and spec).
- R4-13 format warnings: turnstile.client.ts, definition.validator.ts, migration-runner.ts, print-schema.spec.ts.
- R4-11 user decision: two-factor.service.ts -> two-factor-management.service.ts approved after the fact.
- R4-10 user decision: kit folder moves approved; test-form.tsx -> packages/form-commons/test/.
- R4-09 user decision: 16 stray "-E" backup files deleted; merge.test-data.ts -> apps/cms-admin/test/merge.fixture.ts.
- R4-07 user decision: owner-bootstrap, media-refs and media-references renames approved.
- R4-25 qc: progress-report rule could not be followed mid-run; qc may need shorter runs (planner or user).
- Rule (user): every qc agent reports progress every 25 minutes; two consecutive reports must differ; no report for 50 minutes -> manager stops that qc agent. (Lasting: moved to conventions "User decisions in force".)

## Old follow-ups (unscheduled backlog at trim time)
- R4-25 / R4-24 / R4-22 / R4-21 / R4-20 / R4-19 / R4-18 / R4-17 / R4-12 / R4-10 / R4-09 / R4-08 / R4-07 / R4-06 qc and builder notes: reviewer.spec `no-underscore-dangle` on `__turnstile`; lint guard gaps for `/graphql` and `/accounts`; Tiptap aria-pressed behaviour; /accounts invite button visible before roles load; `coolingDown` vs `isCoolingDown` naming; CollectionListPage 256 lines; documents.command.service.ts 477 lines (size split); `pnpm smoke` routing check `web /` 404 via proxy (to confirm); richtext Bold aria-pressed on fast typing; token dialog lock e2e missing; MediaLibraryPage row render not split; `IAppConfig` and similar naming kept on purpose; `accountActor`/`anonymousActor` kept; e2e lint `no-base-to-string` in collection-list-display.spec.ts; `tasks/todo.md` wording for `pnpm e2e:spec` and some task texts (planner may align).
- R3 / R2 / R1 items: architecture spec gaps in apps/web lib <-> config imports; drift check for mirrored constants not run; Web favicon 404; reviewer switch-off raw SQL in reviewer module; content-types has no `required` / per-field `writable`; DocumentEditPage minimal; activity database adapter; created_by/updated_by FKs; public richtext sanitize when CV page returns; form-commons Button loading focus; TwoFactorModal still on native Modal; Integration suite Testcontainers timeouts under load; MaxListenersExceededWarning in integration runs; media internal file id must not be filterable/sortable (`listQueryable` not enforced); `ConditionValueKind` alias to drop later; SPEC.md sample still names API_ROUTES.DOCUMENTS; SPEC §2 line 75 still lists violations as pending; password.spec timing flake; R2-06 e2e UI timeouts; R2-12 sentinel spec and boot log not confirmed; R2-17 lint for contract spec not confirmed.
- Smoke stack / qc notes from R4: full e2e run 1 failure unidentified (run 2 passed 189); no max-lines lint guard; reviewer dialog spec warnings.
