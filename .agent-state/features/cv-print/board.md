# Board - cv-print
Size: medium
Breaks: none
Source: tasks/todo.md "Feature cv-print" · Phases: tasks/plan.md "Feature cv-print" · Base: 6f40009faf909138328da1e31b78d9b483801496
Feature checks: qc pending · security pending · Checklist: CHECKLIST.md
Decisions: spec public-site PS-7 and Q-CP1..Q-CP6 answered; reference PDFs stay untracked in apps/web/public until close (no commit, no move, no delete).
Open risks: spec and plan edits (docs, CHANGELOG, tasks/) are uncommitted in the working tree; not part of any task commit.

## Phase 1: Print the CV to PDF
Base: 6f40009faf909138328da1e31b78d9b483801496 · Phase checks: qc pending · security pending · Checkpoint: pending
Checkpoints: CVP-A pending (checklists/CVP-A.md)

| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|
| CVP-1 | cms-api: optional text field `print` on `cv-common-text` | core-builder | todo | - |
| CVP-2 | The print button on the CV page | ui-builder | todo | - |
| CVP-3 | The CV print matches the reference | ui-builder | todo | - |
| CVP-e2e | e2e spec for printing the CV | qc | todo | - |

## Direct requests
| ID | Title | Scope | Status | Commit |
|---|---|---|---|---|

## Built
- (none yet)

## Notes
- The reference PDF is `apps/web/public/Middle-Frontend-Developer_HungNguyenHuy_CV.pdf` (untracked); it is read, not committed.
