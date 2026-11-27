# component-item-collapse: handoff

## In progress / next
Next: fix the module docs so `.claude/bin/module-index --check` prints nothing, then the close commit (file list: all changed files except cv-drafts/; message to be approved by the user).

## Direct requests
### DR1 Make module-index --check clean for component-item-collapse
goal: Fix the docs so `.claude/bin/module-index --check` prints nothing and exits 0, ready for the feature close commit. Docs only; no code changes and no edits under cv-drafts/.
acceptance:
1. Run `.claude/bin/module-index --check 2>&1; echo $?` and record the real cause, including the stderr message behind the silent exit 1.
2. Run `.claude/bin/module-index` to regenerate the generated tables (MODULES.md, root SPEC.md Docs table, DECISIONS.md decision index, flow FLOW.md module tables, module doc file tables and Flows lines).
3. Fix any hand-written problem the check reports (module doc sections or file rows still TODO, missing front matter, duplicate D id, unknown flow in an `Applies to:` line). Describe any collapse-related files and behaviour in the module docs of cms-admin content, content-schema and admin-navigation where they are missing or wrong, and record each fact once in the doc that owns it.
4. `.claude/bin/module-index --check` prints nothing and exits 0.
5. No code file, e2e test or cv-drafts/ file is changed.
verify: `cd /Users/hungnguyenhuy/workspace/projects/project-me/code && .claude/bin/module-index --check; echo $?` prints only `0`. Then `git status --short` shows only docs changes beyond the already-listed files.
files: docs/modules/MODULES.md, docs/global/DECISIONS.md, SPEC.md (generated Docs table), docs/modules/cms-admin/content.md, docs/modules/content-schema.md, docs/modules/admin-navigation.md (only those the check or regeneration shows need changes)

## Decisions
- User (2026-11-27): commit all changed files, exclude cv-drafts/.
- Close commit goes through the commit gate; no Co-Authored-By trailer (global CLAUDE.md).
