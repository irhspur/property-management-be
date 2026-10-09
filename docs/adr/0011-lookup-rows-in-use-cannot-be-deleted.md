# ADR-0011 — Lookup Rows in Use Can't Be Deleted; Rows the App Depends On Are Locked

**Status:** Accepted
**Date:** 2026-10-09

## Context

The 16 lookup tables (countries and the rest of the geography, genders, user types, the three Document category lists, property types, agreement durations, increment terms, payment periods, purposes and methods) were 16 hand-copied controllers. Deleting
a row did whatever its foreign keys happened to say, and most of those outcomes were
silent data damage:

- `ON DELETE SET NULL` on `files.file_category_id` (and the property/agreement
  category columns) — deleting a category hid every Document in it, since the
  Document lists join on category.
- `ON DELETE SET NULL` on `users.user_type_id` — deleting a user type locked out
  every user of that type, since `authorize()` joins on it.
- `ON DELETE CASCADE` from `country` → `province` → `district` → `municipality` —
  deleting a country removed its whole geography and nulled the addresses and
  Properties pointing at it.
- The rest (`payments` → payment purpose/method, `agreements` → durations, periods,
  increments) had no action, so the delete failed with a raw foreign-key error,
  reported as HTTP `200` with `status: "NAK"`.

Separately, the code hard-codes some seeded rows: payment purpose 1 is rent
(`RENT_PURPOSE_ID`), payment periods 1–4 are 1/3/6/12 months (`PAYMENT_PERIOD_MONTHS`),
user types are matched **by name** in `authorize()`, and some category codes are where
the frontend uploads without asking. Nothing stopped an admin from deleting or
re-meaning them.

Changing the foreign keys to `RESTRICT` was considered. It needs a hand-applied
migration on every database, still reports a raw error, and says nothing about the
hard-coded rows.

## Decision

**All lookup tables are one module (`services/lookupTables.ts`) driven by a description per
table, and that module guards deletes and locked rows before the database is asked.**

- Deleting a row any other row references returns `409`, naming what uses it
  ("Country is in use by 7 provinces and 3 user profiles, so it cannot be deleted").
  References are read from Postgres's own foreign keys (`pg_constraint`) at delete
  time, so a new referencing column is covered without being listed anywhere.
- Locked rows return `409` with the reason:
  - user types: no create, update or delete (`authorize()` matches by name);
  - payment periods: no create, no delete of ids 1–4; renaming is allowed;
  - payment purpose 1 (Rent): no delete; renaming is allowed;
  - reserved category codes: no delete; renaming is allowed.
- Unexpected errors are a real `500`, never `200` with `NAK`.
- The foreign keys themselves are unchanged.

## Consequences

- A new hard-coded lookup id or code must be added to its table's `locked` description,
  or the guard can't protect it.
- A row that really must go has to be detached from everything first, or removed by
  hand in SQL by someone who has checked what it cascades into.
- The foreign keys still describe the old behaviour; anything deleting lookup rows
  outside this module (a manual SQL session) still gets SET NULL / CASCADE.
