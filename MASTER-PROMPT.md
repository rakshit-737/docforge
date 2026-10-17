# DocForge 2.0 — Master Rebuild Prompt

> **How to use this document.** Point an agentic coding assistant (Claude Code, Cursor, etc.) at this repository and give it this file. Do **not** ask it to do everything in one run. Work phase by phase (§6): paste the phase's section, let the agent plan, review the plan, let it execute, then check the phase gate together before moving on. Every phase ends with something working. The idea bank (§8) is a menu, not a to-do list — pull items into phases deliberately.

---

## 0. Mission

**You are** a senior product engineer working inside the DocForge repository.

**The product:** DocForge turns plain text into beautifully typeset PDFs and Word documents — cover pages, TOC with real page numbers, footnotes, citations, LaTeX equations, cross-references, tables, callouts — with live paginated preview, in-place PDF editing, and import from a dozen formats. Today it ships as one offline HTML file built from ~9,500 lines of hand-rolled vanilla JS.

**The mission:** rebuild it as a modern, credible, launchable product **without losing what makes it special**. Concretely:

1. **Modern stack** — Next.js 16 + React 19 + TypeScript 7 + Tailwind CSS 4, monorepo, real tests, CI (§4).
2. **Two shipping targets** — a hosted web app (installable PWA, works offline) **and** the single-file offline HTML edition, both built from the same core packages. The single-file build is a feature, not legacy — "no account, no server, yours forever" stays on the box.
3. **Local-first** — no accounts required, documents never leave the device by default. Cloud sync/share is an optional later phase (§6, Phase 7).
4. **Fix every known bug** (§3) and pass an accessibility bar the current app fails.
5. **Look designed, not generated.** The current chrome already has a real design language ("the copy desk", DESIGN.md). Evolve it; do not replace it with default-shadcn AI-slop (§7).
6. Serve three masters at once: a **portfolio showpiece** (clean architecture, tests, live demo, polished README), a **real product** students and professionals adopt, and the owner's **personal daily tool** for assignments and reports.

**The prime directive:** the *document output* is the product. During the entire port, rendered pages, exported PDFs and exported DOCX must stay pixel-faithful to the current build until a phase explicitly improves them. Golden-master tests (Phase 0) enforce this — "it looks about the same" is never acceptance.

---

## 1. What exists today (read before touching anything)

### 1.1 Repo map

```
src/index.html        584 lines   app chrome DOM
src/app.css         1,215 lines   chrome styling ("copy desk" theme, dark + light)
src/doc.css           458 lines   DOCUMENT styling — sacred, user-facing product surface
src/js/main.js      2,214 lines   all chrome behavior, bound by DOM ids (bindChrome())
src/js/engine.js    1,075 lines   markdown → paginated pages (marked + custom syntax + Paged.js)
src/js/docx-export.js 841 lines   .docx writer (docx lib, embedded fonts, OMML, TOC field)
src/js/mathml-omml.js 749 lines   KaTeX MathML → Word OMML converter (own work, MIT)
src/js/pdf-editor.js  887 lines   in-place PDF editing (pdf-lib + pdfjs, ToUnicode inversion)
src/js/pdf-import.js  420 lines   PDF → markdown heuristic reconstruction
src/js/live-edit.js   501 lines   edit-on-the-page: contenteditable galley ↔ markdown source sync
src/js/file-import.js 302 lines   docx/xlsx/pptx/epub/ipynb/csv/html/image importers
src/js/docx-import.js 112 lines   mammoth wrapper
src/js/docx-fonts.js  208 lines   font subsetting/embedding for .docx
build.mjs                         esbuild-based inliner → dist/DocForge.html (~6.7 MB, single file)
fonts/                            26 TTF cuts of 7 OFL families (Source Sans/Serif/Code, Inter,
                                  Montserrat, EB Garamond, Crimson Pro)
qa/*.mjs                          headless Playwright harness driving the real UI by selector ids
                                  (smoke, deep, borders, import-smoke, manuscript-smoke, cmdk-smoke,
                                  convert-smoke, visual contact sheets, uishot)
DESIGN.md                         full design system: "the copy desk" — tokens, components, motion,
                                  hard rules
PRODUCT.md                        audience, jobs, brand commitment, constraints
docs/UI-REDESIGN-PROMPT.md        earlier chrome-redesign brief + AI-slop diagnosis
docs/TYPOGRAPHIC-AUDIT.md         typography audit
.github/workflows/pages.yml       GitHub Pages deploy
```

Dependencies: `marked`, `pagedjs`, `docx`, `katex`, `highlight.js`, `mammoth`, `pdf-lib`, `pdfjs-dist`, `esbuild`, `playwright-core`. Import libraries are inlined **as string constants and eval'd on first use** to keep startup fast — a hack to replace (§3.4).

### 1.2 Architecture in one paragraph

Vanilla JS, no framework, no TypeScript, no bundler config beyond a custom `build.mjs` that inlines every script, style, font (base64) and vendored library into one `dist/DocForge.html`. Modules are IIFEs communicating through globals and DOM ids; `main.js` binds ~80 load-bearing selector ids that the QA harness also drives. State lives in module-scope objects + `localStorage` autosave + `.docforge.json` project files. Rendering: markdown → marked with heavy custom extensions → HTML → Paged.js pagination → live preview; PDF export = browser print dialog; DOCX export = independent renderer sharing the same font bytes.

### 1.3 The custom markdown dialect (must survive verbatim — Appendix B)

Headings with `{#sec:name}` labels · `++u++` · `~~strike~~` · `==mark==` / `=={green}mark==` · `~sub~` / `^sup^` · span attributes `[text]{color=#c00 bg=#ffe28a size=14 font="Georgia" u sc caps}` · alignment blocks `:::center…:::` · tables with `[table: caption | #tbl:name]` · `[screenshot: caption | w:60% | noborder | #fig:name]` · footnotes `[^1]` · citations `[@key]`, `[@key]: entry`, `[references]`, numeric or author–year style, locators `[@key, p. 33]` · cross-refs `[#fig:x]` `[#tbl:x]` `[#sec:x]` · `$…$` / `$$…$$` KaTeX · fenced code with highlighting · `[toc]` `[lof]` `[lot]` `[pagebreak]` · callouts `:::note/tip/warning/important` · four themes × accent colour × A4/Letter × margins × page borders (7 styles × 3 weights × ink/accent).

### 1.4 Status of the working tree

The repo has **uncommitted changes** (README, build.mjs, src/*, qa/*, rebuilt dist). Phase 0 starts by committing this WIP as the baseline — nothing gets rebuilt from a dirty tree. Also present: droppings from earlier AI tooling (`.impeccable/`, `.opencode/`, `.superbrain/`, `qa/out/` binaries committed to git) — cleaned up in Phase 0.

---

## 2. What is genuinely good (keep, port, protect)

Do not flatten these in the rewrite — they are the moat, and most rewrites die by discarding them:

1. **DOCX/PDF twin-export parity** — the same embedded font bytes serve preview, PDF and .docx, so both exports look like the same document anywhere. Nobody else's markdown tool does this well.
2. **The MathML→OMML converter** (`mathml-omml.js`) — real editable Word equations, not images. Extract as its own published package; it is independently valuable.
3. **In-place PDF editing with original-font rewriting** — inverting the ToUnicode map to write glyph codes through the page's own font resource is a legitimately hard, differentiated feature.
4. **Live editing on paginated pages** — caret-preserving recompose, view re-anchoring, one undo history across panes.
5. **Offline import of a dozen formats** using the browser's own zip machinery (docx/xlsx/pptx/epub read without shipping extra libs).
6. **The copy-desk design language** — PRODUCT.md brand commitment + DESIGN.md tokens/motion/hard-rules. The 2026-08-14 design review scored it 31/40 ("authored-for-this-product, no unrelated product ships this chrome unchanged"). Evolve, never genericize.
7. **The QA harness idea** — headless Playwright driving the real UI, visual contact sheets, cross-format torture documents. Port it to a first-class test suite.
8. **Honest docs** — README's "Known limitations" section tells the truth. Keep that voice everywhere.
9. **Templates as working specimens** — each template ships live citations, captioned tables, cross-references, not bare skeletons.
10. **Status honesty** — autosave stamp, composing ticker, per-button spinners; the review's words: "nothing lies."

---

## 3. The bug & debt ledger (all of it gets fixed)

Sources: the 2026-08-14 design review in `.impeccable/critique/`, README "Known limitations", `docs/UI-REDESIGN-PROMPT.md`, and direct code inspection. Several redesign commits landed *after* some of these were filed — **re-verify each against the current build first**, then fix what still reproduces. Track this ledger as issues; close each with a test that would have caught it.

### 3.1 Accessibility (currently fails keyboard and screen-reader users — P1)

- Layout toggles use `.toggle input { display:none }` — all seven checkboxes are removed from tab order and the accessibility tree; accent swatches and colour-grid cells are unfocusable `div`s. A keyboard user **cannot enable a cover page or page numbers**. Fix: visually-hidden checkbox pattern, swatches become `<button aria-label aria-pressed>`.
- Modals are plain `div`s: no `role="dialog"`, no `aria-modal`, no focus containment — Tab walks the background behind the scrim, including under the confirm dialog that guards destructive actions.
- No `aria-live` on page info or find count; the busy indicator is `aria-hidden` with no textual equivalent — rendering is silent to a screen reader.
- ~42 tab stops from page top to the editor; toolbar needs `role="toolbar"` + roving tabindex.
- Contrast misses: kbd hint text at 4.3:1 (needs 4.5:1); 11.5 px native `option` text.
- Target for the rebuild: **WCAG 2.2 AA**, axe-clean in CI, full keyboard map documented in Help.

### 3.2 Interaction bugs

- **Replace All destroys undo** — it assigns `editor.value` wholesale, wiping the native undo stack (the bulk operation most likely to go wrong is the one that can't be undone). Fix pattern: `setRangeText`, plus toast "Replaced 14 — Ctrl+Z undoes."
- **Toolbar tools silently vanish** at 1180–1500 px widths — rows clip with `scrollbar-width:none` and no affordance (measured scrollWidth 552/586 vs clientWidth 468). Students on 1366×768 conclude the tool doesn't exist. Needs a visible overflow strategy.
- **PDF-bench mode leaves the studio masthead armed** — loading a template there silently replaces the hidden studio document; Settings clicks do nothing.
- **Ctrl+S downloads a fresh file on every press** — a save-habituated user fills Downloads by lunch. Rebuild: Ctrl+S = local persist; explicit export actions produce files (File System Access API makes true in-place save possible — §8.5).
- Find says "2 found", never "2 of 14"; no case/regex/whole-word toggles; matches not highlighted in the editor.
- Esc closes overlays and the find bar but not the Templates menu; zoom controls exist twice in two styles.
- Tab indents but Shift+Tab doesn't outdent; no Ctrl+1/2/3 heading shortcuts.
- Template switching is a destructive replace behind a confirm — should be undoable and/or open in a new tab/document (multi-document model, §8.1).

### 3.3 Product-level limitations (fix the fixable, keep documenting the rest)

- **Printed PDFs have no outline/bookmarks** — Chrome's Save-as-PDF dialog can't emit one. The rebuild should add a **direct PDF export path** that doesn't route through the print dialog (§8.4) — this also unlocks one-click export, embedded metadata and PDF/A ambitions.
- Word vs PDF page totals can drift by a page or two on long documents (two layout engines) — document honestly; consider a "match Word pagination" best-effort mode later.
- APA author–year labels don't disambiguate two works by the same author in the same year — solved properly by real CSL citations (§8.3).
- PDF import flattens tables and multi-column layouts; scanned PDFs need OCR (§8.4 adds it).
- Rewritten PDF lines leave original characters in the hidden text layer — true redaction is a listed feature idea (§8.4), until then keep the honest warning.

### 3.4 Engineering debt (the rebuild's raison d'être)

- **No TypeScript, no framework, no unit tests** — 9.5k lines of IIFEs wired through ~80 load-bearing DOM ids; `main.js` alone is 2,214 lines mixing state, DOM, and business logic. The QA harness smoke-tests flows but nothing tests the parser, exporters or importers in isolation.
- **Vendored libraries as eval'd string constants** — replace with real lazy-loaded ES modules / dynamic `import()` chunks; `eval` also blocks any sane CSP.
- **`innerHTML` sinks without sanitization** (~24 in main.js, 11 in engine.js) while the app renders pasted web content, imported HTML and attribute-carrying spans. Threat-model it: add DOMPurify (or equivalent) at every markdown→DOM boundary, plus a strict CSP on the hosted app. An offline single-file app has a small attack surface, but a hosted one does not.
- `localStorage` for autosave — fine for settings; documents belong in IndexedDB (quota, structured data, multi-document, version history §8.1).
- Committed build artifacts and binary QA output (`dist/`, `qa/out/` PNGs/PDFs) bloat the repo; AI-tool droppings (`.impeccable/`, `.opencode/`, `.superbrain/`) belong in `.gitignore`.
- No CI beyond Pages deploy: no lint, typecheck, test, or build verification on push.

---

## 4. Target stack (verified current as of August 2026)

| Layer | Choice | Why |
|---|---|---|
| Framework | **Next.js 16.3** (App Router, Turbopack) | Current release (Aug 3, 2026). Enable `cacheComponents` + `partialPrefetching` (Instant Navigations); `experimental.useOffline` is directly relevant to a local-first app. Static-exportable marketing pages + the studio as a client-heavy route. |
| UI | **React 19.x** | Pairs with Next 16; enable the React Compiler (Rust port is experimental — adopt when stable). |
| Language | **TypeScript 7** | The 10× native compiler shipped July 2026. If any tool in the chain lags, pin 5.9 and revisit — don't fight the ecosystem. |
| Styling | **Tailwind CSS 4.3.x** | CSS-first config; encode the copy-desk tokens as `@theme` variables so DESIGN.md becomes executable. |
| Components | **Radix primitives / Base UI, custom-skinned** | Accessible dialogs/menus/toolbars solve §3.1 for free. **Do not ship default shadcn styling** — install headless, apply copy-desk skin (§7). |
| Source editor | **CodeMirror 6** | Replaces the raw `<textarea>`: markdown syntax highlight, decorations for find-matches, multiple cursors, proper undo, folding, keymaps. |
| State | **Zustand** (+ Immer) | Small, testable stores; no context spaghetti. Document model itself lives in the core package, not React state. |
| Persistence | **IndexedDB via `idb`** + Zod-validated `.docforge.json` | Multi-document, snapshots/history, quota headroom. Zod schema = the project-file contract, versioned with migrations. |
| Markdown | **Keep `marked` + port the custom extensions 1:1** | Lowest-risk parity path. Evaluate a later migration to remark/micromark (cleaner AST for the dialect) only after golden tests exist to guarantee output equivalence. |
| Pagination | **Paged.js** (current 0.4.x line) | Still the only serious in-browser pagination engine; the expertise is already in `engine.js`. |
| Exporters | `docx` 9.x · `pdf-lib` · `pdfjs-dist` 6.x · KaTeX 0.18 · highlight.js 11 · mammoth | Keep — they work. Note: `pdf-lib` is dormant upstream; if it blocks a feature, the maintained `@cantoo/pdf-lib` fork is drop-in. |
| Monorepo | **pnpm workspaces + Turborepo** | Packages below; remote caching free on Vercel. |
| Lint/format | **Biome** | One fast tool for lint+format; add `eslint-plugin-jsx-a11y`-equivalent rules via Biome's a11y ruleset. |
| Tests | **Vitest** (unit) + **Playwright** (e2e + visual regression) | Port `qa/*.mjs` into `apps/web/e2e`. Next 16.3 ships an `instant()` Playwright helper for navigation regressions. |
| PWA | **Serwist** service worker | Full offline for the hosted studio; precache fonts + vendor chunks. |
| Single-file build | **Vite + `vite-plugin-singlefile`** | Builds `packages/*` + a thin vanilla/React shell into `DocForge.html`, preserving the forever-edition. |
| Deploy | **Vercel** (app) + GitHub Pages (single-file + docs) | Preview deploys per PR; Pages keeps the free-forever artifact. |
| Node | **Node 24 LTS**, pinned via `.nvmrc` + `packageManager` field | |

### 4.1 Monorepo layout

```
docforge/
├─ apps/
│  ├─ web/            Next.js 16 — landing, docs, and the Studio (client-heavy route, PWA)
│  └─ single-file/    Vite build → dist/DocForge.html (same core, minimal shell)
├─ packages/
│  ├─ engine/         parse: dialect → typed Document AST (pure TS, zero DOM where possible)
│  ├─ render/         AST → HTML + Paged.js pagination glue + doc.css themes
│  ├─ export-docx/    AST → .docx (docx lib, fonts, TOC field, footnotes)
│  ├─ export-pdf/     print-route today; direct-PDF path when built (§8.4)
│  ├─ mathml-omml/    the converter, published to npm as `@docforge/mathml-omml`
│  ├─ importers/      docx/pdf/xlsx/pptx/epub/ipynb/csv/html/image → dialect markdown
│  ├─ pdf-editor/     the in-place PDF bench logic
│  ├─ fonts/          subset TTFs + licensing + font metadata
│  └─ config/         shared tsconfig/biome/tailwind preset (copy-desk tokens)
└─ tooling: turbo.json, pnpm-workspace.yaml, .github/workflows/ci.yml
```

The test of the architecture: **`packages/*` must run in Node with no browser** (except render/pdf-editor internals), which is what makes the CLI (§8.5), the npm packages, and real unit tests possible. If engine code needs `document`, that's a design smell — fix the boundary.

### 4.2 Alternatives considered (so nobody relitigates)

- *Vite SPA without Next.js*: viable, but loses the landing/docs/SEO/PWA scaffolding and Vercel preview flow the product goals need. Next's static export covers the "it's really just a client app" concern.
- *SvelteKit/Solid*: fine tech, wrong for a portfolio the industry reads; React remains the lingua franca.
- *Keep vanilla JS and just add tests*: preserves the bugs' habitat; 80 load-bearing DOM ids is the disease, not the patient.
- *Electron*: no. If a desktop shell is ever wanted, Tauri v2 (§8.5) — but PWA + single-file covers 95%.

---

## 5. Non-negotiables (print these above the desk)

1. **Output parity until deliberately improved.** Golden-master corpus (Phase 0) gates every merge that touches engine/render/exporters.
2. **`doc.css` and the document dialect are product surface.** No "cleanups" that change rendered output or break existing users' documents. Dialect changes are additive only.
3. **Local-first, offline-first.** The studio works with the network cable cut. No account walls, no telemetry in the single-file build, privacy-respecting analytics (if any) on the hosted app only, disclosed.
4. **The single-file edition ships every release** — truly single file: no CDN, no runtime fetches, works from `file://`.
5. **Accessibility is a gate, not a phase** — axe-clean + keyboard-complete from Phase 2 onward.
6. **Honest UX** — keep the README's truth-telling voice; failure states name causes; nothing lies about save state.
7. **Fonts stay OFL-licensed with licence texts shipped**; user-uploaded fonts (§8.2) never leave the device.
8. **No default-theme component dumps.** Any UI that could be mistaken for a shadcn demo fails review (§7).
9. **Performance budgets** (§9.3) are CI-enforced, not aspirations.
10. **The agent asks before**: deleting files, changing the dialect, altering export output, adding dependencies >100 KB gzipped, or any scope not in the current phase.

---

## 6. The plan — nine phases, each with a gate

Rules of engagement: one phase per working session (or few). The agent opens each phase by writing a short plan into `docs/phases/NN-<name>.md`, gets it approved, executes, then demonstrates the gate. A phase is done when its gate passes in CI, not when the code is written.

### Phase 0 — Baseline & safety net *(no rebuild until this is green)*

- Commit the current WIP; tag `v1-classic`. The old app remains buildable and deployed at `/classic` for the whole migration.
- Repo hygiene: `.gitignore` for `dist/`, `qa/out/`, `.impeccable/`, `.opencode/`, `.superbrain/`; move Pages deploy to build-in-CI instead of committed dist.
- **Build the golden corpus**: 15–25 torture documents exercising every dialect feature (Appendix B), every theme × paper × margin × border combination that matters, plus the existing `qa/` fixtures. For each: freeze (a) rendered page screenshots, (b) exported PDF rasterized per page, (c) exported .docx unzipped with normalized `document.xml`. Store hashes + images as the **golden baseline** and stand up the comparison runner in CI.
- Re-verify every §3 ledger item against the current build; open a tracking issue per confirmed bug.
- **Gate:** CI runs the golden comparison against `v1-classic` and passes trivially; ledger triaged.

### Phase 1 — Monorepo + engine extraction *(pure refactor, zero UI change)*

- Scaffold the §4.1 monorepo (pnpm, Turborepo, Biome, Vitest, CI skeleton).
- Port `engine.js` → `packages/engine` + `packages/render` in TypeScript: the dialect parser produces a **typed Document AST** (nodes for section/heading/para/table/figure/equation/footnote/citation/callout/…), then render walks it. Type the whole dialect — this AST is the contract everything else consumes.
- Port `mathml-omml.js`, `docx-export.js`, importers, `pdf-editor.js` into their packages. Vendored-string eval dies here; dynamic `import()` replaces it.
- Unit tests as you go: parser table-driven tests per dialect feature; exporter golden-file tests.
- Rewire the *existing* vanilla shell to consume the packages (thin adapter), rebuild single-file from it.
- **Gate:** golden corpus passes bit-identical (or reviewed-and-accepted diffs, e.g. whitespace in XML); unit coverage ≥80% on engine/exporters; `pnpm build` produces a working single-file edition.

### Phase 2 — The Studio in Next.js *(the app rebuild)*

- `apps/web`: Next.js 16.3, Tailwind 4 with copy-desk `@theme` tokens, Studio route mounting: CodeMirror 6 source pane · paginated preview (from `packages/render`) · toolbar · settings · command palette · find/replace · outline · templates · statusbar.
- State: Zustand stores (document, ui, settings); persistence to IndexedDB with autosave + crash recovery ("Restore unsaved changes?").
- Rebuild every §3.1/§3.2 interaction correctly this time: Radix dialogs (focus-trapped), toolbar with visible overflow menu, find with match counts + highlighting + case/regex toggles, undo-safe replace-all, Ctrl+S = persist, Esc consistency, Shift+Tab outdent, Ctrl+1/2/3 headings.
- Port live-edit (edit-on-the-page) — the hardest piece; budget real time, keep its caret-anchoring behavior.
- PWA (Serwist): full offline after first load; installable; offline banner via `useOffline`.
- **Gate:** feature-parity checklist (Appendix A) fully checked; golden corpus passes against the new render path; axe-clean; keyboard-only walkthrough recorded; Lighthouse PWA installable.

### Phase 3 — Ports of entry and exit *(imports, exports, PDF bench at parity)*

- Wire all importers with drag-drop + Open into the new shell; PDF bench (in-place editor) as its own route/mode with the §3.2 masthead bug designed out.
- Exports: DOCX one-click; PDF via print route with pre-flighted margins/headers.
- Project files: Zod-validated open/save with migration from every historical `.docforge.json` shape.
- **Gate:** import smoke suite green on all 12 formats; export golden tests green; a `v1` project file opens perfectly.

### Phase 4 — Design elevation *(make it look like someone's taste)*

- Execute §7 across landing + studio: token discipline, staged preview ("the paper is the star"), motion grammar, empty states, onboarding.
- Full pass with the §3.1 a11y bar; reduced-motion respected globally.
- **Gate:** side-by-side before/after shots reviewed; §7 checklist signed; no default-styled component visible anywhere.

### Phase 5 — Platform & distribution

- Single-file edition rebuilt from the same packages (`apps/single-file`), released as a GitHub Release artifact on every tag.
- File System Access API: open/save real `.md`/`.docforge.json` in place where supported; graceful download fallback.
- **CLI**: `npx @docforge/cli build report.md --pdf --docx --theme executive` — the proof the core is truly headless, and a CI-friendly document pipeline (people will star this alone).
- Publish `@docforge/engine` and `@docforge/mathml-omml` to npm with READMEs.
- **Gate:** single-file works from `file://` with network blocked (automated Playwright check); CLI builds the golden corpus headlessly; packages published.

### Phase 6 — Feature waves *(pull from §8, in this default order)*

Wave 1 (student-value): real CSL citations + BibTeX import (§8.3) · Mermaid diagrams (§8.2) · custom font upload (§8.2) · version history (§8.1) · direct PDF export spike (§8.4).
Wave 2 (power): multi-document tabs (§8.1) · PDF toolbox (§8.4) · OCR (§8.4) · charts (§8.2) · track-changes-style suggestions (§8.1).
Wave 3 (reach): AI assist behind BYO-key (§8.6) · EPUB/HTML export (§8.4) · template gallery (§8.7).
- **Gate per feature:** spec note → tests → docs page → golden corpus still green.

### Phase 7 — Cloud, optional and additive *(only after 0–5 are solid)*

- Supabase: auth (email/OAuth), encrypted project sync, share-a-link (read-only rendered doc with clean URL), later Yjs CRDT co-editing over Supabase Realtime with y-indexeddb offline queue.
- Strictly additive: signed-out experience loses nothing; local remains the source of truth (sync = replication, not custody).
- **Gate:** all features degrade cleanly offline/signed-out; RLS policies reviewed; a shared link renders without JS-required account prompts.

### Phase 8 — Launch quality

- Landing page with live playground iframe, template gallery, honest feature grid, demo GIF/video; docs site (guides: "Your first assignment", dialect reference, CLI, self-hosting); SEO + OG images; privacy page that brags about local-first.
- README rewritten for the monorepo with architecture diagram; CONTRIBUTING; issue templates; MIT license retained; changelog + release workflow (changesets).
- Plausible/Umami analytics on hosted only; feedback link; GitHub Discussions on.
- **Gate:** Lighthouse ≥95 across the board on landing + studio; a stranger can go from landing → exported .docx in under 3 minutes without help.

---

## 7. Design charter — why it won't look AI-generated

The failure mode to avoid has a known shape (catalogued in `docs/UI-REDESIGN-PROMPT.md` from this very repo's earlier life): identical button pills in a row · a 30-control toolbar wall with three icon languages · borders as the only structure over three near-identical greys · four competing letterspaced-uppercase micro-label styles · emoji as icons · padding/radius value sprawl · settings as a 20-field form dump · zero motion, then sudden `display:none→block` · native `title` tooltips. **Audit every new surface against that list before review.**

Positive charter:

1. **Identity: the copy desk, matured.** PRODUCT.md's brand commitment stands — chrome as a newspaper composing room at edition time: newsprint-white day desk / authored slate night shift, structural ink rules, the DocForge Serif nameplate on a double rule, one grease-pencil red spent only on TO-PRESS/proof-marks/focus, teletype-mono instrumentation, square corners. DESIGN.md's tokens, shadow vocabulary, motion grammar and Hard Rules carry over into Tailwind `@theme` — the design system doc becomes code.
2. **Hierarchy answers "what do I click first."** Export (the product of the whole app) reads as *the* action; everything else recedes. One icon language (single stroke width, one grid), drawn or from one set — never mixed, never emoji.
3. **A real scale.** One spacing scale, one radius scale, one type ramp with an actual display size (the serif nameplate gets to be big somewhere). If a value isn't a token, it doesn't ship.
4. **Depth without borders.** Surfaces separate by elevation and tone; the 1px-line wireframe look is banned except where a rule *means* something (it's a print metaphor — rules are content, use them deliberately).
5. **The paper is the star.** The preview deck is staged like proofs on a stone: generous ground, lamp-warm vignette, page cards with the existing shadow stack; page furniture (folio readout, zoom) composed as instrumentation, not scattered text.
6. **Motion is the press showing its work.** Settling proofs, composing ticker, stamp autosave — 150–250ms, eased, and every animation dies under `prefers-reduced-motion`.
7. **Designed states everywhere:** empty (a blank sheet with three verbs), loading (typesetting), error (proof slip naming the cause), first-run (60-second guided tour) — no dead ends, no lorem.
8. **Landing page is typography-forward** — it sells typesetting, so it must *be* typeset: specimen-style hero, live before/after, real exported documents as proof. No stock gradients, no floating 3D blobs, no "Trusted by" logo rows of companies that don't exist.

---

## 8. The idea bank — every feature worth building

Tiers: ★ = high value / achievable · ◆ = differentiating / harder · ▲ = spike first (feasibility unproven). Pull into Phase 6 waves deliberately; never start an idea without a one-page spec note.

### 8.1 Writing & editing

- ★ **Multi-document workspace** — tabs/sidebar of documents in IndexedDB; templates open as new docs (kills the destructive-replace bug class for good).
- ★ **Version history** — automatic local snapshots on idle + manual checkpoints; timeline UI with visual diff (rendered and source) and one-click restore. "Your work is never lost" is a headline feature for the deadline-pressure audience.
- ★ **Slash commands** — `/table 3x4`, `/figure`, `/equation`, `/callout`, `/citation` inserting correct dialect; the command palette's little sibling, discoverable by typing.
- ★ **Editor upgrades via CodeMirror 6** — markdown highlighting, section folding, multiple cursors, smart lists (Enter continues, Tab/Shift+Tab nest), table cell navigation, drag-reorder in the outline panel that rewrites the source.
- ★ **Smart paste** — Excel/Sheets range → dialect table; image → attached captioned figure; URL on selection → link; Word/HTML already handled, keep it.
- ★ **Focus & flow** — typewriter scrolling, session word-count goal with a quiet progress tick, per-document stats (words, figures, reading time).
- ◆ **Margin comments** — annotations anchored to blocks, shown in a gutter, **never printed**; exportable as a review sheet. Foundation for cloud review later.
- ◆ **Suggested edits mode** — track-changes-style ins/del marks in the dialect (`{++ins++}` / `{--del--}` critic-markup), accept/reject UI, exported as real Word tracked changes. Word users will feel at home.
- ◆ **Snippets & variables** — user-defined snippets; document variables (`{{author}}`, `{{course}}`) filled from front-matter and reused across templates.
- ▲ **Local grammar/style linting** — retext/write-good class checks (passive voice, long sentences) offline; LanguageTool via self-host URL as opt-in.

### 8.2 Typography & document features

- ★ **Custom font upload** — user TTF/OTF/WOFF2, subset in-browser (harfbuzzjs/fontkit), embedded in preview + PDF + DOCX exactly like the built-ins. No competitor does this end-to-end.
- ★ **Theme designer** — the four themes become editable: token panel (faces, sizes, spacing, accent, heading style) with live preview; themes save/share as JSON; "derive from this document" starter.
- ★ **Mermaid diagrams** — ```` ```mermaid ```` fences rendered to SVG in preview/PDF and embedded as images in DOCX (with source preserved in alt text).
- ★ **Numbered headings** toggle (1 / 1.1 / 1.1.1) flowing into TOC and cross-refs; appendix numbering (A, B); per-section page-number restart where Word allows.
- ★ **Headers/footers editor** — per-document running header/footer content (title/author/date/page tokens), different first page, different odd/even.
- ★ **Watermarks & letterhead** — DRAFT/CONFIDENTIAL diagonal watermark; logo upload placed in header; both formats.
- ◆ **Charts from data** — ```` ```chart ```` fence with CSV/JSON + a small spec (bar/line/pie/scatter) → clean print-safe SVG in both exports; paste-CSV-get-chart flow. (Follow the repo's dataviz discipline: one accent, ink axes, no chartjunk.)
- ◆ **Visual table editor** — click a table in the preview: add/remove rows/cols, resize columns (writing back `:---:` widths), header toggle; merged cells where DOCX supports them.
- ◆ **Equation palette** — searchable symbol/structure picker that inserts KaTeX, with live preview; students shouldn't need to know `\frac`.
- ◆ **Line numbering** (legal/academic), **multi-column sections**, landscape pages for wide tables — all with DOCX equivalents.
- ▲ **Index generation** (`[index]` + `{^term}` markers) and glossary support.

### 8.3 Citations, done properly

- ★ **CSL engine** — swap the hand-rolled APA/IEEE approximations for citeproc-js + real CSL styles (APA 7, IEEE, MLA 9, Chicago, Harvard, Vancouver, + style picker over the 10k CSL registry). This single feature makes DocForge citable-in-anger for real coursework.
- ★ **BibTeX / CSL-JSON / RIS import** — drop a `.bib` from Zotero/Mendeley; entries become `[@key]`-addressable; unused entries flagged.
- ★ **DOI/ISBN/URL lookup** (hosted app; graceful offline fallback) — paste a DOI, get the formatted entry via Crossref/OpenLibrary.
- ◆ **Zotero live bridge** — Better-BibTeX auto-export watching, or the Zotero connector protocol locally.
- ◆ Citation health lint: undefined keys, uncited entries, year/author mismatches, duplicate entries.

### 8.4 Import, export & the PDF bench

- ★ **PDF toolbox** — merge, split, reorder, rotate, delete pages, compress, page-number stamping — all client-side with pdf-lib; the bench grows into a suite that earns daily-tool status by itself.
- ★ **OCR for scanned PDFs** — tesseract.js (WASM, offline) with language packs on demand; feeds both PDF-import and a "make searchable" bench action.
- ★ **Direct PDF export** (spike first ▲, then likely ★) — generate the PDF without the print dialog: render pages via Paged.js, then print through a headless-quality path (e.g. `window.print()` replaced by a canvas/PDF assembly, or Typst/WeasyPrint-class engine compiled to WASM as a second backend). Unlocks: outline/bookmarks (fixing the top known limitation), document metadata, PDF/A ambitions, one-click export. Timebox the spike; ship only if parity is provable.
- ★ **More export targets** — styled standalone HTML (self-contained, shareable), EPUB, plain LaTeX (the dialect maps cleanly), and "Slides from headings" → PPTX outline export.
- ◆ **True redaction** on the bench — actually remove glyphs + text-layer entries under the black box (the README currently warns it's cosmetic; make the warning obsolete).
- ◆ **PDF form filling & flattening**; signature placement (draw/type/upload image) — "sign and send back" is a weekly student/professional job.
- ◆ **Batch convert** — drop 20 files, get 20 markdown/PDF/DOCX outputs (queue UI; CLI parity).
- ▲ **Tagged (accessible) PDF** output — hard, rare, and a differentiator worth a spike.

### 8.5 Platform & developer surface

- ★ **File System Access** — open/save in place, recent files, autosave-to-folder option; the app starts feeling native.
- ★ **`@docforge/cli`** — `docforge build thesis.md --pdf --docx --theme academic --csl apa.csl`; watch mode; CI-friendly (GitHub Action example in docs). Proof of headless core + a genuinely useful tool.
- ★ **Public packages** — `@docforge/engine`, `@docforge/mathml-omml` on npm; the OMML converter alone will draw users (nothing good exists for MathML→OMML in JS).
- ★ **Share target / open-with** — installable PWA registers as a handler for `.md`/`.docx`; Android share-to-DocForge.
- ◆ **Tauri v2 desktop app** — menu bar, file associations (`.docforge`), auto-update; only if demand appears — PWA + single-file already cover the story.
- ◆ **Plugin API** — dialect extensions and export hooks as sandboxed plugins; the theme JSON (§8.2) is the first "plugin" format.

### 8.6 AI, opt-in and honest (never required, never default-on)

Positioning: DocForge's soul is "no account, no server, yours forever" — so AI is a **drawer, not the desk**: BYO API key (Anthropic/OpenAI) or fully-local WebGPU models (transformers.js class) for the privacy story; every AI feature works on selected text, shows a diff, and is undoable.

- ★ **Format this mess** — paste raw notes/lecture transcript → structured dialect document (headings, lists, tables inferred). The killer onboarding demo.
- ★ **Writing actions** — rewrite/tighten/expand/fix-grammar/change-tone on selection, rendered as a reviewable diff, never auto-applied.
- ★ **Template intake** — "3rd-year networks lab report, 5 experiments, IEEE citations" → filled skeleton with correct sections and placeholder figures.
- ◆ **Table & figure assist** — screenshot of a table → dialect table (local OCR + AI cleanup); auto alt-text suggestions for figures (a11y win).
- ◆ **Summarize/abstract generator** grounded strictly in the document; citation-suggestion search (hosted, clearly sourced).
- ▲ **Local-only assistant** — small on-device model for grammar/rewrite so the AI drawer works air-gapped too.

### 8.7 Product, growth & community

- ★ **Template gallery** — first-party set expanded (thesis, IEEE paper, resume/CV, cover letter, meeting minutes, invoice, lab report, SOP); community templates as reviewed JSON submissions; every template opens as a live specimen.
- ★ **Interactive playground on the landing page** — the real studio seeded with a demo doc; "export this now" as the CTA.
- ★ **Docs site** — dialect reference (generated from the parser's own tables so it can't drift), guides, CLI docs, FAQ, self-hosting.
- ★ **Launch collateral** — demo video/GIFs, OG images per template, Show HN / r/webdev / Product Hunt posts drafted honestly.
- ◆ **"DocForge Pages"** (cloud phase) — publish a doc to a clean URL with the same typography; unlisted by default.
- ◆ **Classroom kit** — a teacher shares a template link; submissions export with a standard cover; no accounts required for students.
- Monetization, only if ever needed: cloud sync/pages as a modest Pro tier; everything local stays free forever. Never ads, never data.

---

## 9. Quality system

### 9.1 Test pyramid

- **Unit (Vitest)**: parser (table-driven per dialect feature), AST invariants, exporters against golden files, importers on fixture corpus, citation engine, mathml-omml (port its edge-case list into cases).
- **Integration**: import→edit→export round-trips (docx→dialect→docx preserves structure); project-file migrations.
- **E2E (Playwright)**: the ported `qa/` flows — first-run, templates, settings, find/replace, live-edit, PDF bench, exports; keyboard-only variants of each critical flow.
- **Visual regression**: golden corpus page screenshots diffed per PR (threshold ~0.1%); UI chrome screenshots per theme × viewport (1366, 1560, mobile).
- **Export validation**: exported .docx unzipped + schema-checked + opened-in-Word smoke (keep the existing Windows Word job as an optional lane); exported PDF parsed (page count, fonts embedded, text extractable).
- **A11y**: axe on every route/state in CI; a manual screen-reader script per release.

### 9.2 CI (GitHub Actions)

`lint → typecheck → unit → build (web + single-file) → e2e + visual → axe → size-report → deploy previews`. Merge blocks on all of it. Release tags: build single-file artifact, publish npm packages (changesets), deploy production, attach artifact to GitHub Release.

### 9.3 Budgets (enforced, with a size-report bot on PRs)

- Studio route JS < 300 KB gzipped before lazy chunks; importers/exporters/OCR/AI all lazy.
- Single-file edition ≤ 7 MB (fonts dominate; subset aggressively).
- Editor input latency p95 < 16 ms on a 100-page document; full repagination < 2 s on the 100-page golden doc (mid-range laptop).
- Lighthouse ≥ 95 performance/a11y/best-practices/SEO on landing; studio TTI < 3 s cold, < 1 s repeat (PWA cache).
- Zero console errors/warnings in any golden-corpus run.

### 9.4 Security

- DOMPurify (or equivalent) at every markdown→DOM sink; strict CSP on hosted app (no `unsafe-eval` — the string-eval hack must already be gone); dependency audit + Renovate; sandboxed iframe for the landing playground; fonts and user files never uploaded anywhere in local mode (verifiable in the network tab — say so in docs).

---

## 10. Working agreements for the executing agent

1. **Plan first, per phase** — written to `docs/phases/`, approved before code.
2. **Read before editing**; never regenerate a file you haven't read. Respect DESIGN.md and PRODUCT.md as standing law unless a phase amends them.
3. **Small commits, honest messages** — imperative subject, body says why; no "fix stuff".
4. **Screenshot-driven UI work** — before/after images accompany every visual PR; look at them yourself before claiming improvement.
5. **Never claim parity — prove it.** Golden tests green or the phase isn't done. If output must change, show the diff and get sign-off.
6. **Ask when off-map** (see §5.10). Surface trade-offs as options with a recommendation, not fait accompli.
7. **Keep the ledger current** — every §3 item becomes an issue; every fix links its test.
8. **Docs move with code** — dialect reference, README, and Help update in the same PR as the feature.
9. **No new dependency without a line of justification** in the PR (size, maintenance, licence).
10. **When something is impossible** (Chrome print-dialog bookmarks, Word renderer quirks), document it in Known Limitations rather than shipping a lie.

---

## Appendix A — Feature-parity checklist (Phase 2/3 gate)

Every box checked against the golden corpus and by hand before `/classic` retires:

- [ ] Live paginated preview: A4/Letter, 3 margin presets, zoom (ctrl+wheel, fit, %), folio readout, outline navigator
- [ ] Live-edit on pages: caret-preserving recompose, view re-anchoring, read-only generated furniture, one undo history
- [ ] Dialect complete (Appendix B) — parser tests for each construct
- [ ] Themes ×4, accent colours, page borders 7 styles × 3 weights × ink/accent, cover page, page-numbering scheme (unnumbered cover, roman contents, "Page 1 of N" body)
- [ ] TOC/LOF/LOT with dotted leaders + real page numbers; footnotes at correct page foot; citations both styles + locators; cross-references resolve; table captions number; header row repeats on table page-breaks
- [ ] Fonts: 7 embedded families in preview/PDF/DOCX identically; ~190-name Word font menu with installed-detection; per-selection font/size
- [ ] Word ribbon parity: underline/strike/highlight (15 colours)/sub/sup/colour/shading/size/face/small caps/all caps/alignment blocks/change case/clear formatting — identical in PDF and as real run properties in DOCX
- [ ] DOCX export: embedded fonts, styles, cover band, true column widths, figures, footnotes, OMML equations, auto-updating TOC field, page borders
- [ ] PDF export: pre-configured margins/headers, selectable text
- [ ] Markdown export; `.docforge.json` round-trip with images
- [ ] Import: docx, pdf (both roads), md, txt, html, csv/tsv, xlsx, pptx, epub, ipynb, images — drag-drop + Open + paste conversion
- [ ] PDF bench: double-click rewrite in embedded font, fallback notice, free text, white-out, highlighter, image stamps, export from original bytes
- [ ] Templates ×6 as working specimens; command palette; focus mode; find/replace; structure linter; autosave + crash recovery; light/dark chrome; mobile layout
- [ ] Keyboard map ≥ current (Ctrl+B/I/U/F/H/S/K, plus the new Ctrl+1/2/3, Shift+Tab)

## Appendix B — The dialect (additive-only, forever)

The §1.3 list is normative. Freeze it as `packages/engine/DIALECT.md` with one golden test per row: headings + `{#sec:}` · emphasis/code · `++u++` `~~strike~~` `==mark==` `=={colour}mark==` `~sub~` `^sup^` · span attributes (`color bg size font u sc caps`) · alignment/callout/center blocks · lists, quotes, tables (+alignment, captions, `#tbl:`) · `[screenshot: … | w:% | noborder | #fig:]` · footnotes · citations (`[@key]`, definitions, `[references]`, locators, numeric/author–year) · cross-refs `[#fig:] [#tbl:] [#sec:]` · `$…$` `$$…$$` · fenced code + language · `[toc] [lof] [lot] [pagebreak]` · front-matter fields the cover consumes. Note the documented breaking choice already made: single `~tilde~` is subscript (Pandoc convention), not strikethrough.

## Open questions for the owner (answer before Phase 2)

1. Domain + name check for the hosted app (docforge.* availability; the npm scope `@docforge`).
2. Deploy account: Vercel personal Pro/Hobby? (Hobby is fine to start; no server code needed until Phase 7.)
3. AI drawer default provider for BYO keys (Anthropic first?), and whether the local-model spike is worth Wave 3.
4. Keep the "Built with Claude" footer line? (It's charming; your call whether it stays in a portfolio context.)
5. License for community templates (CC0 vs CC-BY) before the gallery opens.

---

## Kickoff message (paste this to start Phase 0)

> Read MASTER-PROMPT.md fully. Confirm your understanding of §5 (non-negotiables) and §1.3 (the dialect) in two paragraphs. Then execute **Phase 0 — Baseline & safety net** exactly as specified: commit the WIP and tag `v1-classic`, clean the repo per §3.4, build the golden corpus and comparison runner, and re-verify the §3 ledger against the current build, opening one tracking issue per confirmed item. Do not begin any Phase 1 work. Finish by demonstrating the Phase 0 gate.
