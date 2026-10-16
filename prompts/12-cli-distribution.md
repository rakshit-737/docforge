# Prompt 12 — make the CLI and packages production-ready

Turn the headless pipeline into a dependable developer tool.

Expand the CLI with:

```bash
docforge build report.md --pdf --docx
docforge check report.md
docforge watch report.md
docforge serve report.md
docforge batch ./input --out ./output
docforge inspect report.docforge.json
docforge migrate old-project.docforge.json
```

Support flags for formats, templates, variables, CSL files, fonts, page limits,
strict warnings, and deterministic output naming.

Add:

- CI-friendly exit codes.
- A GitHub Action.
- Watch-mode tests.
- Batch queue tests.
- A clean-install smoke test.
- Package API examples.
- Node/browser compatibility documentation.
- Size and license reports.
- Changelog and semantic-versioning policy.

Align versions in the root package, CLI, engine, math package, and other
publishable packages before publishing. Do not publish unstable APIs without
documenting their stability level.
