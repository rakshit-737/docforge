# Prompt 10 — implement secure PDF redaction and OCR

Treat this as two separate features. Do not call cosmetic whiteout secure
redaction.

### Secure redaction

Implement a workflow that:

1. Marks regions for redaction.
2. Removes or replaces affected content operators and text-layer data.
3. Handles hidden text and metadata where applicable.
4. Flattens affected regions when necessary.
5. Reopens the exported PDF.
6. Extracts text and proves the redacted content is gone.

The UI must clearly label cosmetic whiteout versus secure redaction.

### OCR

Add a lazy-loaded, local OCR workflow for scanned PDFs:

- Detect missing text layers.
- OCR selected pages or the whole document.
- Show progress and allow cancellation.
- Display confidence where possible.
- Allow manual correction.
- Convert the result to Markdown or searchable PDF.

Keep OCR and language packs out of the initial bundle. Add malformed-PDF,
redaction-verification, OCR fixture, browser, and offline tests.
