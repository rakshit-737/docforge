# Prompt 09 — add comments and review workflows

Build a local-only review layer that never prints by default and never changes
the manuscript unless the user accepts a change.

Add:

- Comments anchored to source blocks or rendered blocks.
- Comment list and navigation.
- Resolve/reopen.
- Unresolved-comment filter.
- Review-sheet export.
- Optional inclusion in DOCX/PDF.

Then design suggested edits with explicit insertions and deletions. Every
suggested edit must be visible, individually accept/rejectable, and undoable.

Use source spans so comments survive recomposition. Do not invent dialect syntax
until the data model and additive-only compatibility rules are documented.

Add persistence, source-edit, page-edit, keyboard, accessibility, and export
tests. Keep comments out of ordinary exported documents by default.
