# Prompt 03 — build document preflight / Proof mode

Build one focused feature: a “Proof” or “Preflight” panel that tells users
whether a document is ready to export.

Use the existing linter, engine metadata, rendered preview, and export paths.

Detect at minimum:

- Undefined citations.
- Unused bibliography entries.
- Missing footnotes.
- Broken cross-references.
- Duplicate labels.
- Unclosed callouts and code fences.
- Missing image attachments or alt text.
- Unsupported fonts.
- Wide tables.
- Blank pages.
- Orphaned headings.
- Overflowing content.
- Missing title/author/date when a cover is enabled.
- Export warnings.

Each result needs a severity, explanation, and source-line or page jump.

Also add a CLI command if the existing CLI architecture supports it:

```bash
docforge check report.md
```

Add unit tests, one real UI test, and documentation. Do not change existing
rendered output unless the change is intentional and golden-tested.
