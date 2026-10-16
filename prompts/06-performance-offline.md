# Prompt 06 — measure performance and offline quality

Do not guess about performance. Add measurements first.

Measure on a representative 100-page document:

- Editor input latency.
- Parser time.
- Paged.js composition time.
- Render queue depth.
- Memory usage.
- IndexedDB save time.
- DOCX export time.
- PDF export time.

Turn the useful targets into checks where practical:

- Input latency p95 below 16 ms.
- Full recomposition below 2 seconds.
- Zero console errors in corpus runs.
- Single-file size within the documented budget.
- Studio route size within the documented budget.

Then improve only the measured bottlenecks. Consider worker-based parsing,
cached document state, lazy loading, and long-document preview virtualization.

Audit the service worker. Add a generated precache manifest for the app shell,
studio route, fonts, `doc.css`, and runtime chunks. Prove that a fresh browser
context can open and edit the studio after an earlier online visit followed by
a network cut.

Add performance and cold-offline tests. Report any target that cannot be met.
