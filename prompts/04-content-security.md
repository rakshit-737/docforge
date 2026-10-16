# Prompt 04 — harden content and import security

Audit every path that turns user or imported content into HTML, SVG, CSS, or
exported document content.

Inspect:

- `packages/engine/src/parse.ts`
- `packages/engine/src/render.ts`
- `apps/web/lib/html-to-md.ts`
- `apps/web/lib/imports.ts`
- Standalone HTML export.
- `innerHTML` and `dangerouslySetInnerHTML` sites.
- Markdown links and image handling.

Implement a safe allowlist policy:

- Remove scripts and event-handler attributes.
- Reject unsafe URL protocols such as `javascript:`.
- Restrict image data URLs to supported image types.
- Sanitize raw HTML before preview and export.
- Preserve safe KaTeX and syntax-highlighting output.

Add adversarial tests for pasted HTML, raw Markdown HTML, malicious links,
dangerous SVG, citation text, and escaped dialect lookalikes.

Improve the hosted CSP if feasible without breaking the single-file edition.
Do not claim the app is secure until the browser tests exercise these cases.
