# ADR-0006 — Dates Stored in Gregorian, Presented in Bikram Sambat

**Status:** Accepted
**Date:** 2026-08-22

## Context

Every date users see in PropTrove is Bikram Sambat: statement dates (`2080/08/15 BS`), rent
periods named by BS month (Baishak, Jestha, Ashad), and fiscal year selectors (`FY 2080/81`).
The Payment feature makes this unavoidable — a Payment Statement is scoped by the Nepali
fiscal year and its rows are named by BS month.

That raised two coupled questions:

1. What calendar do we **store** dates in?
2. Where does the BS↔AD conversion come from?

The second is not a formality. Bikram Sambat has **no closed-form conversion**: month lengths
vary between 29 and 32 days on a per-year basis, fixed by published almanac data rather than a
rule. Any conversion is a table lookup, and any table has a horizon — it covers only the years
someone has tabulated.

A third fact forced the issue: resolving `FY 2080/81` into a `WHERE` clause requires BS
knowledge **server-side**. Conversion could not be left to the client as a pure presentation
concern.

## Decision

**Dates are stored in Gregorian (AD) `DATE` columns. Bikram Sambat is a presentation of a
date, never a second stored date. Conversion uses a seeded lookup table, not a library.**

- `payments.paid_on` and `payments.covers_period_start` are AD `DATE`, matching every existing
  date column in the schema (`dob`, `citizenship_issue_date`, `agreements.start_date` /
  `.end_date`).
- A `bs_month (bs_year, bs_month, ad_start_date, days)` table maps BS months to AD dates
  directly, seeded from CSV through the existing `pg-copy-streams` path used for geography data.
- The Nepali fiscal year — Shrawan 1 to the last day of Ashad — is resolved to an AD range
  through that table. `fiscal_year=2080` denotes FY 2080/81, named by its opening year.

Rejected alternatives:

- **Storing both AD and BS columns.** Two sources of truth for one instant, free to drift, and
  every comparison against `agreements.start_date` would have to pick one. A BS-native column
  would also make `payments.covers_period_start` the only date in the schema that cannot be
  compared to an Agreement's dates without conversion.
- **An npm conversion library.** Cheaper up front, but it puts an unaudited third-party
  dependency in the path of every statement render, hides the horizon problem behind an API,
  and is not inspectable when a date looks wrong. The seed table matches how this codebase
  already loads reference data and can be diffed against an almanac.

## Consequences

- **The seed data has no source in this repo.** It must come from a vetted almanac, and it is
  the only reference data here that cannot be derived or verified from within the project.
- **The table's year range is a hard product limit.** A statement cannot be rendered for a
  fiscal year outside the seeded range. This should fail with a clear message rather than a
  silent empty result, and the range should be extended well ahead of need.
- **Conversion is server-side, not presentational.** The API accepts and returns AD dates plus
  BS renderings; clients do not convert. This keeps one implementation rather than one per
  client.
- **Correctness is testable.** Known BS↔AD pairs can be asserted directly against the table.
  A library would make the same tests indirect.
- **Nothing in the existing schema changes.** All prior date columns were already AD and remain
  correct under this decision.
