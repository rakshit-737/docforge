# DocForge — next-level prompt sequence

Use these prompts one at a time. Do not paste the entire roadmap into an agent
session.

Run them in order unless a prompt says otherwise:

1. `prompts/01-baseline.md` — establish the real baseline.
2. `prompts/02-web-regression.md` — add web-studio E2E coverage.
3. `prompts/03-proof-mode.md` — build document preflight checks.
4. `prompts/04-content-security.md` — harden HTML and import boundaries.
5. `prompts/05-persistence.md` — harden project storage and recovery.
6. `prompts/06-performance-offline.md` — measure performance and PWA quality.
7. `prompts/07-csl-bibliography.md` — build proper citation workflows.
8. `prompts/08-table-editor.md` — build visual tables and document variables.
9. `prompts/09-review-workflows.md` — comments and suggested edits.
10. `prompts/10-pdf-redaction-ocr.md` — secure redaction and OCR.
11. `prompts/11-technical-publishing.md` — diagrams, charts, and long-form features.
12. `prompts/12-cli-distribution.md` — make the CLI and packages production-ready.
13. `prompts/13-ai-cloud.md` — optional AI and additive cloud features.

Each prompt is intentionally narrow. Complete and verify one before starting
the next. For every prompt, preserve the existing DocForge constraints:

- Existing dialect syntax is additive-only.
- Preview, PDF, DOCX, CLI, and single-file output must not regress.
- The single-file edition must remain offline and self-contained.
- Local mode must not require accounts or send documents anywhere.
- `DESIGN.md`, `PRODUCT.md`, and `CONTRIBUTING.md` remain authoritative.
- Never claim a check passed unless it actually ran.

The recommended first prompt is `prompts/01-baseline.md`.
