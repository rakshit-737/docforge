/* ============================================================
   render() — the assembled document: line-map stamping (data-ss /
   data-se, the live-edit contract), cover, doc attributes, GFM
   survival through the lexer/parser pair, meta, read-only islands.
   ============================================================ */
import { describe, expect, it } from "vitest";
import { render } from "../src/index.js";
import { BASE, r } from "./_helpers.js";

describe("the source line map (live-edit contract)", () => {
  it("every top-level block carries its span of ORIGINAL source lines", () => {
    // marked lexes the blank line after a block as its own space token, so
    // each block stamps exactly its own source lines (verified against the
    // classic engine in Chrome).
    const { content } = r("# Title\n\npara one\n\npara two");
    const h = content.querySelector("h1") as HTMLElement;
    const ps = [...content.querySelectorAll("p")] as HTMLElement[];
    expect([h.dataset.ss, h.dataset.se]).toEqual(["0", "0"]);
    expect([ps[0].dataset.ss, ps[0].dataset.se]).toEqual(["2", "2"]);
    expect([ps[1].dataset.ss, ps[1].dataset.se]).toEqual(["4", "4"]);
  });
  it("lifted footnote definitions do not shift the map off the source", () => {
    const { content } = r("para [^1]\n\n[^1]: note text");
    const p = content.querySelector("p") as HTMLElement;
    expect([p.dataset.ss, p.dataset.se]).toEqual(["0", "0"]);
  });
  it("a container block spans its whole ::: range", () => {
    const { content } = r("intro\n\n:::note\nBody.\n:::");
    const co = content.querySelector(".callout") as HTMLElement;
    expect([co.dataset.ss, co.dataset.se]).toEqual(["2", "4"]);
  });
  it("generated wraps inherit the marker's span", () => {
    const { content } = r("[toc]\n\n# H");
    const wrap = content.querySelector(".toc-wrap") as HTMLElement;
    expect([wrap.dataset.ss, wrap.dataset.se]).toEqual(["0", "0"]);
    const h = content.querySelector("h1") as HTMLElement;
    expect([h.dataset.ss, h.dataset.se]).toEqual(["2", "2"]);
  });
  it("a table adopts its caption marker's source line", () => {
    const { content } = r("[table: Cap]\n\n| a |\n|---|\n| 1 |");
    const tb = content.querySelector("table") as HTMLElement;
    expect(tb.dataset.ss).toBe("0");
  });
});

describe("document shell", () => {
  it("doc classes, theme, and language", () => {
    const { doc } = render("x", { ...BASE, justify: true, h1break: true, lang: "de" });
    expect(doc.className).toBe("doc justify h1break");
    expect(doc.dataset.theme).toBe("modern");
    expect(doc.lang).toBe("de");
  });
  it("defaults: no flags, lang en", () => {
    const { doc } = render("x", { ...BASE });
    expect(doc.className).toBe("doc");
    expect(doc.lang).toBe("en");
  });
  it("cover renders from settings and is read-only", () => {
    const { doc } = render("body text", {
      ...BASE,
      cover: true,
      title: "The Title",
      subtitle: "A subtitle",
      kicker: "Kick",
      author: "An Author",
      metaExtra: "Extra line",
      date: "2025-03-31",
    });
    const cover = doc.firstElementChild as HTMLElement;
    expect(cover.matches("section.cover")).toBe(true);
    expect(cover.getAttribute("contenteditable")).toBe("false");
    expect(cover.querySelector(".cv-kicker")?.textContent).toBe("Kick");
    expect(cover.querySelector(".cv-title")?.textContent).toBe("The Title");
    expect(cover.querySelector(".cv-sub")?.textContent).toBe("A subtitle");
    const meta = [...cover.querySelectorAll(".cv-meta > div")];
    expect(meta.map((d) => d.textContent)).toEqual(["An Author", "Extra line", "31 March 2025"]);
  });
  it("no cover flag, no cover; untitled fallback when on", () => {
    expect(render("x", { ...BASE }).doc.querySelector(".cover")).toBeNull();
    const { doc } = render("x", { ...BASE, cover: true });
    expect(doc.querySelector(".cv-title")?.textContent).toBe("Untitled document");
  });
});

describe("gfm survives the lexer/parser pair (the marked.defaults spread)", () => {
  it("tables still parse — the classic regression this comment guards", () => {
    const { content } = r("| a | b |\n|---|---|\n| 1 | 2 |");
    expect(content.querySelector("table td")?.textContent).toBe("1");
  });
  it("strikethrough still parses", () => {
    const { content } = r("~~gone~~");
    expect(content.querySelector("del")?.textContent).toBe("gone");
  });
  it("hardWrap turns lone newlines into <br>; off by default", () => {
    expect(r("a\nb", { hardWrap: true }).content.querySelector("p br")).toBeTruthy();
    expect(r("a\nb").content.querySelector("p br")).toBeNull();
  });
});

describe("meta and read-only islands", () => {
  it("meta counts figures and all heading levels", () => {
    const { meta } = r("# One\n\n#### Four\n\n[screenshot: S]\n\n![Cap](data:x)");
    expect(meta.headings).toBe(2);
    expect(meta.figures).toBe(2);
  });
  it("every generated island refuses the caret; prose does not", () => {
    const sink = [
      "[toc]",
      "",
      "# Head",
      "",
      "prose para [^1] and [@k] and [#fig:f] and $x$",
      "",
      "[^1]: note",
      "[@k]: Key (2000). K.",
      "",
      "[screenshot: S | #fig:f]",
      "",
      "$$y$$",
      "",
      "[pagebreak]",
      "",
      "[references]",
    ].join("\n");
    const { content } = r(sink, { numbered: true });
    const islands = content.querySelectorAll(
      ".toc-wrap, .refs, figure, .math-display, .math-inline, span.footnote, a.xref, span.cite, .hnum, .page-break",
    );
    expect(islands.length).toBeGreaterThanOrEqual(9);
    islands.forEach((el) => {
      expect(el.getAttribute("contenteditable")).toBe("false");
    });
    expect(content.querySelector("h1")?.getAttribute("contenteditable")).toBeNull();
    expect(content.querySelector("p")?.getAttribute("contenteditable")).toBeNull();
  });
});
