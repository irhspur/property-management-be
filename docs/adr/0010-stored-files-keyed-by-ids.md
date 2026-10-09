# ADR-0010 — Stored Files Are Keyed by Ids and Removed After Their Rows

**Status:** Accepted
**Date:** 2026-10-09

## Context

The bytes behind Documents and Tenant profile photos were written by seven services, each
building its own path from human-readable parts: `uploads/<mobile_number>/`, then
`<first_name>_<category>_<timestamp>`, and for property Documents a
`<property_name>/` folder. Deletes removed whole folders by rebuilding the same path. That
layout caused every storage bug we found:

- A user with no mobile number got a different fallback folder per service (`unknown`,
  `unknown_user`, the user id), while deleting them removed `uploads/<null>` — leaving
  their files behind.
- Property uploads sanitised the property name; property delete didn't, so a name with
  `/`, `:` or `?` left its files on disk. Renaming a property stranded its folder.
- Deletes that cascade through the database (an owner's account, a Property with ended
  Agreements, a Tenant) orphaned files stored in another user's folder.
- Files were written inside the database transaction, so a failed commit left the file.

## Decision

**All stored bytes go through one module, `services/fileStore.ts` (CONTEXT.md "File
store"), under a layout keyed by ids only: `<root>/<user_id>/<uuid><ext>`.**

- Names, mobile numbers, categories and Property names never appear in a path. The
  readable label is `files.file_name`, which is display-only.
- The extension comes from the validated MIME type, since `sendFile` sets
  `Content-Type` from it.
- `file_path` stores the full path, root included. Older rows in the name-based layout
  keep resolving unchanged; existing files are not moved.
- Bytes are written **before** the transaction that inserts their row, and removed if it
  fails. A crash in between can leave a stray file but never a row pointing at nothing.
- Bytes are removed **after** the delete commits. A delete that cascades collects every
  affected `file_path` in its transaction first (`findPathsCascadingFrom*` in
  `models/file.ts`, mirroring the `ON DELETE CASCADE` chain), so no file outlives its row.
- The root is `UPLOAD_ROOT`, default `uploads` (the production volume). Tests use a temp
  root.
- `npm run storage:sweep` reports files no row points at, and rows whose file is missing;
  `-- --delete` removes the unreferenced files. It never changes rows and does not run on
  a schedule.

## Consequences

- A new Document kind or new cascade must go through the File store and, if it cascades,
  extend the `findPathsCascadingFrom*` queries. A delete that removes folders, or a path
  built from a name, is the drift this ADR exists to stop.
- Files on disk can no longer be browsed by person or Property; find them through their
  rows.
- Run `npm run storage:sweep` once after deploying to clear orphans the old layout left.
