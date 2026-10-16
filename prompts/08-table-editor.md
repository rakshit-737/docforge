# Prompt 08 — build a visual table editor and document variables

Implement two related usability improvements without changing ordinary Markdown
table meaning.

### Visual table editor

Allow users to click a rendered table and:

- Add/remove rows.
- Add/remove columns.
- Edit cells.
- Toggle the header row.
- Set alignment.
- Resize columns where the dialect supports it.
- Move rows.
- Paste spreadsheet ranges.
- Add captions and labels.
- Convert a table to CSV.

Every action must write back to source and be undoable.

### Document variables

Add safe variables such as:

```text
{{title}}
{{author}}
{{course}}
{{student_id}}
{{company}}
{{date}}
```

Use them in templates, headers, footers, covers, repeated metadata, filenames,
and CLI builds. Define escaping and missing-variable behavior before coding.

Add round-trip tests, page-edit tests, DOCX/PDF tests, and documentation.
