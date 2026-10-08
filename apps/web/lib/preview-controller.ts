"use client";
/* The press — a faithful port of the classic compose pipeline (src/js/main.js):
   the four Paged handlers, the offscreen compose-and-swap that never blanks the
   deck, page-observer retirement, folio bookkeeping and fit/manual zoom. React
   never reconciles inside the deck; this class owns that DOM outright. */
import type * as PagedNS from "pagedjs";
import { loadDocCss, loadStudio, type StudioRuntime } from "./bootstrap";
import type { LiveEdit, LiveEditView } from "./live-edit";
import type { Settings } from "./settings";
import { installedFontCss } from "./user-fonts";

type PagedPage = { element?: HTMLElement; position?: number; removeListeners?: () => void };
type PagedFlow = { pages?: PagedPage[]; total: number };

let handlersRegistered = false;
let tickerTarget: ((n: number) => void) | null = null;

function registerHandlers(Paged: typeof PagedNS) {
  if (handlersRegistered) return;
  handlersRegistered = true;
  const Handler = Paged.Handler as unknown as new (...a: unknown[]) => object;

  /* Repeat table headers across page breaks. Runs in renderNode, not
     afterPageLayout, so the injected header's height is seen by findBreakToken
     and the last row spills instead of clipping (see classic main.js). */
  class RepeatTableHeader extends Handler {
    renderNode(clone: Node, node: Node) {
      const el = clone && (clone.nodeType === 1 ? (clone as Element) : clone.parentElement);
      if (!el || !el.closest) return;
      const destTable = el.closest("table[data-split-from]");
      if (!destTable) return;
      if (destTable.querySelector(":scope > thead")) return;
      const srcEl = node && (node.nodeType === 1 ? (node as Element) : node.parentElement);
      const srcTable = srcEl?.closest?.("table");
      const srcHead = srcTable?.querySelector(":scope > thead");
      if (!srcHead || !srcHead.childElementCount) return;
      const head = srcHead.cloneNode(true) as Element;
      head.removeAttribute("data-ref");
      head.querySelectorAll("[data-ref]").forEach((n) => n.removeAttribute("data-ref"));
      head.querySelectorAll("[id]").forEach((n) => n.removeAttribute("id"));
      head.setAttribute("data-repeated-header", "");
      destTable.insertBefore(head, destTable.firstChild);
    }
  }

  /* Folios: front matter runs roman, the body runs "Page n of N" counting body
     pages only; contents entries quote the same folio the page prints. */
  const ROMAN: Array<[number, string]> = [
    [10, "x"],
    [9, "ix"],
    [5, "v"],
    [4, "iv"],
    [1, "i"],
  ];
  const roman = (n: number) => {
    let out = "";
    for (const [v, s] of ROMAN)
      while (n >= v) {
        out += s;
        n -= v;
      }
    return out;
  };
  class PageNumbering extends Handler {
    afterRendered(pages: PagedPage[]) {
      const els = [...pages]
        .map((p) => p.element || (p as unknown as HTMLElement))
        .filter((el): el is HTMLElement => !!el && !!(el as HTMLElement).classList);
      const kindOf = (el: HTMLElement) =>
        el.classList.contains("pagedjs_cover_page")
          ? "cover"
          : el.classList.contains("pagedjs_front_page")
            ? "front"
            : "body";
      const kinds = els.map(kindOf);
      const bodyTotal = kinds.filter((k) => k === "body").length;

      const folio = new Map<HTMLElement, string>();
      let f = 0;
      let b = 0;
      els.forEach((el, i) => {
        let num = "";
        let txt = "";
        if (kinds[i] === "front") {
          num = roman(++f);
          txt = num;
        } else if (kinds[i] === "body") {
          num = String(++b);
          txt = `Page ${num} of ${bodyTotal}`;
        }
        folio.set(el, num);
        el.style.setProperty("--df-foot", JSON.stringify(txt));
      });

      const esc = (s: string) => CSS.escape(s);
      els.forEach((el) =>
        el.querySelectorAll('.toc a[href^="#"]').forEach((a) => {
          const id = (a.getAttribute("href") || "").slice(1);
          const host = els.find((pe) => pe.querySelector(`#${esc(id)}`));
          (a as HTMLElement).style.setProperty(
            "--df-tocnum",
            JSON.stringify(host ? folio.get(host) || "" : ""),
          );
        }),
      );
    }
  }

  /* pagedjs 0.4.3 footnote hardening: reclaim reserved strips for removed
     notes; re-measure so fractional-px maths stops clipping descenders. */
  class FootnoteFix extends Handler {
    afterPageLayout(pageElement: HTMLElement) {
      const area = pageElement.querySelector<HTMLElement>(".pagedjs_area");
      const cont = pageElement.querySelector<HTMLElement>(".pagedjs_footnote_content");
      const inner = pageElement.querySelector<HTMLElement>(".pagedjs_footnote_inner_content");
      if (!area || !cont || !inner) return;

      const reserved = parseFloat(area.style.getPropertyValue("--pagedjs-footnotes-height")) || 0;
      const notes = inner.querySelectorAll("[data-note='footnote']");

      if (!notes.length) {
        if (reserved > 0) area.style.setProperty("--pagedjs-footnotes-height", "0px");
        cont.classList.add("pagedjs_footnote_empty");
        return;
      }

      const px = (v: string) => parseFloat(v) || 0;
      const cs = getComputedStyle(cont);
      const chrome =
        px(cs.marginTop) +
        px(cs.marginBottom) +
        px(cs.paddingTop) +
        px(cs.paddingBottom) +
        px(cs.borderTopWidth) +
        px(cs.borderBottomWidth);
      let needed = 0;
      notes.forEach((n) => {
        needed += (n as HTMLElement).getBoundingClientRect().height;
      });
      const want = Math.ceil(needed + chrome);
      if (want > Math.ceil(reserved))
        area.style.setProperty("--pagedjs-footnotes-height", `${want}px`);
      inner.style.height = "auto";
      cont.style.height = "auto";
    }
  }

  /* The composing ticker — truthful progress in the room's own language. */
  class ComposeTicker extends Handler {
    afterPageLayout(_el: HTMLElement, page: { position?: number }) {
      const n = page && typeof page.position === "number" ? page.position + 1 : null;
      if (n && tickerTarget) tickerTarget(n);
    }
  }

  Paged.registerHandlers(
    RepeatTableHeader as never,
    PageNumbering as never,
    FootnoteFix as never,
    ComposeTicker as never,
  );
}

export interface PreviewEvents {
  onPageInfo: (text: string) => void;
  onBusy: (busy: boolean) => void;
  onZoomPct: (pct: number) => void;
  onRendered?: () => void;
}

type RenderRequest = {
  source: string;
  settings: Settings;
  attachments: Record<string, unknown>;
};

type RenderWaiter = {
  resolve: () => void;
  reject: (reason: unknown) => void;
};

export class PreviewController {
  private runtime: StudioRuntime | null = null;
  private previewer: InstanceType<typeof PagedNS.Previewer> | null = null;
  private rendering = false;
  private renderTimer: ReturnType<typeof setTimeout> | null = null;
  /* Keep only the newest render request. Typing can produce several source
     updates while Paged.js is still laying out the previous one; paginating
     every intermediate snapshot makes the UI feel sticky and used to leave
     older callers waiting forever when the pending callback was overwritten. */
  private queuedRender: RenderRequest | null = null;
  private queuedWaiters: RenderWaiter[] = [];
  private pageInfo = "";
  private zoomPercent = -1;
  private scrollFrame: number | null = null;
  private destroyed = false;
  private pageTotal = 0;
  /** The last rendered .content clone — the DOCX exporter's input (classic lastContentEl). */
  lastContentEl: HTMLElement | null = null;
  /** Stage 6: the manuscript's live-edit surface, driven at the classic
      doRender points (flush → captureView → compose → swap → arm →
      restoreView). Optional — every touch is guarded, so the controller
      behaves identically when nothing is attached. */
  private liveEdit: LiveEdit | null = null;
  zoomMode: "fit" | "man" = "fit";
  zoomVal = 1;

  constructor(
    readonly deck: HTMLElement, // #scaleWrap equivalent — pages land here
    readonly scroller: HTMLElement, // the scroll container ("the stone")
    private events: PreviewEvents,
  ) {
    scroller.addEventListener("scroll", this.onScroll, { passive: true });
  }

  private readonly onScroll = () => {
    if (this.destroyed) return;
    if (this.scrollFrame !== null) return;
    this.scrollFrame = requestAnimationFrame(() => {
      this.scrollFrame = null;
      this.updatePageIndicator();
    });
  };

  private publishPageInfo(text: string) {
    if (this.pageInfo === text) return;
    this.pageInfo = text;
    this.events.onPageInfo(text);
  }

  /** Debounced source-edit path — 420ms, the classic cadence. */
  schedule(run: () => Promise<void> | void, delay = 420) {
    if (this.destroyed) return;
    if (this.renderTimer) clearTimeout(this.renderTimer);
    this.renderTimer = setTimeout(run, delay);
  }

  attachLiveEdit(le: LiveEdit | null) {
    this.liveEdit = le;
  }

  async render(source: string, settings: Settings, attachments: Record<string, unknown>) {
    if (this.destroyed) return;
    if (this.rendering) {
      return new Promise<void>((resolve, reject) => {
        this.queuedRender = { source, settings, attachments };
        this.queuedWaiters.push({ resolve, reject });
      });
    }
    if (this.renderTimer) {
      clearTimeout(this.renderTimer);
      this.renderTimer = null;
    }
    /* Any manuscript edit still pending reaches the source first (classic
       doRender flushes before Engine.render). The deck's compose() flushes
       before reading the store, making this a no-op on that path; on a
       direct render() call a flush here may re-schedule a trailing compose
       with the fresher source — deliberately left alive, since this pass
       composes the `source` the caller already captured. */
    this.liveEdit?.flush();
    this.rendering = true;
    this.events.onBusy(true);
    tickerTarget = (n) => this.publishPageInfo(`p. ${n}…`);
    // where is the reader, and where is their caret? restored after the swap
    const view: LiveEditView | null = this.liveEdit?.captureView() ?? null;
    try {
      this.runtime ??= await loadStudio();
      const { Engine, Paged } = this.runtime;
      registerHandlers(Paged);
      const docCssText = await loadDocCss();

      const { doc } = Engine.render(
        source,
        settings,
        attachments as Parameters<typeof Engine.render>[2],
      );
      this.lastContentEl = (doc.querySelector(".content")?.cloneNode(true) as HTMLElement) ?? null;
      /* The reader's own typefaces ride in as @font-face rules on the same
         stylesheet, so the preview and the printed PDF draw the real outlines
         rather than a fallback (§8.2). Empty when none are installed. */
      const css = docCssText + Engine.dynamicCss(settings) + installedFontCss();

      /* Compose the new galleys offscreen while the old ones stay on the
         stone — the reader never sees a blank deck and the scroll container
         never collapses. */
      const oldPreviewer = this.previewer;
      const oldStyles = [...document.querySelectorAll("style[data-pagedjs-inserted-styles]")];
      const stage = document.createElement("div");
      stage.style.cssText = "position:absolute;left:-100000px;top:0;";
      if (this.deck.style.zoom) stage.style.zoom = this.deck.style.zoom;
      this.scroller.appendChild(stage);
      this.previewer = new Paged.Previewer();
      const url = URL.createObjectURL(new Blob([css], { type: "text/css" }));
      let flow: PagedFlow;
      try {
        flow = (await this.previewer.preview(doc.outerHTML, [url], stage)) as PagedFlow;
      } finally {
        URL.revokeObjectURL(url);
      }
      if (this.destroyed) {
        try {
          (flow.pages || []).forEach((p) => p.removeListeners?.());
        } catch {}
        stage.remove();
        return;
      }
      /* The flow is final — retire every page's resize observer before live
         edits can mutate the tree (findEndToken crashes on unref'd nodes). */
      try {
        (flow.pages || []).forEach((p) => p.removeListeners?.());
      } catch {}
      this.deck.innerHTML = "";
      while (stage.firstChild) this.deck.appendChild(stage.firstChild);
      stage.remove();
      if (oldPreviewer) {
        try {
          (oldPreviewer as unknown as { polisher: { destroy(): void } }).polisher.destroy();
        } catch {}
      }
      oldStyles.forEach((s) => {
        if (s.isConnected) s.remove();
      });
      this.pageTotal = flow.total;
      this.publishPageInfo(`${flow.total} ${flow.total === 1 ? "page" : "pages"}`);
      this.applyZoom(settings);
      // the classic post-swap order: arm the fresh pages, then put the
      // reader (viewport anchor + caret) back where they were
      this.liveEdit?.arm();
      this.liveEdit?.restoreView(view);
      this.updatePageIndicator();
      this.events.onRendered?.();
    } finally {
      this.rendering = false;
      this.events.onBusy(false);
      tickerTarget = null;
      const next = this.queuedRender;
      const waiters = this.queuedWaiters;
      this.queuedRender = null;
      this.queuedWaiters = [];
      if (next) {
        void this.render(next.source, next.settings, next.attachments).then(
          () => waiters.forEach(({ resolve }) => resolve()),
          (error) => waiters.forEach(({ reject }) => reject(error)),
        );
      }
    }
  }

  /* the folio readout follows the reader: "p. 4 · 12 pages" */
  updatePageIndicator() {
    if (this.destroyed || !this.pageTotal) return;
    const top = this.scroller.getBoundingClientRect().top + 8;
    const pages = this.deck.querySelectorAll(".pagedjs_page");
    let low = 0;
    let high = pages.length;
    while (low < high) {
      const mid = Math.floor((low + high) / 2);
      if ((pages[mid]?.getBoundingClientRect().bottom ?? 0) > top) high = mid;
      else low = mid + 1;
    }
    const cur = Math.min(low + 1, pages.length || 1);
    this.publishPageInfo(`p. ${cur} · ${this.pageTotal} page${this.pageTotal === 1 ? "" : "s"}`);
  }

  applyZoom(settings: Settings) {
    if (!this.runtime) return;
    const { Engine } = this.runtime;
    const pg = Engine.PAGES[settings.page] || Engine.PAGES.A4;
    if (!pg) return;
    const pgPx = (pg.w * 96) / 25.4;
    const avail = this.scroller.clientWidth - 44;
    const z = this.zoomMode === "fit" ? Math.min(1.35, Math.max(0.25, avail / pgPx)) : this.zoomVal;
    if (CSS.supports("zoom", "1")) {
      this.deck.style.zoom = String(z);
      this.deck.style.transform = "";
    } else {
      this.deck.style.transform = `scale(${z})`;
    }
    const percent = Math.round(z * 100);
    if (this.zoomPercent !== percent) {
      this.zoomPercent = percent;
      this.events.onZoomPct(percent);
    }
  }

  setZoom(mode: "fit" | "man", val: number, settings: Settings) {
    this.zoomMode = mode;
    this.zoomVal = val;
    this.applyZoom(settings);
  }

  destroy() {
    this.destroyed = true;
    if (this.renderTimer) clearTimeout(this.renderTimer);
    this.renderTimer = null;
    if (this.scrollFrame !== null) cancelAnimationFrame(this.scrollFrame);
    this.scroller.removeEventListener("scroll", this.onScroll);
    const error = new Error("Preview controller destroyed");
    this.queuedWaiters.forEach(({ reject }) => reject(error));
    this.queuedWaiters = [];
    this.queuedRender = null;
    if (this.previewer) {
      try {
        (this.previewer as unknown as { polisher: { destroy(): void } }).polisher.destroy();
      } catch {}
    }
    document.querySelectorAll("style[data-pagedjs-inserted-styles]").forEach((s) => s.remove());
  }
}
