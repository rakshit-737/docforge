# Repository Audit & Issues Log

This is the current, edition-aware status of the original repository audit. The
issue numbers below are the canonical ledger numbers used by `docs/ledger.md`
and the GitHub links. “Classic” means the frozen/single-file shell; “web” means
`apps/web`. A historical finding is retained only when it still reproduces on
one of those surfaces.

## Current summary

| ID | Title | Surface | Status | Current evidence |
|---|---|---|---|---|
| 2 | Toolbar keyboard navigation has too many stops | classic | Open | `src/index.html`, `src/js/main.js` |
| 3 | Classic selector options are too small | classic | Open | `src/app.css` |
| 4 | Classic `Ctrl+S` downloads instead of persisting | classic | Open; web fixed | `src/js/main.js`; `apps/web/lib/persistence.ts` |
| 5 | Classic zoom/Esc chrome differs | classic | Open; web fixed | `src/index.html`, `src/js/main.js`; `apps/web/components/zoom-cluster.tsx` |
| 6 | Classic editor lacks outdent/heading shortcuts | classic | Open; web fixed | `src/js/main.js`; `apps/web/lib/keymap.ts` |
| 7 | Classic template replacement is destructive | classic | Open; web fixed | `src/js/main.js`; `apps/web/components/templates-menu.tsx` |
| 8 | Classic find/replace lacks full search controls | classic | Open; web fixed | `src/js/main.js`; `apps/web/components/find-bar.tsx` |
| 9 | Browser print PDFs lack bookmarks | browser print | Open | CLI `--pdf` now emits an outline; browser route remains print-based |
| 10 | Full CSL citation engine is missing | both | Open; `apa7` interim | `packages/engine/src/render.ts`, `docs/DIALECT.md` |
| 11 | Classic vendored import path used eval strings | classic | Closed in web/Phase 1 | `docs/phases/01-monorepo-engine.md` |
| 12 | Content-derived HTML needs a sanitization boundary | hosted web | Mitigated and gated | `packages/engine/src/render.ts`; `apps/web/e2e/web-regression.mjs` |
| 13 | Classic document autosave uses localStorage | classic | Open; web fixed | `src/js/main.js`; `apps/web/lib/persistence.ts` |
| 14 | CI and QA evidence were incomplete | repository | Partially closed | `.github/workflows/ci.yml`, `apps/web/e2e`, `qa/golden/web-capture.mjs` |
| 15 | Mermaid diagrams are not implemented | both | Open; owner decision required | `docs/phases/06-waves.md` |
| 16 | Local-first/offline guarantees were under-documented | both | Closed | `README.md`, `docs/phases/05-platform.md` |

The original audit's IDs 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14,
15, 16 were not the ledger's GitHub issue IDs. This file intentionally follows
the ledger numbering now; no new issue should reuse the old shifted numbers.

## Details

### Issues 2–8 — classic interaction debt

The classic shell still carries the original toolbar, selector, save, zoom,
keyboard, template, and find/replace limitations. These are not claims about the
web studio. The web replacements are covered by the Phase-2 parity record and
the Playwright suite in `apps/web/e2e/`. Do not close the classic issues merely
because the web surface is fixed; do not describe them as web regressions.

- **#2 keyboard navigation:** the classic toolbar is a normal tab sequence
  (`src/index.html`); the web toolbar uses a roving group.
- **#3 option size:** `.tbsel` remains below the desired desktop size in the
  classic CSS; the web controls are separately styled.
- **#4 save:** classic `Ctrl+S` still creates a project download. Web `Ctrl+S`
  calls IndexedDB persistence and is tested without a download.
- **#5 zoom/Esc:** the classic chrome keeps its historical duplicate controls;
  web uses one shared `ZoomCluster` and closes its overlays consistently.
- **#6 shortcuts:** classic Tab/outdent and heading shortcuts remain; web
  CodeMirror covers `Shift+Tab` and `Ctrl+1/2/3`.
- **#7 templates:** classic replacement can lose settings and attachments;
  web snapshots the document and offers undo around a confirmed template load.
- **#8 find:** classic reports only a total and lacks the newer toggles; web
  has CodeMirror decorations, match position, case/regex/word options, and an
  undo-safe Replace All.

### Issue 9: browser print bookmarks

Chrome's print dialog cannot receive a document outline from CSS or the DOM, so
the browser PDF button remains honest about its limitation. The headless CLI
path (`packages/cli`, `--pdf`) is a separate direct-PDF implementation and now
writes outline/tagged output. A browser-side direct export is still future work.

### Issue 10: CSL and APA modes

The legacy `apa` formatter is intentionally the narrow heuristic behaviour and
does not suffix same-author/same-year works. The newer `apa7` mode assigns
deterministic `a`, `b`, `c` suffixes, and BibTeX/RIS/CSL-JSON import is already
implemented by `packages/importers`. The remaining issue is a full CSL processor
and style registry, not missing BibTeX or RIS parsing.

### Issue 11: vendored libraries

This was closed for the web path in Phase 1: the hosted app uses package imports
and native dynamic imports instead of executing vendored strings. The classic
single-file build has a separate packaging boundary; its offline gate remains
the relevant regression check. The old `src/js/file-import.js` and
`src/js/engine.js` line references are historical and must not be reused.

### Issue 12: hosted content security

The engine now sanitizes raw Markdown HTML before it is inserted into the
rendered document: executable elements, event-handler attributes, and
`javascript:`/`vbscript:`/unsafe data URLs are removed while the DocForge
dialect's generated markup remains intact. The hosted CSP deliberately still
contains `unsafe-inline` for Next bootstrap, React style attributes, and
Paged.js; it does not allow `unsafe-eval`. The web E2E suite asserts both the
sanitization result and the absence of page errors/network escapes.

### Issue 13: persistence editions

Classic `localStorage` autosave remains a known quota-limited limitation of the
forever edition. The web studio uses IndexedDB for documents, attachments, and
version history, with localStorage reserved for UI preferences. These are
different products and should not be combined in one ledger row.

### Issue 14: CI and QA evidence

The historical “no lint/CI” report is closed by current workflows. CI now uses
the root Turbo test graph, builds the web studio, runs the web Playwright suite
(including axe, offline reload, keyboard/mobile flows, import, PDF bench,
DOCX export, and security checks), and runs web parity against classic on
preview screenshots, print-PDF rasters, and DOCX members. Remaining quality
follow-up is explicit rather than hidden: Lighthouse, strict coverage
thresholds, and editor/bundle budgets are not yet enforced.

### Issue 15: Mermaid

Mermaid remains an unimplemented feature-wave item. It needs an owner decision
on the renderer/dependency and a parity specification before implementation.

### Issue 16: privacy documentation

Closed in the current README and Phase-5 record: the single-file edition works
from `file://` with network blocked, and the hosted studio is local-first with
IndexedDB persistence. Cloud sync is not part of the current product.

## Historical source notes

The Phase-0 snapshot in `docs/ledger.md` is preserved as history, but its
verdicts and line numbers are not current evidence. The old package names
`packages/export-pdf`, `packages/engine/src/citations.ts`, and
`src/js/engine.js` were removed or never existed in the current layout.
