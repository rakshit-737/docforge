# Prompt 02 — add web-studio regression coverage

Work only on automated verification for `apps/web`. Do not redesign the UI or
change document semantics.

Create a focused Playwright suite for the Next.js studio covering:

- `/studio` boot.
- Source editing.
- Live editing on rendered pages.
- Caret and scroll restoration.
- Undo/redo.
- Templates.
- IndexedDB restore.
- Version history.
- DOCX export.
- Import flow.
- PDF bench route.
- Command palette and find/replace.
- Keyboard-only navigation.
- Mobile pane switching.
- Offline reload.
- Console errors and unexpected network requests.
- Axe accessibility checks.

Use deterministic fixtures and fresh browser profiles. Port existing useful
manual probes instead of duplicating business logic in tests.

Run the relevant unit, build, and E2E checks. Report untested surfaces rather
than pretending coverage is complete.
