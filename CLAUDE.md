## graphify

This project has a knowledge graph at graphify-out/ with god nodes, community structure, and cross-file relationships.

Rules:
- When graphify-out/graph.json exists, use it before raw grep or whole-file reads for a code question: `graphify affected "<file or symbol>"` for impact and callers, `graphify explain "<file or symbol>"` for structure and the line of each symbol, `graphify path "<A>" "<B>"` for relationships; then read only those line ranges. Put this rule in every subagent prompt that explores code.
- Do not use natural-language `graphify query`: it matches keywords and returns mostly noise. If needed, pass `--seed <node> --budget 500`. Find literal strings (env keys, error codes, routes) with grep (`-l` first, capped output).
- Large Markdown files (tasks/, SPEC.md, docs, state files over ~5 KB): read one part with `.claude/bin/section <file> <heading | §n | --id ID | --toc>`, never the whole file.
- If graphify-out/wiki/index.md exists, use it for broad navigation instead of raw source browsing.
- Read graphify-out/GRAPH_REPORT.md only for broad architecture review or when affected/explain/path do not surface enough context.
- After modifying code, run `graphify update .` to keep the graph current (AST-only, no API cost).
- A committed graphify-out/graph.json is rewritten whole on every build, so a large diff to it in a pull request is expected. Do not flag it as churn or suggest skipping the graph rebuild or its hooks.
