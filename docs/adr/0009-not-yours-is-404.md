# ADR-0009 — A Record You Don't Own Is Not Found, Never Forbidden

**Status:** Accepted
**Date:** 2026-10-09

## Context

Record-level access was checked separately in each service, and the answers disagreed:

- Tenant-scoped routes (`/property-owner/tenant/:tenantId/...`) returned `403` when the
  Tenant wasn't linked or the Agreement belonged to someone else.
- By-id routes (`/property-owner/agreements/:agreementId`, its `/statement`) returned `404`
  for the same situations, on purpose, so Agreement ids couldn't be probed.
- Some routes had no check at all: `GET /user/property/:id` returned any Property, a
  property Document could be uploaded onto another owner's Property, and
  `GET /user/property?mobile_number=` listed any user's Properties.

A `403` confirms that the id exists and belongs to someone else. Agreement, Payment,
Property and Document ids are UUIDs, but they appear in shared links and view URLs, so
"exists but not yours" is information worth not giving away.

## Decision

**Every record-level "not yours" is a `404`, decided in one module: `services/ownership.ts`
(CONTEXT.md "Ownership").**

- Each lookup returns the record or throws `404`. A malformed id is a `404` too, never a
  `500` from Postgres rejecting the UUID.
- `403` keeps one meaning: the caller's role may not use the route (`authorize`), or the
  account is unverified or inactive. It never depends on which record was asked for.
- Lists and summaries are not lookups. They scope by owner in their own SQL and return
  only the caller's rows, so they never need to deny.
- `GET /user/property?mobile_number=` was removed rather than restricted: it had no
  legitimate Property Owner use, and no frontend called it.

## Consequences

- Tenant-scoped routes change from `403` to `404` for an unlinked Tenant or someone else's
  Agreement. The frontend treats both as an error with the server's message, so nothing
  there depends on the code.
- A new route that loads one record by id must get it from `services/ownership.ts`, not a
  model. A check written anywhere else is the drift this ADR exists to stop.
- Admin is not special-cased: an admin calling an owner route is an owner with no records,
  and gets `404`. Admin oversight stays on `/admin/*`.
