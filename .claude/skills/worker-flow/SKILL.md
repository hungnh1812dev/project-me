---
name: worker-flow
description: The fixed pipeline the worker runs for every task - receive, decompose, implement, unit test, Chrome MCP / e2e test, security test, docs, report. Use whenever the worker starts a task from the manager.
---

# Worker Flow

Run these steps in order for every task. Each step names the skill to invoke. Do not move on until the step's exit check passes.

## 1. Receive
- Read the task brief. Restate the goal and acceptance criteria in 2-3 lines.
- List any assumption you would have to make. If there is one that matters, **stop and report `blocked`** with questions. Do not guess.

Exit: every acceptance criterion is clear and testable.

## 2. Decompose
- Skill: `agent-skills:planning-and-task-breakdown`
- Split the task into small subtasks (vertical slices), each verifiable on its own.
- Read only the code you need (`agent-skills:context-engineering`).

Exit: a short subtask checklist.

## 3. Implement
- Skills: `agent-skills:incremental-implementation`, plus as relevant:
  - UI → `agent-skills:frontend-ui-engineering` + `ui-ux-pro-max:ui-ux-pro-max` + project `ui-direction`
  - API / module boundaries → `agent-skills:api-and-interface-design`
  - Framework or library APIs → `agent-skills:source-driven-development` (check the official docs, don't rely on memory)
  - React / Next.js → `react-best-practices`
- Follow `code-standards` (no hardcoding, config and tokens only).
- One slice at a time: build, run, then the next slice.

Exit: all subtasks implemented, project builds and type-checks.

## 4. Unit test
- Skill: `agent-skills:test-driven-development`
- Cover the acceptance criteria, edge cases, and error paths. For bugs, write a failing test first.
- Run the whole affected package's test suite, not just the new tests.

Exit: all tests pass. Report the count.

## 5. Browser / e2e test
- Skill: `agent-skills:browser-testing-with-devtools` (Chrome DevTools MCP or Claude in Chrome MCP). Use the project's e2e runner (e.g. Playwright) if one exists.
- Walk the real user flow: happy path, validation errors, empty / loading / error states, keyboard navigation.
- Check the console for errors and the network tab for failed or unexpected requests.
- For UI, check against `ui-direction` and run `web-design-guidelines` on the changed screens.

Exit: flow works in the real browser with a clean console. Not applicable for non-UI tasks (say why).

## 6. Security test
- Skill: `agent-skills:security-and-hardening`
- Check: input validation, authz on every new endpoint, injection (SQL / XSS / command), secrets in code or logs, unsafe dependencies (`npm audit` or the equivalent for the package manager in use), sensitive data in client bundles.

Exit: no open findings, or findings listed in the report with severity.

## 7. Docs
- Skill: `agent-skills:documentation-and-adrs`
- Update the affected app/package README, API docs, and `.env.example` for new config keys (names and descriptions only, never real values).
- Write an ADR for any non-obvious architectural decision.

Exit: docs match the code.

## 8. Finish
1. Run Prettier on the changed files (see `code-standards`).
2. Re-run the tests if Prettier changed anything.
3. Write the proposed commit message (`commit-convention`).
4. Update `.claude/state/handoff.md` with a short entry for this task (`session-handoff`).
5. Return the `WORKER REPORT`.
