# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # start with nodemon (auto-reload)
node index.js        # start without auto-reload

npm run docker:dev   # local stack (postgres, migrate, app) from docker-compose.dev.yml

npm run migrate                        # apply pending migrations to the DB in .env
npm run migrate:down                   # revert the last one (only if it has a down)
npm run migrate:create -- <kebab-name> # new file in migrations/

npm run seed:all     # seed all lookup tables in dependency order
npm run seed:<name>  # seed individual table (usertype, gender, country, province, district, municipality, file-category, property-file-category, agreement-file-category, property-type, agreement-duration, increment-duration, increment-percentage, payment-period, payment-purpose, payment-method, bs-month)

npm test             # node:test suites in test/, run against the DB in .env
npm run storage:sweep [-- --delete]   # report (or delete) stored files no row points to
```

Tests need the database in `.env` built by `npm run migrate && npm run seed:all`; `test/migrations.test.ts` also creates and drops a scratch database, so the DB user needs `CREATEDB`. Start every database-backed test file with `useTestDatabase()` from `test/support/db.ts`: the file runs in one rolled-back transaction, each test in its own savepoint (so tests are independent), services' own transactions nest inside it, and `UPLOAD_ROOT` points at a temp dir. Build data with `test/support/fixtures.ts` (`owner()`, `tenant({ linkedTo })`, `property()`, `agreement()`, `payment()`, `document()`, `lookups()`) and HTTP tests with `useApp()` from `test/support/http.ts`. Never set up a transaction or patch `pool` by hand.

## Required `.env` Variables

```
PORT=
DB_USER=
DB_HOST=
DB_NAME=
DB_PASSWORD=
DB_PORT=
JWT_SECRET=
BASE_URL=           # frontend base URL for email verification/reset links
# nodemailer config (EMAIL_USER, EMAIL_PASS, etc. — see utils/email.js)

# optional
UPLOAD_ROOT=        # where new stored files go; default `uploads` (the production volume)
LOG_SQL=            # `true` logs SQL text (never bound values) for pool.query
EXPOSE_EMAIL_TOKENS= # `true` also returns emailed tokens (verify, reset, Invite) in responses; local dev only, never prod
```

## Architecture

**Stack:** Express.js REST API + PostgreSQL via `pg` Pool. All queries are raw SQL via `pool.query()` with `$1`-style parameterisation — there is no ORM (Sequelize was a leftover dependency and has been removed).

**User types** (stored in `user_type` table, checked by name string): `admin`, `property_owner`, `tenant`.

**Auth flow:**
1. `POST /auth/register` → hashes password, sends verification email, inserts user as unverified
2. `GET /auth/verify-email?token=` → sets `is_verified = TRUE`
3. `POST /auth/login` → validates credentials + expiry (1 year), returns JWT (1h lifetime)
4. JWT is Bearer token in `Authorization` header for all protected routes

**Middleware chain on every protected route:**
```
authorize([userTypes]) → validationRules[] → validate → controller
```
- `authorize` (`middleware/authorization.js`): verifies JWT, DB-checks user is verified+active, enforces allowed user types. Attaches `req.user = { id }`.
- Validation rules in `middleware/validations.js` (express-validator chains); `middleware/validate.js` collects errors and returns 400.

**Record access — `services/ownership.ts` (ADR-0009):** every single-record lookup by id (Tenant, Property, Agreement, Payment, Document under its parent) goes through this module, which returns the record or throws `404`. A record the caller doesn't own is `404`, never `403`; `403` only means the role can't use the route. Don't check ownership in a service or model — lists and summaries scope by owner in their own SQL instead.

**File upload chain** (for routes that upload files):
```
authorize → documentsUpload | receiptsUpload | photoUpload → controller → service → fileStore
```
- `config/multer.js`: the three wrappers, all memory storage, JPEG/PNG/PDF (photo: JPEG/PNG). Documents 10 files × 10 MB, receipts 5 × 5 MB, photo 1 × 2 MB. Rejections return the `400` validation envelope with `field: "files"`/`"photo"` — never multer's raw error.
- `services/fileStore.ts` (ADR-0010) owns all stored bytes: `save` writes to `<UPLOAD_ROOT>/<user_id>/<uuid><ext>` then runs the caller's row inserts in a transaction (removing the bytes if it fails); `discard` removes files after a delete commits; `viewUrl`/`photoUrl` mint Signed View URLs. Paths are keyed by ids only — never names, mobile numbers or categories. Nothing else touches `fs`.
- A delete that cascades must collect paths first with `fileModel.findPathsCascadingFrom*` inside its transaction, then `discard` them after.

**Response envelope:** all responses use `{ status: "AK", ... }` (success) or `{ status: "NAK", message: "..." }` (failure). Follow this convention in new controllers.

**Route layout:**
- `/auth` — registration, login, password management
- `/user` — user details, address, user-owned files, user-owned properties and their files
- `/property-owner` — property owner creates/manages tenants and tenant files (tenant user type user_type_id=3)
- `/admin/property-owners` — admin views all property owners
- `/admin/properties` — admin views all properties + documents
- Lookup tables (`/country`, `/province`, `/district`, `/municipality`, `/gender`, `/user-type`, `/file-category`, `/property-file-category`, `/agreement-file-category`, `/property-type`, `/agreement-duration`, `/increment-duration`, `/increment-percentage`, `/payment-period`, `/payment-purpose`, `/payment-method`): one module — each table is a description in `services/lookupTables.ts`, served by the router factory in `routes/lookupRoutes.js`. Add or change a lookup there, not with a new controller. In-use and app-required rows can't be deleted (ADR-0011).

**DB schema source:** `migrations/`, applied by node-pg-migrate via `scripts/migrate.js` (ADR-0012). The prod stack runs it before the API starts. Every schema change is a new migration from `npm run migrate:create`: `pgm.sql(...)` in a CommonJS file, no `IF NOT EXISTS` guards, compatible with the previous release (expand, then contract), and never edited once merged to `main`. The first one, `*_baseline.js`, is the prod schema as dumped when migrations were adopted. Key junction table: `owner_tenant (property_owner_id, tenant_id)` — populated via `services/linkTenantToOwner.js`.

**Domain language and decisions:** `GLOSSARY.md` is the glossary (Agreement, Rent In Force, Ownership, Personal / Property / Agreement Document, Payment Receipt, …) — use its terms. `docs/adr/` records decisions not to re-litigate. `API_DOCS.md` is the contract the frontend (`../property-management-fe-v3`) builds against; update it with any response change.

**Seed data:** CSVs in `data/` loaded via `pg-copy-streams` (`seed/copy_csv_to_table.js`). Seed order matters: country → province → district → municipality (geography FKs).

## Deployment

Not in this repo. The **proptrove-infra** repo owns hostnames, production compose
stacks, nginx config, and the deploy scripts:

```bash
cd ../proptrove-infra && ./scripts/deploy.sh api prod
```

This repo keeps only `dockerfile`/`.dockerignore` (how to build this source) and
`docker-compose.dev.yml` (local development). Do not add hostnames or deploy
logic here — see `../proptrove-infra/README.md` for why.

## Agent skills

### Issue tracker

Issues and specs live as local markdown files under `.scratch/<feature>/` (git-ignored). See `docs/agents/issue-tracker.md`.

### Triage labels

The five default roles (`needs-triage`, `needs-info`, `ready-for-agent`, `ready-for-human`, `wontfix`), recorded as a `Status:` line in each issue file. See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: the glossary is `GLOSSARY.md` at the repo root, with ADRs in `docs/adr/`. See `docs/agents/domain.md`.
