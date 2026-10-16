/* A deliberately small, positive HTML-fragment policy for manuscripts, not
   arbitrary HTML/CSS/SVG/MathML or application templates. Rebuild from scratch:
   no source element/attribute is ever adopted, and text is never parsed as HTML.
   Only ordinary HTML elements without raw-text/foreign parsing modes survive.
   Thus later HTML serialization/reparsing cannot reveal hidden active markup.

   DOMPurify 3.4.17 was evaluated, but its cached Node.prototype.nodeName getter
   is incompatible with the engine's happy-dom runtime (empty names cause valid
   wrappers to be removed and their descendants to escape the walk). Do not work
   around that by disabling its security checks or using a vulnerable release.
   This restrictive reconstruction policy works with either DOM implementation;
   the security suite also checks HTML5 parsing and reparsing under jsdom.

   KaTeX (default trust:false), hljs and the constant camera SVG are generated
   afterwards, not passed through this raw-content policy. */
const HTML_NAMESPACE = "http://www.w3.org/1999/xhtml";
const TAGS = new Set([
  "a",
  "abbr",
  "b",
  "bdi",
  "bdo",
  "blockquote",
  "br",
  "caption",
  "code",
  "col",
  "colgroup",
  "dd",
  "del",
  "details",
  "dfn",
  "div",
  "dl",
  "dt",
  "em",
  "figcaption",
  "figure",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "hr",
  "i",
  "img",
  "ins",
  "kbd",
  "li",
  "mark",
  "ol",
  "p",
  "pre",
  "q",
  "rp",
  "rt",
  "ruby",
  "s",
  "samp",
  "section",
  "small",
  "span",
  "strong",
  "sub",
  "summary",
  "sup",
  "table",
  "tbody",
  "td",
  "tfoot",
  "th",
  "thead",
  "time",
  "tr",
  "u",
  "ul",
  "var",
  "wbr",
]);
const ATTRIBUTES = new Set([
  "alt",
  "align",
  "class",
  "colspan",
  "dir",
  "height",
  "href",
  "id",
  "lang",
  "open",
  "reversed",
  "rowspan",
  "scope",
  "span",
  "src",
  "start",
  "style",
  "title",
  "type",
  "value",
  "width",
  // Only dialect carriers, rather than arbitrary application data-* hooks.
  "data-bg",
  "data-caps",
  "data-caption",
  "data-color",
  "data-fn",
  "data-font",
  "data-hl",
  "data-id",
  "data-key",
  "data-list",
  "data-loc",
  "data-refs",
  "data-req-w",
  "data-sc",
  "data-size",
  "data-tablecap",
  "data-tex",
  "data-toc",
  "data-u",
]);
/* This set only controls whether to discard inert contents as well. Permission
   to emit an element comes exclusively from TAGS and its HTML namespace. */
const DISCARD_CONTENTS = new Set([
  "script",
  "style",
  "template",
  "svg",
  "math",
  "iframe",
  "object",
  "embed",
  "noscript",
  "noembed",
  "noframes",
  "textarea",
  "xmp",
  "plaintext",
  "title",
]);

/* No resource-bearing CSS or general CSS functions/escapes/variables. Values
   have a small positive grammar, so url(), image-set(), @import, expression(),
   custom properties and escaped/comment-split variants cannot get through.
   Validate without CSSOM reserialization: safe dialect styles retain their
   exact spelling, order and trailing semicolons (the byte-parity contract).
   An unsupported declaration drops the whole style attribute. */
const LENGTH = "(?:0|(?:\\d+(?:\\.\\d+)?|\\.\\d+)(?:px|pt|pc|em|rem|ex|ch|%|cm|mm|in))";
const COLOR =
  /^(?:#[\da-f]{3,4}|#[\da-f]{6}(?:[\da-f]{2})?|[a-z]+|(?:rgb|hsl)a?\([\d\s.,%+/-]+\))$/i;
const SIZE = new RegExp(`^(?:${LENGTH}|auto|none|inherit)$`, "i");
const SPACING = new RegExp(`^(?:${LENGTH}|auto)(?:\\s+(?:${LENGTH}|auto)){0,3}$`, "i");
const FAMILY =
  /^(?:"[^"\\;\r\n(){}<>]*"|'[^'\\;\r\n(){}<>]*'|[-\p{L}\p{N}_ ]+)(?:\s*,\s*(?:"[^"\\;\r\n(){}<>]*"|'[^'\\;\r\n(){}<>]*'|[-\p{L}\p{N}_ ]+))*$/u;
const CSS_VALUES = new Map<string, RegExp>([
  ["color", COLOR],
  ["background", COLOR],
  ["background-color", COLOR],
  ["font-family", FAMILY],
  ["font-size", SIZE],
  ["font-weight", /^(?:normal|bold|bolder|lighter|[1-9]00)$/i],
  ["font-style", /^(?:normal|italic|oblique)$/i],
  ["font-variant", /^(?:normal|small-caps)$/i],
  [
    "text-decoration",
    /^(?:none|underline|overline|line-through)(?:\s+(?:underline|overline|line-through))*$/i,
  ],
  ["text-transform", /^(?:none|uppercase|lowercase|capitalize)$/i],
  ["text-align", /^(?:left|right|center|justify|start|end)$/i],
  [
    "vertical-align",
    new RegExp(`^(?:${LENGTH}|baseline|sub|super|top|text-top|middle|bottom|text-bottom)$`, "i"),
  ],
  ["white-space", /^(?:normal|pre|pre-wrap|pre-line|nowrap|break-spaces)$/i],
  ["line-height", new RegExp(`^(?:${LENGTH}|\\d+(?:\\.\\d+)?|normal)$`, "i")],
  ["letter-spacing", new RegExp(`^(?:${LENGTH}|normal)$`, "i")],
  ["word-spacing", new RegExp(`^(?:${LENGTH}|normal)$`, "i")],
  ...["width", "height", "min-width", "max-width", "min-height", "max-height"].map(
    (p): [string, RegExp] => [p, SIZE],
  ),
  ...["margin", "padding"].flatMap((p) =>
    ["", "-left", "-right", "-top", "-bottom", "-inline", "-block"].map(
      (side): [string, RegExp] => [p + side, SPACING],
    ),
  ),
]);

function safeStyle(style: string): boolean {
  return style.split(";").every((declaration) => {
    if (!declaration.trim()) return true;
    const m = /^\s*([a-z-]+)\s*:\s*(.*?)\s*$/i.exec(declaration);
    return !!m && !!CSS_VALUES.get(m[1].toLowerCase())?.test(m[2]);
  });
}

/** Only passive raster data URLs in img context. Never SVG, HTML, opaque blobs,
    relative paths or remote images: even same-origin image requests can leak
    content or trigger authenticated endpoints. This checks transport/MIME, not
    image validity or size; the browser's image decoder still validates bytes. */
export function isSafeImageDataUrl(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^data:image\/(?:png|gif|jpe?g|webp|avif);base64,[a-z\d+/]+={0,2}$/i.test(value)
  );
}

function safeHref(value: string): boolean {
  // Entity decoding happens in the HTML parser first. URL parsing then applies
  // browser scheme normalization (including tab/newline-obfuscated schemes).
  try {
    const protocol = new URL(value, "https://docforge.invalid/").protocol;
    return ["http:", "https:", "mailto:", "tel:"].includes(protocol);
  } catch {
    return false;
  }
}

function safeAttribute(tag: string, name: string, value: string): boolean {
  if (!ATTRIBUTES.has(name)) return false;
  if (name === "style") return safeStyle(value);
  if (name === "href") return tag === "a" && safeHref(value);
  if (name === "src") return tag === "img" && isSafeImageDataUrl(value);
  // No form/name attributes are admitted. Also reserve built-in document/form
  // property names, without treating existing document anchors as reserved.
  if (name === "id") return !(value in document) && !(value in document.createElement("form"));
  return true;
}

/** Sanitize for insertion into an HTML body/fragment, never an attribute, JS,
    stylesheet, or template-language context. A DOM is required at call time. */
export function sanitizeRawHtml(raw: string): string {
  // Template parsing is inert: scripts, custom elements and resource-bearing
  // elements are never connected to the live document. The returned fragment
  // is a separate tree assembled solely with createElement/createTextNode.
  const input = document.createElement("template");
  input.innerHTML = raw;
  const output = document.createElement("template");
  // Iterative traversal also avoids recursive call-stack exhaustion on deep HTML.
  const pending: { from: Node; into: Node }[] = [];
  const enqueue = (from: Node, into: Node) => {
    for (let i = from.childNodes.length - 1; i >= 0; i--) {
      pending.push({ from: from.childNodes[i], into });
    }
  };
  enqueue(input.content, output.content);
  while (pending.length) {
    const { from, into } = pending.pop() as { from: Node; into: Node };
    if (from.nodeType === 3) {
      into.appendChild(document.createTextNode(from.nodeValue || ""));
      continue;
    }
    if (from.nodeType !== 1) continue; // no comments/processing instructions
    const el = from as Element;
    const tag = el.localName.toLowerCase();
    if (el.namespaceURI !== HTML_NAMESPACE || DISCARD_CONTENTS.has(tag)) continue;
    if (!TAGS.has(tag)) {
      enqueue(el, into); // unwrap unknown HTML, still validating every descendant
      continue;
    }
    const clean = document.createElement(tag);
    for (const attr of el.attributes) {
      // Namespace-less allowlisted attributes only: no xlink/xmlns or handlers.
      if (!attr.namespaceURI && safeAttribute(tag, attr.name, attr.value)) {
        clean.setAttribute(attr.name, attr.value);
      }
    }
    into.appendChild(clean);
    enqueue(el, clean);
  }
  return output.innerHTML;
}
