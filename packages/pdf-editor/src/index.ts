/// <reference path="./ambient.d.ts" />
/* ============================================================
   index.ts — format-preserving edits over an existing PDF

   Ported 1:1 from src/js/pdf-editor.js (887 lines) — Phase 1. The only
   sanctioned change: the `(0, eval)` of the vendored pdf-lib bundle became
   a Blob-URL module import (see blob-import.ts), which forced lib() async
   (exportPdf, its only caller, already was). Everything else is the same
   logic with types added around it.

   The original file is never re-generated. pdf.js paints each page onto
   a canvas for display; the user's edits (text boxes, whiteout, highlight,
   images) live in an overlay layer above it. Export loads the ORIGINAL
   bytes into pdf-lib and draws only the overlay on top, so the source
   layout, fonts and vector content stay byte-identical underneath.

   Every edit is stored in PDF user-space points with a TOP-LEFT origin —
   natural for the screen — and flipped to pdf-lib's bottom-left origin
   only at export time.

   pdf-lib ships embedded as a string on window.__PDFLIB_SRC__ and is
   loaded on first export; pdf.js arrives via PdfImport.ensureLib().
   ============================================================ */

import { importGlobalScript } from "./blob-import";

/* ---------- types (additive; the runtime shapes are unchanged) ---------- */

export interface OrigFont {
  loadedName: string;
  face: string;
}
export interface Cover {
  dx: number;
  dy: number;
  w: number;
  h: number;
}

export interface TextEdit {
  type: "text";
  x: number;
  y: number;
  w: number;
  /** Never set on text edits at runtime; typed so shared drag code can read it. */
  h?: number;
  text: string;
  size: number;
  color: string;
  font: string;
  /** The page's own font — kept unless the user switches away. */
  orig?: OrigFont;
  useOrig?: boolean;
  /** Offsets, not absolutes, so the cover travels when the box is dragged. */
  cover?: Cover;
}
export interface ImageEdit {
  type: "image";
  x: number;
  y: number;
  w: number;
  h: number;
  dataUrl: string;
  kind: "png" | "jpg";
}
export interface BoxEdit {
  type: "whiteout" | "highlight";
  x: number;
  y: number;
  w: number;
  h: number;
}
export type Edit = TextEdit | ImageEdit | BoxEdit;

/** One printed line reconstructed from pdf.js's text layer (ensureLines). */
export interface LineRec {
  x: number;
  yTop: number;
  w: number;
  size: number;
  text: string;
  font: string;
  orig: OrigFont;
}

interface PageState {
  pg: PdfJsPage;
  w: number;
  h: number;
  /* el/canvas/layer are attached in open() right after all pages are measured. */
  el: HTMLDivElement;
  canvas: HTMLCanvasElement;
  layer: HTMLDivElement;
  renderTask: PdfJsRenderTask | null;
  /** Extracted lazily by ensureLines(). */
  lines?: LineRec[];
}

type OrigRun = {
  str: string;
  x: number;
  f: number;
  w: number;
  size: number;
  face: string;
  loadedName: string;
};

type Drag =
  | {
      kind: "move";
      i: number;
      ed: Edit;
      sx: number;
      sy: number;
      ox: number;
      oy: number;
      moved: boolean;
    }
  | { kind: "resize"; i: number; ed: Edit; sx: number; sy: number; ow: number; oh: number }
  | { kind: "draw"; i: number; ed: Edit; sx: number; sy: number };

type ResFont = { key: any; type0: boolean };
type NativeLayout = { rsrc: ResFont; lines: string[]; hexes: (string | null)[]; needW: number };

export interface PdfEditorHooks {
  toast(msg: string, kind?: string): void;
  confirm(...args: unknown[]): Promise<boolean>;
}

/* ---------- pdf-lib bootstrap ---------- */

let pdflibLoading: Promise<void> | null = null;

async function lib(): Promise<PdfLibNamespace> {
  if (window.PDFLib) return window.PDFLib;
  if (window.__PDFLIB_SRC__) {
    // Blob-URL module import replaces the old indirect eval: the bundle runs
    // with window/self aliased to globalThis, so its UMD assignment lands on
    // globalThis.PDFLib (and the epilogue pins the binding there explicitly).
    // The in-flight promise keeps "evaluate the bundle exactly once" true
    // now that loading is asynchronous — the eval was atomic.
    if (!pdflibLoading) {
      pdflibLoading = importGlobalScript(window.__PDFLIB_SRC__, ";globalThis.PDFLib=PDFLib;");
      pdflibLoading.catch(() => {
        pdflibLoading = null;
      }); // a failed load stays retryable
    }
    await pdflibLoading;
    window.__PDFLIB_SRC__ = null; // the string is dead weight once eval'd
    // No presence check, matching the classic build: if the bundle somehow
    // failed to land, exportPdf's destructuring throws the same TypeError
    // the old `return window.PDFLib` produced. (TS narrowed the property to
    // undefined at the top guard, hence the two-step cast.)
    return window.PDFLib as unknown as PdfLibNamespace;
  }
  throw new Error("PDF editing is not bundled in this build");
}

const PDF_FONT: Record<string, string> = {
  helv: "Helvetica",
  helvB: "HelveticaBold",
  times: "TimesRoman",
  timesB: "TimesRomanBold",
  timesI: "TimesRomanItalic",
  courier: "Courier",
};
const CSS_FONT: Record<string, [family: string, weight: string, style: string]> = {
  helv: ["Arial,Helvetica,sans-serif", "400", "normal"],
  helvB: ["Arial,Helvetica,sans-serif", "700", "normal"],
  times: ["Georgia,'Times New Roman',serif", "400", "normal"],
  timesB: ["Georgia,'Times New Roman',serif", "700", "normal"],
  timesI: ["Georgia,'Times New Roman',serif", "400", "italic"],
  courier: ["'Courier New',monospace", "400", "normal"],
};

/* ---------- state ---------- */

/** DOM handles bound once (bindOnce). Values stay `any`: the shell's DOM
    plumbing is driven by load-bearing ids, not by this package's types. */
let els: any = null,
  bound = false;
let bytes: ArrayBuffer | null = null,
  task: PdfJsLoadingTask | null = null,
  doc: PdfJsDocument | null = null,
  name = "";
let pages: PageState[] = []; // { pg, w, h, el, canvas, layer, renderTask }
const edits = new Map<number, Edit[]>(); // pageIndex -> Edit[]
let opened = false,
  dirty = false,
  gen = 0;
let tool = "select",
  zoom = 1,
  zoomTimer = 0;
let sel: Edit | null = null,
  selPage = -1,
  drag: Drag | null = null,
  pendingImg: { i: number; x: number; y: number } | null = null;
const nodeOf = new WeakMap<Edit, HTMLElement>(); // edit -> element
const elToEdit = new WeakMap<Element, Edit>();
const revCache = new Map<string, Map<string, number> | null>(); // loadedName -> Map(unicode char -> charcode) | null
let mctx: CanvasRenderingContext2D | null = null; // shared canvas context for native-font measurement

/* ---------- the original font, kept ----------
   pdf.js registers every embedded font as a FontFace named by its loadedName,
   so the edit box can *show* the real font; its ToUnicode map, inverted, gives
   unicode -> charcode so the export can *write* with the page's own font
   resource. Both only cover glyphs the subset actually contains. */

function revMapFor(i: number, loadedName: string): Map<string, number> | null {
  if (revCache.has(loadedName)) return revCache.get(loadedName)!;
  let m: Map<string, number> | null = null;
  try {
    const f = pages[i]!.pg.commonObjs.get(loadedName);
    const src = f && f.toUnicode && f.toUnicode._map;
    if (src) {
      m = new Map();
      const add = (code: number, u: unknown) => {
        if (typeof u === "string" && u.length === 1 && !m!.has(u)) m!.set(u, code);
      };
      if (Array.isArray(src)) {
        for (let c = 0; c < src.length; c++) if (src[c] !== undefined) add(c, src[c]);
      } else if (typeof src.forEach === "function") {
        src.forEach((u: unknown, c: number) => add(c, u));
      }
      if (!m.size) m = null;
    }
  } catch {
    /* font not resolved — fall back to a standard face */
  }
  revCache.set(loadedName, m);
  return m;
}

const fontFaceUsable = (loadedName: string): boolean => {
  try {
    return document.fonts.check(`12px "${loadedName}"`);
  } catch {
    return false;
  }
};

function measureNative(loadedName: string, size: number, s: string): number {
  if (!mctx) mctx = document.createElement("canvas").getContext("2d");
  mctx!.font = `${size}px "${loadedName}"`;
  return mctx!.measureText(s).width;
}

/* charcodes -> hex show-string; Type0 resources take 2-byte codes */
function encodeWith(rev: Map<string, number>, type0: boolean, s: string): string | null {
  let hex = "";
  for (const ch of s) {
    const code = rev.get(ch);
    if (code === undefined || (!type0 && code > 255)) return null;
    hex += code.toString(16).padStart(type0 ? 4 : 2, "0");
  }
  return hex;
}

const $ = (id: string) => document.getElementById(id);
const clamp = (v: number, a: number, b: number): number => Math.min(b, Math.max(a, v));

/* ---------- display ---------- */

function sizePage(i: number): void {
  const p = pages[i]!,
    cw = p.w * zoom + "px",
    ch = p.h * zoom + "px";
  p.el.style.width = cw;
  p.el.style.height = ch;
  p.canvas.style.width = cw;
  p.canvas.style.height = ch;
  p.layer.style.width = cw;
  p.layer.style.height = ch;
}

async function paint(i: number): Promise<void> {
  const p = pages[i]!,
    g = gen;
  // Above 2 the extra pixels are invisible and quadruple the memory bill.
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const vp = p.pg.getViewport({ scale: zoom * dpr });
  if (p.renderTask) {
    try {
      p.renderTask.cancel();
    } catch {
      /* settled */
    }
  }
  p.canvas.width = Math.floor(vp.width);
  p.canvas.height = Math.floor(vp.height);
  const t = p.pg.render({ canvasContext: p.canvas.getContext("2d")!, viewport: vp });
  p.renderTask = t;
  try {
    await t.promise;
  } catch {
    /* cancelled by a newer zoom */
  }
  if (gen === g && p.renderTask === t) p.renderTask = null;
}

function place(ed: Edit): void {
  const el = nodeOf.get(ed);
  if (!el) return;
  Object.assign(el.style, {
    left: ed.x * zoom + "px",
    top: ed.y * zoom + "px",
    width: ed.w * zoom + "px",
  });
  if (ed.type === "text") {
    let [fontFamily, fontWeight, fontStyle] = CSS_FONT[ed.font] || CSS_FONT.helv!;
    if (ed.orig && ed.useOrig !== false && fontFaceUsable(ed.orig.loadedName)) {
      // the embedded font itself, live in the edit box
      fontFamily = `"${ed.orig.loadedName}", ${fontFamily}`;
      fontWeight = "400";
      fontStyle = "normal"; // the face carries its own weight/slant
    }
    Object.assign(el.style, {
      height: "auto",
      fontFamily,
      fontWeight,
      fontStyle,
      fontSize: ed.size * zoom + "px",
      color: ed.color,
    });
    if (ed.cover) {
      // On screen the white grows with the text (like the export cover will),
      // instead of blanking the whole margin-wide editing box.
      const pad = Math.max(0, -ed.cover.dy) * zoom;
      el.style.background = "#fff";
      el.style.boxShadow = `0 0 0 ${pad}px #fff`;
      el.style.width = "auto";
      el.style.minWidth = ed.cover.w * zoom + "px";
      el.style.maxWidth = ed.w * zoom + "px";
    }
  } else {
    el.style.height = ed.h * zoom + "px";
  }
}

function buildNode(ed: Edit, i: number): HTMLDivElement {
  const el = document.createElement("div");
  el.style.position = "absolute"; // geometry must hold even before app.css does
  elToEdit.set(el, ed);
  if (ed.type === "text") {
    el.className = "pe-edit pe-text";
    el.contentEditable = "true";
    el.spellcheck = false;
    el.textContent = ed.text;
    // line-height 1.25 matches the 1.25em line advance used at export
    Object.assign(el.style, { whiteSpace: "pre-wrap", minWidth: "40px", lineHeight: "1.25" });
    el.addEventListener("input", () => {
      ed.text = el.innerText;
      dirty = true;
    });
    el.addEventListener("blur", () => {
      // Whitespace-only boxes evaporate rather than exporting invisible edits.
      if (!ed.text.trim() && (edits.get(i) || []).includes(ed)) removeEdit(i, ed);
    });
  } else if (ed.type === "image") {
    el.className = "pe-edit pe-img";
    const img = document.createElement("img");
    Object.assign(img, { src: ed.dataUrl, draggable: false });
    Object.assign(img.style, { width: "100%", height: "100%" });
    el.appendChild(img);
  } else if (ed.type === "whiteout") {
    el.className = "pe-edit pe-white";
    el.style.background = "#fff";
  } else {
    el.className = "pe-edit pe-hl";
    el.style.background = "rgba(245,213,10,.42)";
    el.style.mixBlendMode = "multiply";
  }
  return el;
}

function decorate(ed: Edit, el: HTMLElement): void {
  const on = sel === ed;
  el.classList.toggle("sel", on);
  let h = el.querySelector<HTMLElement>(":scope > .pe-resize");
  if (on && !h) {
    h = document.createElement("div");
    h.className = "pe-resize";
    h.contentEditable = "false"; // keeps the caret and Select-All out of the handle
    el.appendChild(h);
  } else if (!on && h) h.remove();
}

function syncLayer(i: number): void {
  const p = pages[i];
  if (!p) return;
  const keep = new Set<Element>();
  for (const ed of edits.get(i) || []) {
    let el = nodeOf.get(ed);
    if (!el) {
      el = buildNode(ed, i);
      nodeOf.set(ed, el);
    }
    if (el.parentNode !== p.layer) p.layer.appendChild(el);
    place(ed);
    decorate(ed, el);
    keep.add(el);
  }
  for (const el of [...p.layer.children]) if (!keep.has(el)) el.remove();
}

/* ---------- selection ---------- */

function select(ed: Edit, i: number): void {
  if (sel === ed) return;
  const prev = sel;
  sel = ed;
  selPage = i;
  if (prev && nodeOf.get(prev)) decorate(prev, nodeOf.get(prev)!);
  if (nodeOf.get(ed)) decorate(ed, nodeOf.get(ed)!);
  if (ed.type === "text") {
    // controls mirror the selection they now steer
    els.font.value = ed.orig && ed.useOrig !== false ? "orig" : ed.font;
    els.size.value = ed.size;
    els.color.value = ed.color;
  }
}

function deselect(): void {
  if (!sel) return;
  const ed = sel;
  sel = null;
  selPage = -1;
  const el = nodeOf.get(ed);
  if (el) decorate(ed, el);
}

function pushEdit(i: number, ed: Edit): void {
  let list = edits.get(i);
  if (!list) edits.set(i, (list = []));
  list.push(ed);
  dirty = true;
  syncLayer(i);
}

function removeEdit(i: number, ed: Edit): void {
  const list = edits.get(i);
  const at = list ? list.indexOf(ed) : -1;
  if (at < 0) return;
  list!.splice(at, 1);
  if (sel === ed) {
    sel = null;
    selPage = -1;
  }
  dirty = true;
  syncLayer(i);
}

/* ---------- the original text, as editable lines ----------
   Double-clicking a printed line rewrites it in place: the line's runs are
   clustered from pdf.js's text layer, a white cover hides the original at
   export, and a prefilled text edit sits at the exact same baseline (yTop is
   derived from the run's baseline with the same 0.83 ascent the export uses,
   so the redrawn text lands where the original stood). The original font is
   mapped to the nearest standard face by family/weight cues. Lines are
   extracted lazily per page — by first double-click the page has painted, so
   commonObjs already knows the real font names. */
async function ensureLines(i: number): Promise<LineRec[]> {
  const p = pages[i]!;
  if (p.lines) return p.lines;
  const tc = await p.pg.getTextContent();
  const runs: OrigRun[] = [];
  for (const it of tc.items) {
    if (!it.str || !it.str.trim()) continue;
    const size = Math.hypot(it.transform[0], it.transform[1]) || 1;
    let face = "";
    try {
      const f = p.pg.commonObjs.get(it.fontName);
      face = (f && f.name) || "";
    } catch {
      /* not resolved */
    }
    runs.push({
      str: it.str,
      x: it.transform[4],
      f: it.transform[5],
      w: it.width || 0,
      size,
      face,
      loadedName: it.fontName,
    });
  }
  runs.sort((a, b) => b.f - a.f || a.x - b.x);
  const clusters: { f: number; runs: OrigRun[]; size?: number }[] = [];
  let cur: { f: number; runs: OrigRun[]; size?: number } | null = null;
  for (const r of runs) {
    // BUG (preserved for 1:1 parity): clusters are created without a `size`
    // property, so `cur.size` is always undefined, Math.max(…) is NaN and the
    // condition is always false — every run starts its own cluster and
    // same-baseline runs never merge. Fixing it would change editLineAt's hit
    // targets and rewrite extents, i.e. observable behavior.
    if (cur && Math.abs(r.f - cur.f) <= 0.35 * Math.max(r.size, cur.size!)) cur.runs.push(r);
    else clusters.push((cur = { f: r.f, runs: [r] }));
  }
  p.lines = clusters.map((L) => {
    L.runs.sort((a, b) => a.x - b.x);
    const x0 = L.runs[0]!.x;
    const x1 = Math.max(...L.runs.map((r) => r.x + r.w));
    const size = Math.max(...L.runs.map((r) => r.size));
    let text = "";
    for (let k = 0; k < L.runs.length; k++) {
      const r = L.runs[k]!,
        prev = L.runs[k - 1];
      if (
        prev &&
        !text.endsWith(" ") &&
        !r.str.startsWith(" ") &&
        r.x - (prev.x + prev.w) > 0.2 * size
      )
        text += " ";
      text += r.str;
    }
    const faces = L.runs.map((r) => r.face).join(" ");
    const bold = /bold|black|heavy/i.test(faces);
    const italic = /italic|oblique/i.test(faces);
    const mono = /mono|courier|consol|code/i.test(faces);
    const serif =
      !mono &&
      /times|georgia|serif|garamond|book|roman|crimson|cambria|constantia/i.test(faces) &&
      !/sans/i.test(faces);
    const font = mono
      ? "courier"
      : serif
        ? bold
          ? "timesB"
          : italic
            ? "timesI"
            : "times"
        : bold
          ? "helvB"
          : "helv";
    // The line's dominant (most characters) font is the one a rewrite keeps.
    const byFont = new Map<string, number>();
    for (const r of L.runs) {
      byFont.set(r.loadedName, (byFont.get(r.loadedName) || 0) + r.str.length);
    }
    let domName = L.runs[0]!.loadedName,
      domN = -1;
    for (const [k, n] of byFont)
      if (n > domN) {
        domName = k;
        domN = n;
      }
    const domFace =
      (L.runs.find((r) => r.loadedName === domName) || ({} as Partial<OrigRun>)).face || "";
    return {
      x: x0,
      yTop: p.h - L.f - size * 0.83,
      w: x1 - x0,
      size,
      text,
      font,
      orig: { loadedName: domName, face: domFace },
    };
  });
  return p.lines;
}

async function editLineAt(i: number, px: number, py: number): Promise<TextEdit | null> {
  const p = pages[i];
  if (!p) return null;
  const lines = await ensureLines(i);
  const hit = lines.find(
    (L) =>
      px >= L.x - 2 && px <= L.x + L.w + 2 && py >= L.yTop - 2 && py <= L.yTop + L.size * 1.24 + 2,
  );
  if (!hit) {
    api.hooks.toast("No text there — double-click a printed line to rewrite it", "warn");
    return null;
  }
  const pad = Math.max(1.5, hit.size * 0.12);
  const ed: TextEdit = {
    type: "text",
    x: hit.x,
    y: hit.yTop,
    // room to the right margin so a longer rewrite doesn't wrap early;
    // the export cover sizes itself to the text actually typed, not to this box
    w: Math.max(60, p.w - hit.x - 24),
    text: hit.text,
    size: Math.round(hit.size * 10) / 10,
    color: "#111111",
    font: hit.font, // the fallback face, if the original can't carry a glyph
    orig: hit.orig, // the page's own font — kept unless the user switches away
    useOrig: true,
    // offsets, not absolutes, so the cover travels when the box is dragged
    cover: { dx: -pad, dy: -pad, w: hit.w + pad * 2, h: hit.size * 1.24 + pad * 2 },
  };
  pushEdit(i, ed);
  select(ed, i);
  const el = nodeOf.get(ed);
  if (el) {
    el.focus();
    const s = window.getSelection()!;
    s.selectAllChildren(el);
    s.collapseToEnd();
  }
  return ed;
}

function onDblClick(e: MouseEvent): void {
  const pageEl = (e.target as Element).closest<HTMLElement>(".pe-page");
  if (!pageEl || (e.target as Element).closest(".pe-edit")) return;
  const i = +pageEl.dataset.n!,
    p = pages[i]!;
  const r = p.layer.getBoundingClientRect();
  editLineAt(i, (e.clientX - r.left) / zoom, (e.clientY - r.top) / zoom);
}

/* ---------- pointer interactions (delegated on #peDeck) ---------- */

const dropFocus = (): void => {
  // preventDefault below suppresses native focus moves, so a still-focused
  // text box would keep swallowing keystrokes — blur it by hand.
  const a = document.activeElement as HTMLElement | null;
  if (a && a.isContentEditable) a.blur();
};

function onDown(e: PointerEvent): void {
  if (e.button !== 0) return;
  const pageEl = (e.target as Element).closest<HTMLElement>(".pe-page");
  if (!pageEl) return;
  const i = +pageEl.dataset.n!,
    p = pages[i]!;
  const r = p.layer.getBoundingClientRect();
  const px = (e.clientX - r.left) / zoom,
    py = (e.clientY - r.top) / zoom;
  const handle = (e.target as Element).closest(".pe-resize");
  const editEl = (e.target as Element).closest<HTMLElement>(".pe-edit");

  if (handle && editEl) {
    const ed = elToEdit.get(editEl)!;
    select(ed, i);
    drag = { kind: "resize", i, ed, sx: px, sy: py, ow: ed.w, oh: ed.h || 0 };
    els.deck.setPointerCapture(e.pointerId);
    e.preventDefault();
    dropFocus();
  } else if (editEl) {
    const ed = elToEdit.get(editEl)!;
    select(ed, i);
    const editing =
      ed.type === "text" &&
      (document.activeElement === editEl || editEl.contains(document.activeElement));
    if (tool === "select" && !editing) {
      drag = { kind: "move", i, ed, sx: px, sy: py, ox: ed.x, oy: ed.y, moved: false };
      els.deck.setPointerCapture(e.pointerId);
      e.preventDefault(); // a drag must not start native text selection; clean clicks re-focus on up
      dropFocus();
    }
  } else if (tool === "text") {
    e.preventDefault(); // default mousedown focus would steal the caret placed below
    const ed: TextEdit = {
      type: "text",
      x: px,
      y: py,
      w: Math.max(40, Math.min(180, p.w - px - 6)),
      text: "",
      size: clamp(parseFloat(els.size.value) || 12, 6, 96),
      color: els.color.value || "#111111",
      font: els.font.value || "helv",
    };
    pushEdit(i, ed);
    select(ed, i);
    const el = nodeOf.get(ed);
    if (el) el.focus();
  } else if (tool === "whiteout" || tool === "highlight") {
    e.preventDefault();
    dropFocus();
    const ed: BoxEdit = { type: tool as "whiteout" | "highlight", x: px, y: py, w: 0, h: 0 };
    pushEdit(i, ed);
    drag = { kind: "draw", i, ed, sx: px, sy: py };
    els.deck.setPointerCapture(e.pointerId);
  } else if (tool === "image") {
    pendingImg = { i, x: px, y: py };
    els.imgInput.value = "";
    els.imgInput.click();
  } else {
    deselect();
  }
}

function onMove(e: PointerEvent): void {
  if (!drag) return;
  const p = pages[drag.i]!,
    ed = drag.ed;
  const r = p.layer.getBoundingClientRect();
  const px = clamp((e.clientX - r.left) / zoom, 0, p.w);
  const py = clamp((e.clientY - r.top) / zoom, 0, p.h);
  if (drag.kind === "move") {
    const dx = px - drag.sx,
      dy = py - drag.sy;
    if (!drag.moved && Math.hypot(dx, dy) * zoom > 3) drag.moved = true;
    if (!drag.moved) return;
    ed.x = clamp(drag.ox + dx, 8 - ed.w, p.w - 8); // keep at least a sliver on-page
    ed.y = clamp(drag.oy + dy, 0, p.h - 8);
  } else if (drag.kind === "resize") {
    ed.w = Math.max(ed.type === "text" ? 40 : 12, drag.ow + (px - drag.sx));
    if (ed.type !== "text") ed.h = Math.max(12, drag.oh + (py - drag.sy));
  } else {
    // draw
    ed.x = Math.min(drag.sx, px);
    ed.y = Math.min(drag.sy, py);
    ed.w = Math.abs(px - drag.sx);
    ed.h = Math.abs(py - drag.sy);
  }
  place(ed);
}

function onUp(e: PointerEvent): void {
  const d = drag;
  drag = null;
  if (!d) return;
  if (d.kind === "draw" && (d.ed.w < 4 || d.ed.h! < 4)) {
    removeEdit(d.i, d.ed); // an accidental twitch is not an edit
    return;
  }
  if (d.kind === "move" && !d.moved) {
    // A clean click on an unfocused text box: hand it the caret we withheld.
    if (d.ed.type === "text" && e.type !== "pointercancel") nodeOf.get(d.ed)?.focus();
    return;
  }
  if (d.kind === "draw") select(d.ed, d.i);
  dirty = true;
  syncLayer(d.i);
}

function onKey(e: KeyboardEvent): void {
  if (!opened || !document.body.classList.contains("pdf-mode")) return;
  const a = document.activeElement as HTMLElement | null;
  if (a && /^(INPUT|SELECT|TEXTAREA)$/.test(a.tagName)) return;
  if (e.key === "Escape") {
    if (a && a.isContentEditable) a.blur();
    deselect();
  } else if ((e.key === "Delete" || e.key === "Backspace") && sel) {
    const el = nodeOf.get(sel);
    if (sel.type === "text" && el && (a === el || el.contains(a))) return; // typing, not deleting the box
    e.preventDefault();
    removeEdit(selPage, sel);
  }
}

/* ---------- image tool ---------- */

async function onImageFile(): Promise<void> {
  const f = els.imgInput.files && els.imgInput.files[0];
  const at = pendingImg;
  pendingImg = null;
  if (!f || !at || !pages[at.i]) return;
  if (!/^image\/(png|jpeg)$/.test(f.type)) {
    api.hooks.toast("PNG or JPEG images only", "warn");
    return;
  }
  try {
    const dataUrl = await new Promise<string>((res, rej) => {
      const rd = new FileReader();
      rd.onload = () => res(rd.result as string);
      rd.onerror = () => rej(new Error("read failed"));
      rd.readAsDataURL(f);
    });
    const img = new Image();
    await new Promise((res, rej) => {
      img.onload = res;
      img.onerror = rej;
      img.src = dataUrl;
    });
    const p = pages[at.i]!;
    // CSS px → pt, then cap at 40% of the page width.
    let w = Math.max(12, img.naturalWidth * 0.75);
    if (w > p.w * 0.4) w = p.w * 0.4;
    const h = Math.max(12, (w * img.naturalHeight) / img.naturalWidth);
    const ed: ImageEdit = {
      type: "image",
      w,
      h,
      dataUrl,
      kind: f.type === "image/png" ? "png" : "jpg",
      x: clamp(at.x, 0, Math.max(0, p.w - w)),
      y: clamp(at.y, 0, Math.max(0, p.h - h)),
    };
    pushEdit(at.i, ed);
    select(ed, at.i);
  } catch {
    api.hooks.toast("Could not read that image", "warn");
  }
}

/* ---------- zoom ---------- */

function applyZoom(now: boolean): void {
  if (els.zoomPct) els.zoomPct.textContent = Math.round(zoom * 100) + "%";
  onZoom?.(zoom);
  for (let i = 0; i < pages.length; i++) {
    sizePage(i);
    syncLayer(i);
  }
  // The stretched canvases hold the fort until the debounced re-render.
  clearTimeout(zoomTimer);
  const repaint = () => {
    for (let i = 0; i < pages.length; i++) paint(i).catch(() => {});
  };
  if (now) repaint();
  // window.setTimeout: identical at runtime; keeps the number type when a
  // consumer program carries @types/node (the web app does).
  else zoomTimer = window.setTimeout(repaint, 150);
}

function setZoom(z: number): void {
  z = clamp(Math.round(z * 100) / 100, 0.5, 3);
  if (!opened || z === zoom) return;
  zoom = z;
  applyZoom(false);
}

/** The scale at which the widest page fits the scroller, minus its gutters —
    the studio's "Fit", brought to the bench (ledger I4). */
function fitZoom(): number {
  const scroll = els?.scroll as HTMLElement | undefined;
  const widest = pages.reduce((w, p) => Math.max(w, p?.w ?? 0), 0);
  if (!scroll || !widest) return zoom;
  const avail = scroll.clientWidth - 48;
  /* 1.35 is the studio's own fit cap: past that a small page stops being
     "fitted" and starts being magnified, and the two modes should mean the
     same thing by the same word (ledger I4). */
  return clamp(Math.round((avail / widest) * 100) / 100, 0.5, 1.35);
}

/* A host chrome that renders its own cluster needs to know the level. */
let onZoom: ((z: number) => void) | null = null;

/* ---------- one-time DOM binding ---------- */

function bindOnce(): void {
  if (bound) return;
  bound = true;
  els = {
    root: $("pdfEditor"),
    name: $("peName"),
    pages: $("pePages"),
    tools: [...document.querySelectorAll("#peTools .pe-tool")],
    font: $("peFont"),
    size: $("peSize"),
    color: $("peColor"),
    zoomOut: $("peZoomOut"),
    zoomPct: $("peZoomPct"),
    zoomIn: $("peZoomIn"),
    scroll: $("peScroll"),
    deck: $("peDeck"),
    imgInput: $("peImgInput"),
  };
  for (const b of els.tools) b.addEventListener("click", () => setTool(b.dataset.tool));
  const restyle = (fn: (ed: TextEdit) => void): void => {
    if (!sel || sel.type !== "text") return; // unselected, the controls are just defaults
    fn(sel);
    dirty = true;
    syncLayer(selPage);
  };
  els.font.addEventListener("change", () =>
    restyle((ed) => {
      const v = els.font.value;
      if (v === "orig") {
        if (ed.orig) ed.useOrig = true;
        else els.font.value = ed.font; // nothing original to return to
      } else {
        ed.useOrig = false;
        ed.font = v;
      }
    }),
  );
  els.size.addEventListener("input", () =>
    restyle((ed) => {
      ed.size = clamp(parseFloat(els.size.value) || 12, 6, 96);
    }),
  );
  els.color.addEventListener("input", () =>
    restyle((ed) => {
      ed.color = els.color.value;
    }),
  );
  /* The bar's own buttons are optional: a host chrome may mount its own zoom
     cluster and drive setZoom/fitZoom instead (ledger I4 — one instrument,
     one behaviour, in both modes). */
  els.zoomIn?.addEventListener("click", () => setZoom(zoom + 0.1));
  els.zoomOut?.addEventListener("click", () => setZoom(zoom - 0.1));
  els.scroll.addEventListener(
    "wheel",
    (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      setZoom(zoom + (e.deltaY < 0 ? 0.1 : -0.1));
    },
    { passive: false },
  );
  els.imgInput.addEventListener("change", onImageFile);
  els.deck.addEventListener("pointerdown", onDown);
  els.deck.addEventListener("pointermove", onMove);
  els.deck.addEventListener("pointerup", onUp);
  els.deck.addEventListener("pointercancel", onUp);
  els.deck.addEventListener("dblclick", onDblClick);
  document.addEventListener("keydown", onKey);
}

function setTool(t: string): void {
  tool = t;
  for (const b of els.tools) b.classList.toggle("on", b.dataset.tool === t);
}

/* ---------- open / close ---------- */

async function open(buf: ArrayBuffer, fname?: string): Promise<void> {
  bindOnce();
  if (opened || task) await close();
  const g = ++gen;
  // pdf.js hands its buffer to the (fake) worker, which may detach it —
  // export needs the original bytes intact, so both sides get a copy.
  bytes = buf.slice(0);
  name = fname || "document.pdf";
  // Cast pins this package's own PdfJsLib view: when a program also loads
  // @docforge/importers, its ambient `var PdfImport` wins declaration order
  // and the return type would otherwise resolve against the wrong interface.
  const pdfjs = (await PdfImport.ensureLib()) as unknown as PdfJsLib;
  // fontExtraProperties keeps each font's ToUnicode map on the main thread —
  // that map, inverted, is what lets a rewritten line keep the ORIGINAL font.
  task = pdfjs.getDocument({
    data: new Uint8Array(buf.slice(0)),
    isEvalSupported: false,
    useSystemFonts: true,
    fontExtraProperties: true,
  });
  try {
    doc = await task.promise;
  } catch (err) {
    task = null;
    if ((err as any)?.name === "PasswordException") {
      throw new Error("This PDF is password-protected — remove the password and try again.");
    }
    throw err;
  }
  if (gen !== g) return; // closed while loading
  edits.clear();
  revCache.clear();
  dirty = false;
  sel = null;
  selPage = -1;
  drag = null;
  pendingImg = null;
  setTool("select");
  els.name.textContent = name;
  els.pages.textContent = doc.numPages + (doc.numPages === 1 ? " page" : " pages");

  pages = [];
  for (let i = 1; i <= doc.numPages; i++) {
    const pg = await doc.getPage(i);
    if (gen !== g) return;
    const vp = pg.getViewport({ scale: 1 });
    // el/canvas/layer are attached in the DOM-building loop just below.
    pages.push({ pg, w: vp.width, h: vp.height, renderTask: null } as PageState);
  }
  els.deck.innerHTML = "";
  for (let i = 0; i < pages.length; i++) {
    const p = pages[i]!;
    p.el = document.createElement("div");
    p.el.className = "pe-page";
    p.el.dataset.n = i as unknown as string;
    p.el.style.position = "relative"; // geometry must hold even before app.css does
    p.canvas = document.createElement("canvas");
    p.canvas.style.display = "block";
    p.layer = document.createElement("div");
    p.layer.className = "pe-layer";
    Object.assign(p.layer.style, { position: "absolute", left: "0", top: "0" });
    p.el.append(p.canvas, p.layer);
    els.deck.appendChild(p.el);
  }
  // Fit-width by default, but never open past 150% — reading zoom, not loupe zoom.
  const avail = (els.scroll.clientWidth || document.documentElement.clientWidth) - 48;
  zoom = clamp(Math.round((avail / pages[0]!.w) * 100) / 100, 0.5, 1.5);
  opened = true;
  applyZoom(true);
}

async function close(): Promise<void> {
  gen++;
  opened = false;
  for (const p of pages) {
    if (p.renderTask) {
      try {
        p.renderTask.cancel();
      } catch {
        /* settled */
      }
    }
  }
  const t = task,
    d = doc;
  task = null;
  doc = null;
  bytes = null;
  name = "";
  pages = [];
  edits.clear();
  revCache.clear();
  dirty = false;
  sel = null;
  selPage = -1;
  drag = null;
  pendingImg = null;
  clearTimeout(zoomTimer);
  if (els) els.deck.innerHTML = "";
  if (t) {
    // v6 keeps destroy() on the loading task; older builds had it on the proxy.
    try {
      await t.destroy();
    } catch {
      try {
        await (d && d.destroy());
      } catch {
        /* already torn down */
      }
    }
  }
}

/* ---------- export ---------- */

function hexRgb(hex: string, rgb: (r: number, g: number, b: number) => PdfLibRGB): PdfLibRGB {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  const n = m ? parseInt(m[1]!, 16) : 0;
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

function wrapWidth(text: string, widthOf: (s: string) => number, maxW: number): string[] {
  const out: string[] = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const words = raw.split(/\s+/).filter(Boolean);
    if (!words.length) {
      out.push("");
      continue;
    }
    let line = "";
    for (const w of words) {
      const cand = line ? line + " " + w : w;
      if (line && widthOf(cand) > maxW) {
        out.push(line);
        line = w;
      } else line = cand;
    }
    out.push(line);
  }
  return out;
}

function wrapLines(
  text: string,
  font: { widthOfTextAtSize(s: string, size: number): number },
  size: number,
  maxW: number,
): string[] {
  // Un-encodable glyphs blow up measurement too, not just drawing.
  return wrapWidth(
    text,
    (s) => {
      try {
        return font.widthOfTextAtSize(s, size);
      } catch {
        return font.widthOfTextAtSize(s.replace(/[^\x20-\xFF]/g, "?"), size);
      }
    },
    maxW,
  );
}

async function exportPdf(): Promise<{ blob: Blob; name: string }> {
  const {
    PDFDocument,
    StandardFonts,
    rgb,
    PDFName,
    PDFDict,
    PDFRef,
    PDFHexString,
    pushGraphicsState,
    popGraphicsState,
    beginText,
    endText,
    showText,
    setFontAndSize,
    setFillingRgbColor,
    rotateAndSkewTextRadiansAndTranslate,
  } = await lib();
  let out: any;
  try {
    out = await PDFDocument.load(bytes!);
  } catch (err) {
    api.hooks.toast("Could not rebuild this PDF — it may be encrypted", "warn");
    throw err;
  }
  const fonts = new Map<string, any>();
  const getFont = async (k: string) => {
    let f = fonts.get(k);
    if (!f) {
      f = await out.embedFont(StandardFonts[PDF_FONT[k]!] || StandardFonts.Helvetica);
      fonts.set(k, f);
    }
    return f;
  };
  const images = new Map<string, any>();
  const pageArr = out.getPages();
  for (const [i, list] of edits) {
    const page = pageArr[i];
    if (!page || !list.length) continue;
    const { height: H } = page.getSize();
    // Screen coords are top-left; pdf-lib's are bottom-left: y_pdf = H - y - h.
    // Whiteout under everything, text on top, so a box over a whiteout survives.
    for (const ed of list.filter((x): x is BoxEdit => x.type === "whiteout")) {
      page.drawRectangle({
        x: ed.x,
        y: H - ed.y - ed.h,
        width: ed.w,
        height: ed.h,
        color: rgb(1, 1, 1),
      });
    }
    /* This page's font resources, keyed by BaseFont name (sans slash) — the
       bridge from pdf.js's idea of a font to a name the content stream can
       select. A rewrite whose font appears here keeps the ORIGINAL face. */
    const resFonts = new Map<string, ResFont>();
    try {
      const res = page.node.Resources();
      let fd = res && res.get(PDFName.of("Font"));
      if (fd instanceof PDFRef) fd = out.context.lookup(fd);
      if (fd instanceof PDFDict) {
        for (const [key, val] of fd.entries()) {
          const d = val instanceof PDFRef ? out.context.lookup(val) : val;
          const base = d && d.get && d.get(PDFName.of("BaseFont"));
          const sub = d && d.get && d.get(PDFName.of("Subtype"));
          if (base)
            resFonts.set(base.asString().slice(1), {
              key,
              type0: !!sub && sub.asString() === "/Type0",
            });
        }
      }
    } catch {
      /* no readable resources — every rewrite falls back */
    }

    /* Lay out each text edit once: native (original font resource, glyphs
       encoded through the inverted ToUnicode map) when every character
       exists in the embedded subset, else the standard-face path. */
    const layout = new Map<TextEdit, NativeLayout | null>();
    let fellBack = false;
    for (const ed of list.filter((x): x is TextEdit => x.type === "text")) {
      const wantOrig = ed.orig && ed.useOrig !== false;
      const rsrc = wantOrig ? resFonts.get(ed.orig!.face) : null;
      const rev = rsrc ? revMapFor(i, ed.orig!.loadedName) : null;
      let native: NativeLayout | null = null;
      if (rsrc && rev) {
        const measurable = fontFaceUsable(ed.orig!.loadedName);
        const widthOf = measurable
          ? (s: string) => measureNative(ed.orig!.loadedName, ed.size, s)
          : null;
        const lines = widthOf ? wrapWidth(ed.text, widthOf, ed.w) : String(ed.text).split(/\r?\n/);
        const hexes = lines.map((ln) => (ln ? encodeWith(rev, rsrc.type0, ln) : ""));
        if (hexes.every((h) => h !== null)) {
          const needW =
            widthOf && lines.length
              ? Math.max(...lines.map((ln) => (ln ? widthOf(ln) : 0)))
              : ed.cover
                ? ed.cover.w
                : ed.w;
          native = { rsrc, lines, hexes, needW };
        }
      }
      if (wantOrig && !native) fellBack = true;
      layout.set(ed, native);
    }
    if (fellBack) {
      api.hooks.toast(
        "Some characters aren't in this PDF's embedded font — those lines use the closest standard face",
        "warn",
      );
    }

    // Rewritten lines: the cover hides the original print before any new ink
    // lands. It spans the original line's extent or the new text's measured
    // width, whichever is wider — never the whole editing box, which reaches
    // to the margin and would wipe a second column.
    const wrapped = new Map<TextEdit, string[]>();
    for (const ed of list.filter(
      (x): x is TextEdit & { cover: Cover } => x.type === "text" && !!x.cover,
    )) {
      const c = ed.cover;
      const nat = layout.get(ed);
      let lines: string[], needW: number;
      if (nat) {
        lines = nat.lines;
        needW = nat.needW;
      } else {
        const font = await getFont(ed.font);
        lines = wrapLines(ed.text, font, ed.size, ed.w);
        wrapped.set(ed, lines);
        needW = 0;
        for (const ln of lines) {
          try {
            needW = Math.max(needW, font.widthOfTextAtSize(ln, ed.size));
          } catch {
            needW = Math.max(
              needW,
              font.widthOfTextAtSize(ln.replace(/[^\x20-\xFF]/g, "?"), ed.size),
            );
          }
        }
      }
      page.drawRectangle({
        x: ed.x + c.dx,
        y: H - (ed.y + c.dy) - Math.max(c.h, lines.length * ed.size * 1.25),
        width: Math.max(c.w, needW + 3),
        height: Math.max(c.h, lines.length * ed.size * 1.25 + (ed.y - (ed.y + c.dy)) * 2),
        color: rgb(1, 1, 1),
      });
    }
    for (const ed of list.filter((x): x is ImageEdit => x.type === "image")) {
      let img = images.get(ed.dataUrl);
      if (!img) {
        img = ed.kind === "png" ? await out.embedPng(ed.dataUrl) : await out.embedJpg(ed.dataUrl);
        images.set(ed.dataUrl, img);
      }
      page.drawImage(img, { x: ed.x, y: H - ed.y - ed.h, width: ed.w, height: ed.h });
    }
    for (const ed of list.filter((x): x is BoxEdit => x.type === "highlight")) {
      const box = {
        x: ed.x,
        y: H - ed.y - ed.h,
        width: ed.w,
        height: ed.h,
        color: rgb(0.96, 0.84, 0.04),
      };
      // Multiply keeps the text legible under the tint (pdf-lib ≥1.17);
      // if this build rejects the option, plain translucency will do.
      try {
        page.drawRectangle({ ...box, blendMode: "Multiply" });
      } catch {
        page.drawRectangle({ ...box, opacity: 0.35 });
      }
    }
    for (const ed of list.filter((x): x is TextEdit => x.type === "text")) {
      const color = hexRgb(ed.color, rgb);
      const nat = layout.get(ed);
      if (nat) {
        // The page's own font: select its resource and show raw charcodes.
        for (let li = 0; li < nat.lines.length; li++) {
          if (!nat.hexes[li]) continue;
          page.pushOperators(
            pushGraphicsState(),
            beginText(),
            setFillingRgbColor(color.red, color.green, color.blue),
            setFontAndSize(nat.rsrc.key, ed.size),
            rotateAndSkewTextRadiansAndTranslate(
              0,
              0,
              0,
              ed.x,
              H - ed.y - ed.size * 0.83 - li * ed.size * 1.25,
            ),
            showText(PDFHexString.of(nat.hexes[li]!)),
            endText(),
            popGraphicsState(),
          );
        }
        continue;
      }
      const font = await getFont(ed.font);
      const lines = wrapped.get(ed) || wrapLines(ed.text, font, ed.size, ed.w);
      for (let li = 0; li < lines.length; li++) {
        if (!lines[li]) continue;
        // 0.83 ≈ ascent fraction: drops the baseline so print lands where the screen box implied.
        const opts = {
          x: ed.x,
          y: H - ed.y - ed.size * 0.83 - li * ed.size * 1.25,
          size: ed.size,
          font,
          color,
        };
        try {
          page.drawText(lines[li], opts);
        } catch {
          // The standard fonts speak WinAnsi only — swap what they can't encode.
          try {
            page.drawText(lines[li]!.replace(/[^\x20-\xFF]/g, "?"), opts);
          } catch {
            /* even the fallback failed; skip the line */
          }
        }
      }
    }
  }
  const saved = await out.save();
  return {
    blob: new Blob([saved], { type: "application/pdf" }),
    name: name.replace(/\.pdf$/i, "") + "-edited.pdf",
  };
}

/* ---------- public surface ---------- */

export const api = {
  hooks: {
    toast() {},
    async confirm() {
      return true;
    },
  } as PdfEditorHooks,
  open,
  close,
  exportPdf,
  isOpen: () => opened,
  hasEdits: () => dirty && [...edits.values()].some((l) => l.length),
  addEdit: pushEdit, // programmatic path shares the interactive one (QA leans on this)
  /* Zoom, for a host chrome that mounts the studio's own cluster instead of
     the bar's buttons (ledger I4). */
  setZoom,
  getZoom: () => zoom,
  fitZoom: () => setZoom(fitZoom()),
  onZoomChange: (fn: ((z: number) => void) | null) => {
    onZoom = fn;
  },
  getEdits: () => edits,
  editLineAt, // double-click path, callable directly (QA + power users)
  getTextLines: ensureLines,
};
export type PdfEditorApi = typeof api;

/* Named re-exports of the public surface. The `api` object stays the real
   contract — main.js REASSIGNS api.hooks wholesale, so these bindings are
   snapshots taken at module load. */
export const { hooks, isOpen, hasEdits, addEdit, getEdits, getTextLines } = api;
export { close, editLineAt, exportPdf, open };

/* Pure helpers exposed for unit tests only (additive; NOT part of the
   public surface and NOT assigned onto the global). */
export const _internals = { encodeWith, wrapWidth, wrapLines, hexRgb, clamp };
