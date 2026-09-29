# ADR-0008 — Activity Is an Append-Only Event Log, Written With the Mutation

**Status:** Accepted
**Date:** 2026-09-29

## Context

The dashboard's activity feed was stitched together client-side from `created_at` /
`updated_at` on four list endpoints. That had two defects that no amount of client work
could fix:

- **"Agreement ended" was inferred from `status = 'ended'` plus `updated_at`.** Any later
  write to the row bumps `updated_at`, so an unrelated edit renders as an ending, at the
  wrong time.
- **Deletions were invisible.** A deleted Property or Payment vanishes from every list, so
  it vanishes from history too.

A `UNION ALL` view over the existing tables was considered. It would fix the
`updated_at` mislabelling if `agreement.ended` were keyed off something other than
`updated_at` — but there is no such column, and a view can never show a row that no
longer exists. It fixes neither defect.

## Decision

**Activity is recorded in an append-only `activity_event` table, written by the service
layer inside the same transaction as the mutation it describes.**

- One row per event: `owner_id`, `type` (e.g. `agreement.ended`, `payment.deleted`),
  `subject_kind`, `subject_id`, `context`, `occurred_at`.
- `subject_id` has **no foreign key**. The event must outlive its subject.
- `context` (`property_name`, `tenant_name`, `amount`) is **denormalised on purpose**, so
  the feed renders without follow-up lookups and still renders after the subject is gone.
  It is a snapshot at event time; a later rename does not rewrite history.
- `activityModel.record()` takes a transaction client, never the pool. Mutations that
  previously ran as a single statement on the pool (property create, payment
  create/update/delete, tenant delete) now run in `withTransaction` so the event commits
  or rolls back with the change.
- Events are never updated or deleted by the application. They are removed only by the
  `owner_id` cascade when the owner's account is deleted.
- `occurred_at` is `TIMESTAMPTZ` truncated to milliseconds so the feed's keyset cursor
  round-trips exactly through a JS `Date`.

A one-off, idempotent backfill in `database_modification_query.sql` seeds events from
existing rows. Deletions before the table existed are unrecoverable, and backfilled
`agreement.ended` events use `updated_at` — correct today only because ending is the one
write the API allows on an Agreement.

## Consequences

- Every new mutation that should appear in the feed must call `activityModel.record()`
  in its transaction. Forgetting is silent: the feed simply won't show it.
- `tenant.unlinked` is emitted by tenant deletion, the only unlink path that exists. Tenant
  deletion removes the user outright, so it cascades away that tenant's Agreements and
  Payments without emitting per-row `agreement.*` / `payment.deleted` events.
- The table grows without bound. At dashboard volumes that is years away from mattering;
  when it does, archive by `occurred_at`, since the feed only reads recent pages.
