# ADR-0012 — Schema Changes via node-pg-migrate

**Status:** Accepted
**Date:** 2026-10-10

## Context

The schema lived in `database.sql` (initial) and `database_modification_query.sql`
(patches). Postgres ran both through `/docker-entrypoint-initdb.d/`, which only happens on
an empty data directory. Every existing database, including prod, got schema changes by
hand with `psql -f`.

- A deploy could put new code in front of an old schema. Nothing failed at deploy time;
  requests failed at runtime.
- Nothing recorded which changes a database had.
- The patch file was idempotent only by convention (`IF NOT EXISTS`, `DO $$` guards),
  grew forever, and re-ran in full every time.
- `psql -f` is not one transaction, so a failure partway left a half-applied file.
- Nothing showed whether a given database matched the files. Prod did; a long-lived
  dev database did not (lookup id sequences the files never create, columns with
  different types and nullability), and nothing had flagged it.

The other products on the same host already migrate as a deploy step: nepse with
Drizzle, survey-app with node-pg-migrate.

## Decision

**Every schema change is a file in `migrations/`, applied by node-pg-migrate and recorded
in `pgmigrations`. Deploys run pending migrations before the API starts.**

- node-pg-migrate v8, as in survey-app. It is a prod dependency because the `migrate`
  container runs from the app image.
- Migrations are CommonJS files whose `up` calls `pgm.sql(...)`. The codebase is raw SQL
  (ADR-0001, ADR-0002), so the builder API is not used. Create them with
  `npm run migrate:create -- <kebab-name>`, never by hand-numbering.
- `scripts/migrate.js` runs them with the app's `DB_*` variables, so there is no second
  `DATABASE_URL` to keep in step. It exits non-zero on failure, and in the prod stack the
  API waits on it (`service_completed_successfully`).
- Each migration runs in its own transaction, and an advisory lock prevents overlapping
  runs (node-pg-migrate defaults).
- The first migration, `*_baseline.js`, is a `pg_dump --schema-only` of **prod**, not a
  replay of the old files: prod is the schema the code actually runs against. A fresh
  database built by `npm run migrate` dumps identical to prod apart from
  `pgmigrations` (checked when the baseline was taken). Existing databases mark it as
  applied without running it (`--fake --file <baseline>`).
- The `user_type` rows are in the baseline: `authorize()` and the services depend on
  them. Every other lookup table stays seed data (`npm run seed:all`).

Rules for migrations:

- Never edit a migration once it is merged to `main`. Write a new one.
- No `IF NOT EXISTS` guards. `pgmigrations` guarantees each runs once, and guards hide
  drift.
- A new `NOT NULL` column is added nullable, backfilled, then `SET NOT NULL`, all in one
  migration.
- Expand, then contract. Rolling back the image does not roll back the schema, so every
  migration must work with the release before it. Add columns and tables freely. Drop or
  rename only in a later release, once no deployed code reads the old shape.
- `down` is best-effort. Write one where it is cheap and safe, otherwise
  `exports.down = false;`. A bad migration is normally fixed with a new forward
  migration. The `pg_dump` taken before a deploy is the last resort.

## Consequences

- A deploy with a failing migration leaves the old API running and reports failure,
  instead of starting new code against the wrong schema.
- `database.sql`, `database_modification_query.sql` and the initdb mounts are gone. Dev,
  test and new environments are built by `npm run migrate && npm run seed:all`.
- Existing dev volumes need a one-time `--fake` of the baseline, or a fresh volume.
- `npm test` builds a scratch database from the migrations
  (`test/migrations.test.ts`), so the database user needs `CREATEDB`.
