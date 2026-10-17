# proptrove.io

Express + PostgreSQL API for Proptrove. See `CLAUDE.md` for commands and architecture.

## Database

The schema is built by the migrations in `migrations/` (ADR-0012); lookup tables are seed data.

    npm run migrate && npm run seed:all

New schema change: `npm run migrate:create -- <kebab-name>`, then write SQL in its `up`.

A database that already has the schema from before migrations (built by the old
`database.sql` scripts) is adopted once, without changing it, by recording the
baseline as applied:

    npm run migrate -- --fake --file <baseline-file-name-without-.js>

`--fake` refuses to run without `--file` or a count, so it can't mark a real
migration as applied by accident.

## First admin

Admins can't self-register (`POST /auth/register` takes Property Owners only).
Create one from the server; it asks for the password with input hidden, and
the admin is verified and can log in straight away, no email needed:

    npm run create-admin -- you@example.com

From the production image: `docker exec -it <api container> node tasks/create-admin.js you@example.com`.
