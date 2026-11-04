---
name: lean-reading
description: How agents read files, code and command output with the fewest tokens - one section of a large Markdown file via .claude/bin/section, code via graphify explain/affected and line ranges, bounded grep, logs to a file. Preloaded by every agent that reads the repo.
---

# Lean Reading

Everything you read stays in your context for every later turn. Read the smallest part that answers the question, once.

**Where things are: `MODULES.md` first.** It maps every app module to its folder and its doc in `docs/modules/` (purpose, techniques, entry points, where to change what, and a table of its files). Read the docs of the modules you need, then use graphify and line ranges below. Never list folders or grep the whole repo to find where a feature lives.

**Large Markdown (task, phases, done, spec, conventions, docs over ~5 KB): never whole.**
- `.claude/bin/section <file> --id <ID>`: one task entry. `section <file> "<heading text>"`: one section (e.g. `"Checkpoint RVOFF-B"`). `section <file> §7.2`: one numbered section (an old `SPEC §n` / `Dn` ref: find its doc in the Replaces column of the root `SPEC.md` Docs table first, then read that doc by heading). `section <file> --toc`: headings only, to find the right one.
- `grep -n -A3 -i <word> <file>` for one fact.
- ADRs (`docs/adr/`, 20-50 KB each): `grep -m1 '^- Status:' <adr>` to see whether it is still in force, then `section <adr> "Decision"`, or only the heading you need (`--toc` first). Never the whole file.

**Code** (when `graphify-out/graph.json` exists):
- `graphify affected "<file or symbol>"`: who depends on it (impact, callers).
- `graphify explain "<file or symbol>"`: its imports, users and the line of each symbol. `graphify path "<A>" "<B>"`: how two parts connect.
- Then read only those lines (`Read` with `offset` / `limit`, or `sed -n <a>,<b>p`). Read a whole file only when you will change most of it or it is under ~150 lines.
- No natural-language `graphify query`: its keyword matches are mostly noise. If you need it: `--seed <node> --budget 500`.
- The graph covers committed code plus the last `graphify update .`. For files in the current uncommitted diff, read the diff.

**grep** for literal strings (env keys, error codes, routes): `grep -rln` first, then `grep -n` in the files you need; exclude `node_modules`, `dist`, `.next`, `graphify-out`; cap with `| head -n 40`.

**Command output** (tests, builds, e2e, audits): redirect to a file in your scratchpad; read `tail -n 40` or the failing block only.

**No re-reads:** never read a file again unless it changed since you read it.
