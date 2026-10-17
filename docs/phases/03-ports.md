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

## Gate deltas (honest)

- The 12-format import smoke against real fixture files (classic
  `qa/convert-smoke.mjs` class) has not been re-run against the web door yet —
  CSV verified live; the rest ride the shared importer package whose 120 unit
  tests cover the parsers.
- PDF bench flows beyond open/paint (rewrite, whiteout, export bytes) are
  covered by the package port + classic `qa/pdfedit-smoke.mjs` against the
  single-file edition, not yet re-driven on `/pdf`.
