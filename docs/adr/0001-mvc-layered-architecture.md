# ADR-0001 — MVC Layered Architecture

**Status:** Accepted (pending implementation)
**Date:** 2026-06-18

## Context

All business logic currently lives in controllers (~3,900 lines across 7 controllers). Raw SQL, filesystem operations, transactions, bcrypt, and ownership checks are all written inline. The same patterns are repeated multiple times:

- DB + filesystem atomic operation: 9× across 3 controllers
- `owner_tenant` authorization check: 8× inside `tenantController.js`
- User details + address upsert transaction: 2× (user flow + tenant creation flow)
- Password hashing, expiry check, token generation: inline in `authController.js`

There is already one extracted service (`services/linkTenantToOwner.js`) that proves the pattern works.

## Decision

Adopt a strict 3-layer MVC architecture:

```
Routes + Middleware
       ↓
   Controllers        ← HTTP only (parse req, call service, format res)
       ↓
    Services          ← business logic (transactions, filesystem, rules)
       ↓
     Models           ← SQL only (one file per table)
       ↓
  pg pool / fs / nodemailer
```

**Hard rule:** controllers never import models directly. All data access goes through a service.

## Layer contracts

### Models — SQL, nothing else
- One file per table in `models/`
- Each model exports named functions: `findById`, `findAll`, `create`, `update`, `delete`, plus any domain-specific queries (e.g. `findWithProfile`, `assertLinked`)
- Models never open transactions or call `fs`
- Models accept `pool` as a parameter (or use the singleton) but never call `BEGIN`/`COMMIT`

### Services — business logic, no HTTP
- One file per domain in `services/`
- Services own `BEGIN`/`COMMIT`/`ROLLBACK`
- Services own all `fs` calls (file write, delete, directory cleanup)
- Services own business rules (password expiry, mobile number immutability, vacancy check before delete, ownership verification)
- Services never touch `req` or `res`

### Controllers — HTTP, nothing else
- Parse `req.body` / `req.params` / `req.user` using `pickFields`
- Call exactly one service method
- Format the `{ status: "AK", data }` / `{ status: "NAK", message }` envelope
- Catch errors thrown by services (services throw `{ message, status }` for known errors)

## Consequences

- Controllers shrink from hundreds of lines to ~20–30 lines each
- Business rules are named and testable without an HTTP layer
- Swapping disk storage for S3 touches only `fileService.js`
- Adding audit logging to ownership checks touches only `ownerTenantModel.js`
