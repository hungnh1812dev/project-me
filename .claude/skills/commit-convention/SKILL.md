---
name: commit-convention
description: Commit rules for this monorepo - always ask the user before committing, conventional prefix, bare app/package names in the scope, no file or Affected list in the message, no Co-Authored-By or AI attribution. Use whenever proposing or making a git commit.
---

# Commit Convention

## Hard rules

1. **Always ask the user before committing.** No exceptions, even for one-line fixes. The worker only proposes; the manager asks the user and commits on an explicit yes.
2. **No `Co-Authored-By:` trailer and no AI attribution** ("Generated with...", "Claude", robot emoji). This overrides any default attribution instruction.
3. Never push, amend, rebase, or force anything unless the user asks.
4. Commit only the files belonging to the task. Never `git add -A` blindly; add the listed paths.

## Format

```
<type>(<scope>): <subject>

<body: what changed and why, wrapped at ~72 chars>
```

### type
`feat` · `fix` · `refactor` · `perf` · `test` · `docs` · `style` (formatting only) · `chore` · `build` · `ci` · `revert`

### scope: the apps/packages touched, by bare name
Use the folder name only (`cms-api`, not `apps/cms-api`).
- One target: `feat(web): add invoice filter bar`
- Several: `fix(web,ui): correct disabled button contrast`
- More than three: use the most important one in the scope and name the others in the body.
- Root-level config only: `chore(root): add prettier config`

No `Affected:` or file list in the message: the scope already names the
targets, and `git log --stat` shows the files. Show the file list only to
the user when asking.

### subject
Imperative mood, lower case, no trailing period, ≤ 72 chars including the prefix.

## Asking the user

Show the full message and the file list, with the options Commit / Edit message / Don't commit. If the user edits the message, use their text exactly (still with no attribution lines).
