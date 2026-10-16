# Prompt 07 — build proper citation workflows

Upgrade DocForge from heuristic citation formatting to a proper, maintainable
citation workflow.

Preserve the existing dialect syntax:

```text
[@key]
[@key, p. 33]
[@key]: reference entry
[references]
```

Use the existing foundation:

- `packages/importers/src/bib-import.ts`
- `apps/web/lib/bibliography.ts`
- `packages/engine/src/render.ts`

Add a real CSL-capable path for APA 7, IEEE, MLA, Chicago, Harvard, Vancouver,
and custom CSL files. Keep the current path for compatibility until the new
engine is proven by golden tests.

Add a bibliography panel with:

- Search.
- Insert citation.
- Jump to definition.
- Cited/uncited status.
- Duplicate detection.
- Missing metadata warnings.
- Imported-entry editing.
- Safe merge/reimport behavior.

Keep offline import fully functional. Any DOI or ISBN lookup must be optional,
explicitly online, and gracefully unavailable offline.

Add parser, formatter, UI, import, DOCX, PDF, and golden tests.
