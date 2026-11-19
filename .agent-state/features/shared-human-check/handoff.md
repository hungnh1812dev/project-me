# Handoff - shared-human-check
Updated: 2026-11-19 after feature open

## In progress / next
Next: ask the user "go" before any build (HC-1 is the first task). Then the first build dispatch: core-builder or ui-builder per the HC-1 scope, via the normal loop.
- HC-A checklist written 2026-11-19 (12 rows CHC-A-1..12, tier 1 only, in tasks/plan.md under Checkpoint HC-A). Planner's note: no tier 3 row on this checkpoint (user's answer: tier 3 once at feature end).
- Phase 1 not started.
- User answers 2026-11-19: spec and plan drafts approved and applied with the recommended answers. Q-HC3: drop `module-auth.openCms` with the destructive migration (yes). Q-HC5: forgotten password protects both steps (yes). Q-HC6: tests split by phase, HC-B scoped, screen sign-in specs at HC-C (yes). Q-HC1, Q-HC2, Q-HC4 and the deletion list: recommended answers approved; each builder still asks before each delete.
- Manager: draft `design-single-type-reopen` also edits tasks/plan.md and tasks/todo.md. Apply one draft first, then `.claude/bin/draft rebase` on the other before applying it.
- User answers 2026-11-19 (continue, with notes):
  - Tier 3 (e2e or smoke, over 10 min) runs once, at the end of this feature (feature checks), never per task or per phase checkpoint. Tier 1 and 2 keep their normal place. Checklists must not put tier 3 on a phase checkpoint.
  - Do not start building yet: the user has a higher-priority feature. After the checklist step, stop and wait for the user's "go" before any build dispatch.
- Session break after plan (large feature).
- User answer 2026-11-19: PAUSED (todo) for header-restructure reopen (role-based header, header sub items, public for everyone). Resume at the Next line once the user says go; still no build before that.

## Follow-ups
- reviewer-console (on hold): REPLAN against shared-human-check before it is built -> unscheduled (user decision).
