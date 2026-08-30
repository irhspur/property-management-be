# ADR-0002 — Stay on Express; No Framework Migration

**Status:** Accepted
**Date:** 2026-06-23

## Context

The codebase has grown messy (~4,200 lines across controllers, SQL embedded directly in controllers, duplicated patterns). The question was raised whether switching to an opinionated framework (NestJS, AdonisJS) would fix this.

## Decision

Do not migrate to a new framework. Stay on Express.

The root cause of the mess is the absence of a service/model layer — not Express itself. A framework migration would be weeks of rewrite and the same structural problems would re-emerge inside the new framework if the layering discipline isn't enforced.

The MVC refactor (ADR-0001) addresses the actual problem.

## Consequences

- No migration cost
- MVC refactor (ADR-0001) remains the primary cleanup effort
- If TypeScript is adopted later (ADR-0003), the layered structure makes that migration cleaner
