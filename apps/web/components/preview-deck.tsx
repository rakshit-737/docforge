"use client";
/* The stone — hosts the Paged.js deck. React renders the containers once and
   never looks inside; the PreviewController owns everything within. */
import { useEffect, useRef, useState } from "react";
import { toast } from "@/lib/find";
import { docHistory } from "@/lib/history";
import { LiveEdit } from "@/lib/live-edit";
import { PreviewController } from "@/lib/preview-controller";
import { useDocStore, useUiStore } from "@/lib/store";

export function PreviewDeck({
  controllerRef,
  onRendered,
}: {
  controllerRef: (c: PreviewController | null) => void;
  onRendered?: () => void;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  const deck = useRef<HTMLDivElement>(null);
  /* False until the press swaps its first galleys in — the skeleton page
     holds the stone so first paint shows paper, not a void. */
  const [pressReady, setPressReady] = useState(false);

  useEffect(() => {
    if (!scroller.current || !deck.current) return;
    const ui = useUiStore.getState();
    const controller = new PreviewController(deck.current, scroller.current, {
      onPageInfo: (t) => useUiStore.getState().setPageInfo(t),
      onBusy: (b) => useUiStore.getState().setBusy(b),
      onZoomPct: (zoomPct) => useUiStore.setState({ zoomPct }),
      onRendered: () => {
        setPressReady(true);
        onRendered?.();
      },
    });
    controller.zoomMode = ui.zoomMode;
    controller.zoomVal = ui.zoomVal;
    controllerRef(controller);

    /* Stage 6 — the manuscript itself is an editing surface. The hooks write
       through the store (a splice, never a clobber) so both panes stay
       downstream of the one source of truth; the press drives the classic
       call points (flush/captureView/arm/restoreView) inside render(). */
    let fromLiveEdit = false;
    const live = new LiveEdit();
    const compose = () => {
      live.flush(); // any pending manuscript edit reaches the source first
      const s = useDocStore.getState();
      return controller.render(s.source, s.settings, s.attachments);
    };
    live.attach(deck.current, {
      scroller: scroller.current,
      getSource: () => useDocStore.getState().source,
      setSource: (_src, splice) => {
        fromLiveEdit = true;
        try {
          useDocStore.getState().spliceSource(splice.from, splice.to, splice.insert);
        } finally {
          fromLiveEdit = false;
        }
      },
      revert: () => {
        toast("That part of the manuscript is generated — edit it from the source panel", "warn");
        void compose();
      },
      // classic scheduleLiveRender: direct manuscript edits keep the DOM
      // current natively, so the rebuild waits for 1300ms of genuine quiet
      editPending: () => controller.schedule(compose, 1300),
      undo: () => docHistory.undo(),
      redo: () => docHistory.redo(),
    });
    controller.attachLiveEdit(live);
    const detachHistory = docHistory.attach();

    /* The classic shell shortcut (main.js ~2309): ONE document history for
       both panes. Focus in the manuscript routes Ctrl+Z / Ctrl+Y (and
       Ctrl+Shift+Z) to the store history — keydown, because the browser only
       emits historyUndo/historyRedo beforeinput while its own CE stacks are
       non-empty. Focus in the editor keeps CodeMirror's keystroke-level
       history (see lib/history.ts for the division of labour). */
    const deckEl = deck.current;
    const onHistoryKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      if (!mod || e.altKey) return;
      const k = e.key.toLowerCase();
      if (k !== "z" && k !== "y") return;
      if (!(e.target instanceof Node) || !deckEl.contains(e.target)) return;
      e.preventDefault();
      live.flush(); // pending manuscript edits reach the source before it moves
      if (k === "y" || e.shiftKey) docHistory.redo();
      else docHistory.undo();
    };
    document.addEventListener("keydown", onHistoryKey);

    /* First composition — render whatever the document holds, but AFTER the
       first paint. The boot compose is the heaviest task the studio runs
       (engine + Paged parse, then full pagination); fired synchronously here
       it blanks the tab for seconds. Two animation frames guarantee the
       chrome and skeleton page are on screen, the timeout yields once more
       so the paint actually commits before the long task starts. */
    let bootCancelled = false;
    let bootTimer: ReturnType<typeof setTimeout> | null = null;
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (bootCancelled) return;
        bootTimer = setTimeout(() => void compose(), 30);
      });
    });

    const unsub = useDocStore.subscribe((s, prev) => {
      if (s.source === prev.source && s.settings === prev.settings) return;
      // Settings changes recompose immediately; source-pane typing waits the
      // classic 420ms; a live-edit splice idles the classic 1300ms.
      const delay = s.settings !== prev.settings ? 60 : fromLiveEdit ? 1300 : 420;
      controller.schedule(compose, delay);
    });

    let resizeFrame = 0;
    const onResize = () => {
      if (resizeFrame) return;
      resizeFrame = requestAnimationFrame(() => {
        resizeFrame = 0;
        if (controller.zoomMode === "fit") controller.applyZoom(useDocStore.getState().settings);
      });
    };
    window.addEventListener("resize", onResize);

    /* Ctrl+wheel zooms the preview (classic main.js:2141); clicking the
       percentage still snaps back to fit. */
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const next = Math.min(
        2,
        Math.max(0.25, (controller.zoomVal || 1) + (e.deltaY < 0 ? 0.1 : -0.1)),
      );
      controller.setZoom("man", next, useDocStore.getState().settings);
      useUiStore.getState().setZoom("man", next);
    };
    scroller.current?.addEventListener("wheel", onWheel, { passive: false });

    const scrollEl = scroller.current;
    return () => {
      bootCancelled = true;
      if (bootTimer) clearTimeout(bootTimer);
      if (resizeFrame) cancelAnimationFrame(resizeFrame);
      window.removeEventListener("resize", onResize);
      scrollEl?.removeEventListener("wheel", onWheel);
      document.removeEventListener("keydown", onHistoryKey);
      unsub();
      detachHistory();
      controller.attachLiveEdit(null);
      live.detach();
      controllerRef(null);
      controller.destroy();
    };
    // both callbacks must be referentially stable (the shell wraps them in useCallback([]))
  }, [controllerRef, onRendered]);

  return (
    <div
      ref={scroller}
      className="relative h-full min-h-0 overflow-auto bg-stone"
      data-preview-scroll=""
    >
      {!pressReady && (
        <div
          className="pointer-events-none absolute inset-0 flex flex-col items-center gap-4 py-6"
          aria-hidden="true"
        >
          <div className="skeleton-page" />
          <p className="font-mono text-ink-3 text-xs">setting type…</p>
        </div>
      )}
      <div ref={deck} className="mx-auto w-fit py-6" data-deck="" />
    </div>
  );
}
