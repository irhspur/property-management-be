# ADR-0004 — Agreement Entity Integration with Ownership Link and Vacancy

**Status:** Accepted
**Date:** 2026-07-03

## Context

Introducing the Agreement entity (Tenant + Property + terms: dates, rent, deposit, status) required deciding how it relates to two things that already exist: the Ownership Link (`owner_tenant`, gates document access between a Property Owner and Tenant) and `properties.is_vacant` (manually-set flag).

Three integration questions came up, all with genuine alternatives:

1. Should creating an Agreement auto-create the Ownership Link, or require one to pre-exist?
2. Should `is_vacant` stay an independent manual flag, or be derived from Agreement state?
3. Should ending an Agreement also remove the Ownership Link?

## Decision

- **Agreement creation requires a pre-existing Ownership Link.** It does not auto-create one. The Property Owner must link the Tenant first (existing flow), then create the Agreement. This keeps "who can see whose documents" (Ownership Link) and "who is renting what, under what terms" (Agreement) as separate concerns with separate creation paths, rather than conflating them.
- **`is_vacant` is derived, not manually settable once an Agreement exists.** It flips automatically in the same transaction as Agreement creation/termination, so it can't drift out of sync with reality.
- **Ending an Agreement does not remove the Ownership Link.** The Link persists indefinitely, so a Property Owner retains access to a former Tenant's documents (e.g., citizenship, past agreement PDFs) after move-out. A returning Tenant reuses the existing Link when a new Agreement is created.

## Consequences

- Two-step flow to get a tenant into a property (link, then agreement) — not a single "add tenant + move them in" action. Deliberate: avoids a hidden side effect where creating an Agreement silently grants document access.
- `is_vacant` should no longer be exposed as a directly editable field on the property update endpoint once Agreements ship — attempts to set it manually should be rejected or ignored in favor of the derived value.
- Ownership Links are permanent once created; there is no "unlink" path today. If that's ever needed (e.g., owner wants to revoke access to a long-gone tenant's documents), it's a separate feature, not something Agreement termination should do implicitly.
