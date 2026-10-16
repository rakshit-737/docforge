# Phase 3 — Ports of entry and exit (record)

Landed inside the 2026-08-31 finishing sprint (`3d120ab`), earlier than the
master plan's sequencing because the Phase-1 packages made it cheap.

## Shipped

- **Imports** — one `importFile` door for docx, pdf, md/txt, html, csv/tsv,
  xlsx, pptx, epub, ipynb and images: the classic `htmlToMd` ported verbatim
  (`apps/web/lib/html-to-md.ts`, parity-harnessed against the classic closure),
  packages loaded lazily, import-only libraries (mammoth, pdf.js) as real npm
  dynamic imports satisfying the same globals the classic string-eval provided.
  Drag-drop overlay + widened Open dialog + clipboard-image smart paste.
  Imports apply undoably (the template snapshot mechanism).
- **PDF bench** — `/pdf`, its own route: the §3.2 armed-masthead bug designed
  out by construction. In-place editing through `@docforge/pdf-editor` (same-
  font line rewriting intact), bench tools, export from original bytes.
  Verified live: opens a real PDF and paints its pages.
- **Exports** — DOCX one-click through the packages (since stage 5); PDF via
  the pre-flighted print route; `.docforge.json` Zod-validated with the legacy
  `pageBorder` migration (since stage 4).

## Gate evidence and historical delta

The initial Phase-3 note said that the web import door and PDF bench had not yet
been re-run. That was true for the first `3d120ab` record, but it is no longer
current. The 2026-09-03 update in `docs/phases/02-appendix-a.md` re-drove all
12 import formats through the web Open door and re-drove the remaining `/pdf`
bench flows (rewrite, whiteout, free text, highlighter, image stamp, fallback
notice, and export bytes). The shared package tests and classic smoke suites
remain useful regression coverage; they are not substitutes for the web E2E
gate now committed under `apps/web/e2e/`.
