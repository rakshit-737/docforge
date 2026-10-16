# Prompt 11 — add technical-publishing features

Add optional, lazy-loaded support for technical documents while preserving the
existing dialect and print-quality output.

Prioritize:

1. Mermaid diagrams.
2. Print-safe charts.
3. Data tables behind charts.
4. Glossary generation.
5. Index generation.
6. LaTeX export.
7. EPUB export.
8. Slide-outline or PPTX export.

For diagrams and charts:

- Render SVG in preview/PDF where possible.
- Embed an image fallback in DOCX.
- Preserve source in project files.
- Require useful alt text.
- Keep output readable in grayscale.
- Add lazy loading and bundle-size accounting.

Add one spec, corpus fixture, parser test, preview test, PDF test, DOCX test,
import/round-trip test where applicable, and documentation for each feature.
