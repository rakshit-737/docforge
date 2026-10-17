/* ============================================================
   Phase-5 gate — the npm builds, consumed the way npm users do.

     corepack pnpm --filter "@docforge/engine" run build
     corepack pnpm --filter "@docforge/mathml-omml" run build
     node qa/dist-consume.mjs

   The workspace eats each package's TypeScript source directly, so nothing
   else in this repo would notice if the published dist were broken — a
   missing .js on a relative specifier, say, which Node's ESM resolver
   rejects and every bundler forgives. This imports dist/index.js from plain
   Node, with no bundler and no transpiler, and renders.
   ============================================================ */
import { createRequire } from "node:module";
import { pathToFileURL } from "node:url";

/* marked/katex/highlight.js/happy-dom are the ENGINE package's dev
   dependencies, not the root's — resolve them from there, exactly as a
   consumer resolves its own copies. */
const req = createRequire(new URL("../packages/engine/package.json", import.meta.url));
const dep = (name) => import(pathToFileURL(req.resolve(name)).href);
const { Window } = await dep("happy-dom");
const { Marked } = await dep("marked");
const katex = (await dep("katex")).default;
const hljs = (await dep("highlight.js")).default;

const win = new Window({ url: "https://example.com" });
/* The globals the engine reads, mirroring packages/engine/test/setup.ts.
   Node 24 defines `navigator` as a getter-only global, so each assignment is
   made through defineProperty rather than a plain write. */
for (const k of [
  "document",
  "Node",
  "NodeFilter",
  "DOMParser",
  "XMLSerializer",
  "Element",
  "HTMLElement",
  "Text",
  "window",
  "navigator",
  "getComputedStyle",
]) {
  Object.defineProperty(globalThis, k, { value: win[k], configurable: true, writable: true });
}
globalThis.marked = new Marked();
globalThis.katex = katex;
globalThis.hljs = hljs;

const fails = [];
const check = (n, ok, extra = "") => {
  console.log(`${ok ? "ok  " : "FAIL"} ${n}${extra ? ` — ${extra}` : ""}`);
  if (!ok) fails.push(n);
};

const engine = await import(new URL("../packages/engine/dist/index.js", import.meta.url));
check("engine dist imports under plain Node ESM", typeof engine.render === "function");

const settings = {
  title: "Dist Smoke",
  subtitle: "",
  author: "",
  kicker: "",
  metaExtra: "",
  date: "2026-09-04",
  theme: "modern",
  accent: "#2563eb",
  page: "A4",
  margins: "normal",
  cover: false,
  header: true,
  pageNums: true,
  numbered: false,
  justify: false,
  h1break: false,
  hardWrap: false,
  citeStyle: "ieee",
  borderStyle: "none",
  borderWeight: "medium",
  borderColor: "ink",
  fontHead: "theme",
  fontBody: "theme",
  baseSize: "11",
  lineSpacing: "default",
};
const out = engine.render("# Hello\n\nA paragraph with **bold** and $x^2$.\n", settings, {});
const html = out.doc.outerHTML;
check("render() produces a document", html.includes("Hello") && html.includes("<strong>"), `${html.length} chars`);
check("KaTeX math rendered through the dist build", html.includes("katex"));
check("dynamicCss() works from dist", engine.dynamicCss(settings).length > 500);
await import(new URL("../packages/engine/dist/global.js", import.meta.url));
/* global.ts publishes a plain, writable COPY of the api (the classic shell
   reassigns fields on it) — same functions, not the same object. */
check(
  "the ./global entry publishes the ambient api",
  typeof globalThis.Engine?.render === "function" &&
    globalThis.Engine.render === engine.api.render &&
    globalThis.Engine !== engine.api,
);

const mathml = await import(new URL("../packages/mathml-omml/dist/index.js", import.meta.url));
check(
  "mathml-omml dist imports under plain Node ESM",
  typeof mathml.mmlToOmml === "function" && typeof mathml.texToOmml === "function",
  Object.keys(mathml).join(","),
);
const omml = mathml.texToOmml("x^2 + 1", false);
check(
  "TeX converts to real OMML through the dist build",
  typeof omml === "string" && omml.includes("m:oMath") && omml.includes("m:sup"),
  String(omml).slice(0, 70),
);
const fromMathml = mathml.mmlToOmml(katex.renderToString("a_1", { output: "mathml" }));
check(
  "KaTeX MathML converts through the dist build",
  typeof fromMathml === "string" && fromMathml.includes("m:sub"),
  String(fromMathml).slice(0, 70),
);

console.log(fails.length ? `\n${fails.length} FAILURE(S)` : "\nDIST CONSUME GATE PASSES");
process.exit(fails.length ? 1 : 0);
