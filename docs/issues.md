# Repository Audit & Issues Log

This document lists all identified issues, bugs, interaction gaps, engineering debt, and enhancement opportunities found in the DocForge repository, categorized using the repository's issue labels.

---

## Issues Summary Table

| ID | Title | Labels | Description Summary |
|---|---|---|---|
| 1 | Keyboard navigation across toolbar controls requires ~46 tab stops | `bug`, `ledger`, `good first issue` | Toolbar lacks roving `tabindex`, forcing high tab stop count across buttons. |
| 2 | Small option font size (11.5px) on desktop toolbar selectors | `bug`, `ledger`, `good first issue` | `.tbsel` typography falls below standard legibility recommendations. |
| 3 | `Ctrl+S` key combination unconditionally triggers fresh file download | `bug`, `ledger`, `help wanted` | `Ctrl+S` downloads a new file every press instead of performing local persistence. |
| 4 | Find & Replace toolbar tool lacks "N of M" match counters, regex toggles, and highlights | `bug`, `ledger`, `enhancement` | Find interface operates on bare textarea without match counts, flags, or editor highlight overlays. |
| 5 | Secondary zoom controls duplicated in UI chrome with inconsistent styling | `bug`, `ledger`, `good first issue` | Multiple zoom control clusters exist in different toolbar/footer locations. |
| 6 | Editor indentation does not handle `Shift+Tab` outdenting or `Ctrl+1/2/3` heading shortcuts | `bug`, `ledger`, `good first issue` | `Tab` key indents with spaces but `Shift+Tab` fails to outdent; heading keyboard shortcuts are missing. |
| 7 | Switching templates causes destructive replacement of document settings and attachments | `bug`, `ledger`, `help wanted` | Template switching resets non-text document settings and attachments without full undo recovery. |
| 8 | Printed PDF output lacks structured outline / bookmarks tree | `bug`, `ledger`, `enhancement` | Browser print-to-PDF output cannot emit outline bookmarks; requires direct PDF export pipeline (§8.4). |
| 9 | APA citation author-year formatting fails to disambiguate same author and same year entries | `bug`, `ledger`, `enhancement` | APA citation formatter uses heuristic parsing without disambiguation suffixing; needs CSL citation engine integration. |
| 10 | Vendored third-party libraries stored and executed as string constants | `bug`, `ledger`, `help wanted` | String eval of vendored libraries blocks strict Content Security Policy (CSP) enforcement. |
| 11 | Unsanitized `innerHTML` assignments across engine and main UI handlers | `bug`, `ledger` | Multiple direct `innerHTML` assignments exist without DOMPurify sanitization. |
| 12 | Document autosave uses `localStorage` instead of structured IndexedDB persistence | `bug`, `ledger`, `enhancement` | Document content and project history rely on `localStorage` quota limits rather than IndexedDB. |
| 13 | Biome linting and formatting errors present across workspace packages | `bug`, `good first issue` | `pnpm lint` fails due to formatting drifts and forbidden TypeScript syntax warnings in `@docforge/pdf-editor` and `apps/web`. |
| 14 | Missing CSL Engine and BibTeX / RIS citation reference import capabilities | `enhancement`, `help wanted` | Upgrade citation subsystem to support real CSL styles and external reference files. |
| 15 | Add Mermaid diagram rendering support in Markdown preview and DOCX exports | `enhancement`, `good first issue` | Enable ```` ```mermaid ```` fence parsing to SVG for preview/PDF and embedded pictures in Word docs. |
| 16 | Clarify local-first privacy guarantee and offline single-file execution in README | `documentation`, `good first issue` | Update documentation regarding offline PWA execution and single-file build guarantees. |

---

## Detailed Issue Breakdown

### Issue 1: Keyboard navigation across toolbar controls requires ~46 tab stops
- **Labels:** `bug`, `ledger`, `good first issue`
- **Location:** `src/index.html:219-277`
- **Description:** Toolbar buttons and select dropdowns are currently rendered as separate focusable elements in the default tab order. Users navigating by keyboard must press Tab over 46 times to reach the main editor pane.
- **Remediation:** Implement `role="toolbar"` with a roving `tabindex` pattern to allow arrow key navigation between toolbar tools.

---

### Issue 2: Small option font size (11.5px) on desktop toolbar selectors
- **Labels:** `bug`, `ledger`, `good first issue`
- **Location:** `src/app.css:409`
- **Description:** Select elements with the `.tbsel` class render at 11.5px on desktop viewports, causing legibility issues and failing recommended UI contrast/size targets.
- **Remediation:** Adjust selector typography in `src/app.css` to at least 12px / 13px.

---

### Issue 3: `Ctrl+S` key combination unconditionally triggers fresh file download
- **Labels:** `bug`, `ledger`, `help wanted`
- **Location:** `src/js/main.js:2069`
- **Description:** Pressing `Ctrl+S` invokes `saveProject()`, which unconditionally executes `downloadBlob()`. Habituated users end up accumulating dozens of duplicate project files in their Downloads folder.
- **Remediation:** Intercept `Ctrl+S` to persist to local storage/IndexedDB or utilize File System Access API where supported, offering explicit export actions for file downloads.

---

### Issue 4: Find & Replace toolbar tool lacks "N of M" match counters, regex toggles, and highlights
- **Labels:** `bug`, `ledger`, `enhancement`
- **Location:** `src/js/main.js:1652-1676`
- **Description:** Find functionality reports total match count ("2 found") rather than positional status ("2 of 14"), lacks options for case sensitivity or regex matching, and does not highlight matches directly in the editor.
- **Remediation:** Upgrade Find & Replace toolbar component to track active match index, support search options, and leverage CodeMirror 6 search decorations.

---

### Issue 5: Secondary zoom controls duplicated in UI chrome with inconsistent styling
- **Labels:** `bug`, `ledger`, `good first issue`
- **Location:** `src/index.html` & `src/js/main.js`
- **Description:** Zoom adjustments are exposed in two different locations in the UI chrome with disparate control styling and behavior.
- **Remediation:** Consolidate document preview zoom controls into a single, unified status bar element.

---

### Issue 6: Editor indentation does not handle `Shift+Tab` outdenting or `Ctrl+1/2/3` heading shortcuts
- **Labels:** `bug`, `ledger`, `good first issue`
- **Location:** `src/js/main.js:2056`
- **Description:** Pressing `Tab` inside the manuscript editor always inserts space characters regardless of modifier keys, preventing users from outdenting lists or code blocks with `Shift+Tab`. Furthermore, shortcuts `Ctrl+1`, `Ctrl+2`, `Ctrl+3` are unbound.
- **Remediation:** Implement `Shift+Tab` line outdenting and bind heading level key combinations in editor keyboard handlers.

---

### Issue 7: Switching templates causes destructive replacement of document settings and attachments
- **Labels:** `bug`, `ledger`, `help wanted`
- **Location:** `src/js/main.js:1420-1450`
- **Description:** While document text changes can be undone, switching templates overwrites page borders, margins, theme variables, and attached screenshot images without a full rollback state.
- **Remediation:** Adopt a multi-document workspace model or record template switches as atomic undoable state snapshots.

---

### Issue 8: Printed PDF output lacks structured outline / bookmarks tree
- **Labels:** `bug`, `ledger`, `enhancement`
- **Location:** `packages/export-pdf` / Print preview route
- **Description:** Standard browser print-to-PDF output cannot emit document outline structures or PDF bookmarks.
- **Remediation:** Develop a direct client-side PDF export route leveraging `pdf-lib` / `Paged.js` AST rendering (§8.4).

---

### Issue 9: APA citation author-year formatting fails to disambiguate same author and same year entries
- **Labels:** `bug`, `ledger`, `enhancement`
- **Location:** `packages/engine/src/citations.ts`
- **Description:** Mechanically parsed citations for multiple entries by the same author published in the same year output identical citation keys without suffix disambiguation (e.g., `2024a`, `2024b`).
- **Remediation:** Integrate a full CSL processor (`citeproc-js` or `@citation-js`) to handle official APA 7 and IEEE standards.

---

### Issue 10: Vendored third-party libraries stored and executed as string constants
- **Labels:** `bug`, `ledger`, `help wanted`
- **Location:** `src/js/file-import.js`, `src/js/docx-import.js`, `src/js/pdf-import.js`
- **Description:** Libraries such as Mammoth and PDF.js are embedded as string constants and eval'd at runtime to postpone initialization. This pattern violates strict Content Security Policies (`unsafe-eval`).
- **Remediation:** Replace string `eval()` constants with native ES module dynamic imports (`import()`).

---

### Issue 11: Unsanitized `innerHTML` assignments across engine and main UI handlers
- **Labels:** `bug`, `ledger`
- **Location:** `src/js/main.js` (21 instances) and `src/js/engine.js` (11 instances)
- **Description:** Raw HTML strings generated during markdown parsing, file importing, and live editing are directly assigned to `innerHTML` without DOMPurify sanitization.
- **Remediation:** Route all markdown-to-DOM conversions through a DOMPurify sanitization pipeline.

---

### Issue 12: Document autosave uses `localStorage` instead of structured IndexedDB persistence
- **Labels:** `bug`, `ledger`, `enhancement`
- **Location:** `src/js/main.js:1800-1825`
- **Description:** `localStorage` storage limits (~5MB) restrict multi-document autosave capabilities and image attachments.
- **Remediation:** Migrate persistence layer to IndexedDB using `idb` with Zod schema verification.

---

### Issue 13: Biome linting and formatting errors present across workspace packages
- **Labels:** `bug`, `good first issue`
- **Location:** `packages/pdf-editor/src/index.ts`, `apps/web/app/globals.css`
- **Description:** `pnpm lint` reports formatting diffs and forbidden non-null assertions / `any` types in `@docforge/pdf-editor` and Tailwind `@theme` directive parsing errors in CSS.
- **Remediation:** Apply `biome check --write .` and refine configuration overrides for CSS / Tailwind directives.

---

### Issue 14: Missing CSL Engine and BibTeX / RIS citation reference import capabilities
- **Labels:** `enhancement`, `help wanted`
- **Location:** `packages/engine`
- **Description:** Users currently manually write `[@key]: Full citation entry`. DocForge should support importing `.bib` / RIS files from reference managers like Zotero.
- **Remediation:** Implement BibTeX/RIS parsers and CSL rendering engine in `packages/engine`.

---

### Issue 15: Add Mermaid diagram rendering support in Markdown preview and DOCX exports
- **Labels:** `enhancement`, `good first issue`
- **Location:** `packages/engine` & `packages/export-docx`
- **Description:** ```` ```mermaid ```` code blocks are rendered as raw text rather than graphical diagrams.
- **Remediation:** Render Mermaid diagrams to SVG in web preview and convert to embedded PNG/vector shapes in DOCX export.

---

### Issue 16: Clarify local-first privacy guarantee and offline single-file execution in README
- **Labels:** `documentation`, `good first issue`
- **Location:** `README.md`
- **Description:** Ensure documentation highlights that documents remain strictly local and offline-first across both the Next.js PWA and the single-file HTML release.
- **Remediation:** Add explicit privacy and offline execution guarantees in `README.md`.
