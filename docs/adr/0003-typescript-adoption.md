# ADR-0003 — TypeScript Adoption (deferred)

**Status:** Accepted (pending MVC refactor)
**Date:** 2026-06-23

## Context

Raw SQL query results come back as `any` from `pg`, giving zero type safety on the data layer. TypeScript would catch shape mismatches and improve IDE support. The question is when and how to adopt it.

## Decision

Adopt TypeScript, but only after the MVC refactor (ADR-0001) is complete.

Doing both at once risks "TypeScript theater" — slapping `any` everywhere just to get the project compiling, with no real type safety gained. The MVC layer boundaries (models, services, controllers) provide natural places to define interfaces, and typed query results at the model layer propagate cleanly upward.

Migration strategy once the refactor is done:
- Add `tsconfig.json` with `allowJs: true` for incremental migration
- Start with the new `models/` layer (highest value — typed query results)
- Migrate `services/` next, then `controllers/`
- Convert old files as they are touched, not all at once

If new features are being added before the refactor is done, write those files in TypeScript from the start.

## Consequences

- TypeScript blocked on ADR-0001 completion
- Incremental migration means a mixed JS/TS codebase during transition — acceptable with `allowJs: true`
- No ORM needed to get typed results; interfaces on raw `pg` row shapes are sufficient
