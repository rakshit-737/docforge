# Prompt 05 — harden persistence and recovery

Improve the local document-storage model without breaking existing projects.

Inspect:

- `apps/web/lib/persistence.ts`
- `apps/web/lib/project-file.ts`
- `apps/web/lib/workspace.ts`
- `apps/web/lib/versions.ts`
- `apps/web/lib/attachments.ts`

Implement the smallest complete slice of:

- Versioned project migrations.
- Strict settings validation.
- Attachment MIME, dimension, and size validation.
- Explicit saving/saved/save-failed UI.
- Crash-recovery messaging.
- Attachment manifests for version restores.
- Storage quota warnings.
- Cross-tab conflict detection with `BroadcastChannel`.

Do not copy large image bytes into every version snapshot. Prefer content-
addressed blobs plus per-version attachment manifests.

Add migration tests, persistence tests, recovery tests, and one browser test
that proves a document with images can be restored safely.
