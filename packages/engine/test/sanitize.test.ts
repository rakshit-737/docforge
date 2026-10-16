// @vitest-environment jsdom
/* Security checks use an HTML5 parser, not happy-dom's parity-oriented DOM.
   Inspect the reparsed DOM rather than assuming jsdom would execute a payload. */
import { describe, expect, it } from "vitest";
import { api, sanitizeRawHtml } from "../src/index.js";
import { isSafeImageDataUrl } from "../src/sanitize.js";
import { r } from "./_helpers.js";

const PNG =
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jGHoAAAAASUVORK5CYII=";

function assertPassive(root: Element): void {
  expect(
    root.querySelector(
      "script, style, link, base, meta, iframe, object, embed, form, input, button, select, textarea, svg, math, template, audio, video, source",
    ),
  ).toBeNull();
  for (const el of root.querySelectorAll("*")) {
    expect(el.namespaceURI).toBe("http://www.w3.org/1999/xhtml");
    for (const attr of el.attributes) {
      expect(attr.name).not.toMatch(
        /^(?:on|srcdoc$|srcset$|ping$|formaction$|action$|xlink:|xmlns)/i,
      );
    }
    if (el.hasAttribute("href")) {
      expect(["http:", "https:", "mailto:", "tel:"]).toContain(
        new URL(el.getAttribute("href") as string, "https://example.org/").protocol,
      );
    }
    if (el.hasAttribute("src"))
      expect(el.getAttribute("src")).toMatch(/^data:image\/(?:png|gif|jpe?g|webp|avif);base64,/i);
  }
}

/** Exercise the engine's string -> template sink and a later export/reparse. */
function reparse(raw: string): HTMLDivElement {
  let html = sanitizeRawHtml(raw);
  const root = document.createElement("div");
  for (let i = 0; i < 3; i++) {
    root.innerHTML = html;
    assertPassive(root);
    html = root.innerHTML;
  }
  return root;
}

describe("HTML content policy", () => {
  it("removes active elements and event handlers on otherwise passive elements", () => {
    const raw = [
      '<script>alert(1)</script><iframe srcdoc="<script>alert(1)</script>"></iframe>',
      '<object data="data:text/html,bad"></object><embed src="https://tracker.invalid/">',
      '<base href="https://tracker.invalid/"><meta http-equiv="refresh" content="0;url=https://tracker.invalid/">',
      '<style>@import "https://tracker.invalid/";</style><link rel="stylesheet" href="https://tracker.invalid/">',
      `<img src="${PNG}" onerror="alert(1)" onload="alert(1)">`,
      '<p ONCLICK="alert(1)" onpointerenter="alert(1)">kept</p>',
      '<details open ontoggle="alert(1)"><summary>More</summary>Details</details>',
      '<a href="https://example.org/" ping="https://tracker.invalid/" target="_blank">link</a>',
    ].join("");
    const root = reparse(raw);
    assertPassive(r(raw).content);
    expect(root.querySelector("p")?.textContent).toBe("kept");
    expect(root.querySelector("img")?.getAttribute("src")).toBe(PNG);
    expect(root.querySelector("details")?.hasAttribute("open")).toBe(true);
    expect(root.querySelector("a")?.getAttribute("href")).toBe("https://example.org/");
    expect(root.querySelector("a")?.hasAttribute("target")).toBe(false);
  });

  it.each([
    '<svg onload="alert(1)"><a xlink:href="javascript:alert(1)">x</a><foreignObject><img src=x onerror=alert(1)></foreignObject><animate attributeName=href values="javascript:alert(1)"></animate></svg>',
    '<math><mtext><img src=x onerror=alert(1)></mtext><annotation-xml encoding="text/html"><iframe srcdoc="bad"></iframe></annotation-xml></math>',
    '<template><img src=x onerror=alert(1)><template shadowrootmode="open"><script>alert(1)</script></template></template>',
    '<math><mtext><table><mglyph><style><!--</style><img title="--><img src=x onerror=alert(1)>">',
    '<svg></p><style><g title="</style><img src=x onerror=alert(1)>">',
    "<form><math><mtext></form><form><mglyph><style></math><img src=x onerror=alert(1)>",
    '<noscript><p title="</noscript><img src=x onerror=alert(1)>">',
    "<svg><foreignObject><math><mtext><template><img src=x onerror=alert(1)>",
  ])("rejects foreign/template and mutation-XSS payloads: %s", (payload) => {
    reparse(payload);
    assertPassive(r(payload).content);
  });

  it("does not admit arbitrary data hooks, custom elements or clobbering names", () => {
    const root = reparse(
      '<x-widget onclick="alert(1)">text</x-widget><p is="x-widget" data-action="run" id="__proto__" name="attributes">p</p>',
    );
    expect(root.querySelector("x-widget, [is], [data-action], [name], [id]")).toBeNull();
    expect(root.textContent).toBe("textp");
  });

  it("keeps sanitizeRawHtml out of the historical Engine api key contract", () => {
    expect(Object.keys(api)).toEqual([
      "render",
      "dynamicCss",
      "fontFaceCss",
      "tints",
      "PAGES",
      "MARGINS",
      "FONTS",
      "FACES",
      "EMBEDDED",
      "CUT_FILE",
      "fmtDate",
      "esc",
      "RE_SHOT",
      "WORD_CATALOG",
      "HL_COLORS",
      "sysStack",
      "faceName",
    ]);
  });
});

describe("URL and image policy", () => {
  it.each([
    "javascript:alert(1)",
    "JaVaScRiPt:alert(1)",
    "jav&#x61;script:alert(1)",
    "java&#9;script:alert(1)",
    "java&#10;script:alert(1)",
    "java&#13;script:alert(1)",
    "&Tab;javascript:alert(1)",
    " &#x01;javascript:alert(1)",
    "javascript&colon;alert(1)",
    "vbscript:msgbox(1)",
    "data:text/html,<script>alert(1)</script>",
    "data:image/svg+xml,<svg onload=alert(1)>",
    PNG,
    "blob:https://example.org/opaque",
    "file:///etc/passwd",
    "ftp://example.org/file",
    "custom:run",
  ])("removes unsafe/obfuscated link schemes: %s", (url) => {
    const root = reparse(`<a href="${url}">label</a>`);
    expect(root.querySelector("a")?.hasAttribute("href")).toBe(false);
    expect(root.textContent).toBe("label");
  });

  it.each([
    "https://example.org/a_b?q=1&amp;b=2#part",
    "http://example.org/",
    "mailto:writer@example.org",
    "tel:+123456789",
    "#sec:method",
    "/guide",
    "../guide",
    "./guide",
    "guide/a_b?q=1",
    "//example.org/guide",
  ])("preserves navigational links: %s", (url) => {
    const root = reparse(`<a href="${url}" title="Guide">label</a>`);
    expect(root.querySelector("a")?.getAttribute("href")).toBe(url.replaceAll("&amp;", "&"));
    expect(root.querySelector("a")?.getAttribute("title")).toBe("Guide");
  });

  const UNSAFE_IMAGES: unknown[] = [
    "https://tracker.invalid/pixel",
    "//tracker.invalid/pixel",
    "/authenticated/action",
    "../pixel",
    "blob:https://example.org/opaque",
    "javascript:alert(1)",
    "data:text/html;base64,PHNjcmlwdD4=",
    "data:image/svg+xml;base64,PHN2Zz4=",
    "data:image/svg+xml,<svg onload=alert(1)>",
    "data:image/png;anything;base64,QUJD",
    "data:image/png,not-base64",
    "data:image/png;base64,",
    "data:image/png;base64,QUJD%0a",
    " data:image/png;base64,QUJD",
    null,
    42,
    {},
  ];

  it.each(UNSAFE_IMAGES)("rejects untrusted project attachment URLs: %s", (url) => {
    expect(isSafeImageDataUrl(url)).toBe(false);
    // Deliberately bypass the static type: imported project JSON is untrusted.
    const { content } = r(
      "[screenshot: Cap | img:key]",
      {},
      { key: { dataUrl: url as string, w: 100, h: 50 } },
    );
    expect(content.querySelector("img")).toBeNull();
    expect(content.querySelector(".shot-box")).toBeTruthy();
    expect(content.querySelector("figcaption")?.textContent).toContain("Cap");
  });

  it.each(UNSAFE_IMAGES.filter((v): v is string => typeof v === "string" && !v.startsWith(" ")))(
    "removes unsafe or network-loading raw image sources: %s",
    (url) => {
      const root = reparse(`<img src="${url}" srcset="https://tracker.invalid/2x 2x" alt="Cap">`);
      expect(root.querySelector("img")?.hasAttribute("src")).toBe(false);
      expect(root.querySelector("img")?.hasAttribute("srcset")).toBe(false);
      expect(root.querySelector("img")?.getAttribute("alt")).toBe("Cap");
    },
  );

  it.each(["png", "jpeg", "jpg", "gif", "webp", "avif"])(
    "keeps embedded raster %s images",
    (mime) => {
      const url = `data:image/${mime};base64,QUJD`;
      expect(isSafeImageDataUrl(url)).toBe(true);
      expect(
        reparse(`<img src="${url}" alt="Cap">`).querySelector("img")?.getAttribute("src"),
      ).toBe(url);
      const { content } = r(
        "[screenshot: Cap | img:key | w:60%]",
        {},
        { key: { dataUrl: url, w: 100, h: 50 } },
      );
      const img = content.querySelector("img");
      expect(img?.getAttribute("src")).toBe(url);
      expect(img?.style.width).toBe("60%");
      expect(img?.alt).toBe("Cap");
    },
  );
});

describe("presentation-only inline CSS", () => {
  it.each([
    "background:url(https://tracker.invalid/pixel)",
    "background:url(/authenticated/action)",
    "background:image-set(url(https://tracker.invalid/pixel) 1x)",
    "background:-webkit-image-set('https://tracker.invalid/pixel' 1x)",
    String.raw`background:u\72l(https://tracker.invalid/pixel)`,
    String.raw`b\61ckground:url(https://tracker.invalid/pixel)`,
    "background:u/**/rl(https://tracker.invalid/pixel)",
    "background:var(--payload)",
    "--payload:url(https://tracker.invalid/pixel)",
    "list-style-image:url(https://tracker.invalid/pixel)",
    "cursor:url(https://tracker.invalid/pixel),auto",
    "border-image-source:url(https://tracker.invalid/pixel)",
    "filter:url(https://tracker.invalid/pixel)",
    "@import 'https://tracker.invalid/style.css'",
    "width:expression(alert(1))",
    "behavior:url(evil.htc)",
    "-moz-binding:url(evil.xml#x)",
    "font-family:Test;src:url(https://tracker.invalid/font.woff2)",
    "color:red;position:fixed;inset:0",
    "color:red!important;background:url(https://tracker.invalid/pixel)",
  ])("drops styles outside the positive grammar: %s", (style) => {
    const root = reparse(`<span style="${style}">kept</span>`);
    expect(root.querySelector("span")?.hasAttribute("style")).toBe(false);
    expect(root.textContent).toBe("kept");
  });

  it("preserves safe inline formatting and dialect metadata byte-for-byte", () => {
    const html =
      '<span class="dfspan" data-font="Georgia" data-color="ee1111" data-bg="ffff00" data-size="14" data-u="1" data-sc="1" data-caps="1" style="color:#e11;background:#ff0;font-size:14pt;font-family:&quot;Georgia&quot;, Georgia, serif;text-decoration:underline;font-variant:small-caps;text-transform:uppercase;">text <em>em</em></span>';
    const template = document.createElement("template");
    template.innerHTML = html;
    expect(sanitizeRawHtml(html)).toBe(template.innerHTML);
    expect(
      reparse('<p style="color: red; text-align: center; margin: 0 auto">kept</p>')
        .querySelector("p")
        ?.getAttribute("style"),
    ).toBe("color: red; text-align: center; margin: 0 auto");
  });
});

describe("all manuscript insertion paths", () => {
  it.each(["ieee", "apa", "apa7"])(
    "sanitizes citation definition HTML, including auto-appended references (%s)",
    (citeStyle) => {
      for (const marker of ["", "\n\n[references]"]) {
        const { content } = r(
          [
            "Cited [@key].",
            "",
            '[@key]: Writer (2024). *Title*. <img src="https://tracker.invalid/pixel" onerror="alert(1)"> <a href="java&#9;script:alert(1)">bad</a> <span style="background:url(https://tracker.invalid/pixel)">styled</span> <template><script>alert(1)</script></template> [Safe](https://example.org/).',
            marker,
          ].join("\n"),
          { citeStyle },
        );
        assertPassive(content);
        expect(content.querySelector(".refs em")?.textContent).toBe("Title");
        expect(content.querySelector(".refs img")?.hasAttribute("src")).toBe(false);
        expect(content.querySelector(".refs [style]")).toBeNull();
        expect(content.querySelector('.refs a[href="https://example.org/"]')?.textContent).toBe(
          "Safe",
        );
      }
    },
  );

  it("sanitizes raw content nested in callouts and footnote definitions", () => {
    const { content } = r(
      ':::note\nText [^n] <img src=x onerror=alert(1)>\n:::\n\n[^n]: *Note* <svg onload=alert(1)></svg><a href="data:text/html,bad">bad</a>',
    );
    assertPassive(content);
    expect(content.querySelector(".callout .footnote em")?.textContent).toBe("Note");
  });

  it("does not trust TeX HTML/URL commands in otherwise preserved math carriers", () => {
    const { content } = r(
      String.raw`$\href{javascript:alert(1)}{bad}$ $\includegraphics{https://tracker.invalid/pixel}$ $\htmlStyle{background:url(https://tracker.invalid/pixel)}{bad}$`,
    );
    expect(content.querySelectorAll(".math-inline .katex")).toHaveLength(3);
    expect(content.querySelector("a[href], img, [style*='tracker.invalid']")).toBeNull();
  });

  it("escapes raw/dialect IDs when postprocessing TOC and figure/table lists", () => {
    const id = 'item" onclick="alert(1)';
    const { content } = r(
      [
        "[toc]",
        "",
        "[lof]",
        "",
        "[lot]",
        "",
        `<h2 id="${id.replaceAll('"', "&quot;")}">Heading</h2>`,
        "",
        `[screenshot: Cap | #${id}]`,
        "",
        `[table: Cap | #${id}]`,
        "",
        "| a |",
        "|---|",
        "| 1 |",
        "",
        '<a class="xref" href="#bad&quot;]\\">reference</a>',
      ].join("\n"),
    );
    expect(content.querySelector("[onclick]")).toBeNull();
    expect(content.querySelectorAll(".toc-wrap a")).toHaveLength(3);
    for (const a of content.querySelectorAll(".toc-wrap a")) {
      expect(a.hasAttribute("onclick")).toBe(false);
    }
    expect(content.querySelector(".list-wrap a")?.getAttribute("href")).toContain('" onclick="');
    expect(content.querySelector("a.xref")?.textContent).toBe("??");
  });
});
