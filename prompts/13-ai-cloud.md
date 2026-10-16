# Prompt 13 — add optional AI and additive cloud features

Only begin this prompt after local persistence, security, web regression tests,
exports, and offline behavior are reliable.

### AI drawer

Add explicit, selection-based actions:

- Format messy notes.
- Rewrite.
- Tighten.
- Expand.
- Change tone.
- Generate an abstract.
- Suggest headings.
- Generate figure alt text.
- Convert pasted data into a table or chart.

Every action must show a diff, be undoable, never silently overwrite text, and
disclose the provider. Support BYO keys or an explicitly local model. AI must
not be required for any core workflow.

### Optional cloud

Consider only additive features:

- Encrypted project sync.
- Read-only share links.
- Review links.
- Classroom templates.
- Later, collaborative editing.

Local storage must remain the source of truth. Signed-out and offline users must
retain the full existing product. Add threat modeling, privacy documentation,
permission tests, offline-degradation tests, and data deletion controls before
shipping any cloud feature.
