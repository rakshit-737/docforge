# Bug & debt ledger — Phase 0 re-verification (2026-08-30)

Every MASTER-PROMPT §3 item, re-verified against the current build (`5d7b645` + Phase 0
commits) by code inspection with file:line evidence. Several redesign commits landed after
the 2026-08-14 review, so a good share no longer reproduces. Confirmed and partial items
are tracked as GitHub issues labelled `ledger`; each closes with a test that would have
caught it (MASTER-PROMPT §10.7).

## §3.1 Accessibility

| Item | Verdict | Issue | Evidence |
|---|---|---|---|
| Toggles `display:none`, unfocusable swatches | **FIXED SINCE** | — | `app.css:312-316` uses `position:absolute/opacity:0` + `:focus-visible` ring; swatches and colour cells are `<button aria-label>` (`index.html:104-111`, `main.js:1185-1191`) |
| Modals: no `role=dialog`, no focus trap | **FIXED SINCE** | — | all five modals carry `role="dialog" aria-modal` (`index.html:393+`); `ovFocusables`/`openOv` Tab-wrap trap + focus restore (`main.js:426-451`) |
| No `aria-live` on page info / find count; silent busy | **FIXED SINCE** | — | `#pgInfo` and `#findCount` are `role="status"` (`index.html:325`, `:281`); compose progress streams into the live region (`main.js:584,640`) |
| ~42 tab stops; toolbar not roving | **PARTIAL** | [#2](https://github.com/rakshit-737/docforge/issues/2) | `role="toolbar"` landed; still 46 stops, no roving tabindex (`index.html:219-277`) |
| Contrast: kbd 4.3:1; 11.5px option text | **PARTIAL** | [#3](https://github.com/rakshit-737/docforge/issues/3) | kbd contrast fixed (8.32:1 / 6.56:1, `app.css:478-483`); `.tbsel` still 11.5px on desktop (`app.css:409`) |

## §3.2 Interaction

| Item | Verdict | Issue | Evidence |
|---|---|---|---|
| Replace All destroys undo | **FIXED SINCE** | — | `execCommand("insertText")` + `setRangeText` fallback (`main.js:1694-1700`); app-level history covers it |
| Toolbar tools silently vanish at 1180–1500px | **FIXED SINCE** | — | `.tbrow.scroll-l/.scroll-r` edge fades + scroll/resize wiring (`app.css:362-373`, `main.js:1984-1993`) |
| PDF-bench leaves studio masthead armed | **FIXED SINCE** | — | `body.pdf-mode` hides templates/settings/exports (`app.css:164-169`); palette blocked in bench (`main.js:1585`) |
| Ctrl+S downloads a fresh file every press | **CONFIRMED** | [#4](https://github.com/rakshit-737/docforge/issues/4) | `main.js:2069` → `saveProject()` → unconditional `downloadBlob()` |
| Find: no "n of m", no toggles, no highlights | **CONFIRMED** | [#8](https://github.com/rakshit-737/docforge/issues/8) | `main.js:1652-1676`; bare textarea, selection-only marking |
| Esc doesn't close Templates; zoom duplicated | **FIXED IN THE REBUILD** (`d5db7a0`) | [#5](https://github.com/rakshit-737/docforge/issues/5) | Esc was fixed in the classic build (`main.js:2091-2093`); the studio now mounts ONE `<ZoomCluster>` in both the preview bar and the PDF bench — same four controls, a percentage that fits when clicked on either, and the same 1.35 fit cap. The frozen 1.x edition keeps its own chrome by design |
| Shift+Tab no outdent; no Ctrl+1/2/3 | **CONFIRMED** | [#6](https://github.com/rakshit-737/docforge/issues/6) | `main.js:2056` inserts spaces on every Tab; `h1/h2/h3` actions unbound |
| Template switch destructive behind confirm | **PARTIAL** | [#7](https://github.com/rakshit-737/docforge/issues/7) | text undo landed; settings + attachments still lost for good |

## §3.3 Product limitations (fixable slice)

| Item | Verdict | Issue |
|---|---|---|
| Printed PDFs have no outline/bookmarks | **CONFIRMED** | [#9](https://github.com/rakshit-737/docforge/issues/9) — direct-PDF-export path (§8.4) |
| APA same-author same-year not disambiguated | **CONFIRMED** | [#10](https://github.com/rakshit-737/docforge/issues/10) — CSL engine (§8.3) |
| Word vs PDF page drift · PDF import flattening · rewritten-line text layer | **DOCUMENTED** | stay in Known Limitations until §8.4 features land |

## §3.4 Engineering debt

| Item | Verdict | Issue |
|---|---|---|
| Vendored libs as eval'd strings (4 sites) | **CONFIRMED** | [#11](https://github.com/rakshit-737/docforge/issues/11) |
| innerHTML sinks unsanitized (21 main.js + 11 engine.js) | **CONFIRMED** | [#12](https://github.com/rakshit-737/docforge/issues/12) |
| localStorage autosave for documents | **CONFIRMED** | [#13](https://github.com/rakshit-737/docforge/issues/13) |
| No CI beyond deploy | **CONFIRMED** (golden + build-in-CI landed in Phase 0) | [#14](https://github.com/rakshit-737/docforge/issues/14) |
| Committed artifacts / AI droppings | **FIXED IN PHASE 0** | `9b4aaf2` |
| No TS / framework / unit tests | the rebuild itself — Phases 1–2 | — |
