# ADR-0005 — Rent Increments Are Applied, Derived Not Stored

**Status:** Accepted
**Date:** 2026-08-22
**Supersedes:** the "recorded only" rent increment rule established alongside ADR-0004

## Context

ADR-0004 introduced the Agreement with rent increment terms (`increment_duration_id`,
`increment_percentage_id`) recorded but never applied — `CONTEXT.md` stated plainly that
"the system does not automatically apply them to `rent`". `agreements.rent_amount` was
therefore *the* rent, constant for the whole term.

Designing the Payment Statement broke that. The statement must price each rent period to
compute Arrears, and it displays a rent increment schedule. Under "recorded only" the same
page would show a projected year-two rent of 33,000 directly above an arrears figure charging
30,000 for a year-two month — two numbers disagreeing on a document that carries signature
blocks.

Applying increments needed a storage decision with three genuine options:

1. **Derived** — `rent_amount` is rent *at start*; rent for any period is computed on demand.
2. **Effective-dated schedule** — materialise `(agreement_id, effective_from, rent_amount)`
   rows for the whole term at Agreement creation.
3. **Scheduled mutation** — a job rewrites `agreements.rent_amount` when an increment falls due.

A property of the seed data makes all three viable without pro-rating: payment periods are
1/3/6/12 months and increment durations are 1/2/3 years, so an increment boundary always
lands on a payment period boundary. No rent period is ever split across two rents.

## Decision

**Rent increments are applied, and the applied rent is derived, never stored.**

- `agreements.rent_amount` is redefined as **rent at the start of the term**.
- Rent In Force for a period is `rent_amount` compounded once per completed increment
  duration: `rent_amount × (1 + pct)^floor(months_since_start / increment_months)`.
- **Rounding is applied at each increment step**, to 2 decimal places — not once at the end.
  A real renegotiation lands on a round figure and the next increment is taken on that
  figure, so step-rounding models what actually happens. The two approaches diverge further
  every year, so the choice is not cosmetic.
- An Agreement with no increment terms yields `rent_amount` for every period, unchanged.
- Arrears prices each unsettled period at that period's Rent In Force, not at a flat rent.

Options 2 and 3 were rejected:

- **(3) Scheduled mutation destroys history.** Once `rent_amount` is overwritten, last year's
  statement re-renders with this year's rent — a signed document silently changing after the
  fact. It also needs a scheduler this repo does not have, and a missed run leaves data
  quietly wrong with no signal.
- **(2) An effective-dated table buys flexibility with no current use.** Its advantage is
  mid-term renegotiation, which nothing in the domain supports today —
  `agreements_one_active_per_property` implies the answer to renegotiation is "end the
  Agreement, create a new one". It is a clean forward migration from the derived function if
  that changes: materialise what the function already computes.

## Consequences

- **`rent_amount` changes meaning.** Any client reading it as "the current rent" is now wrong
  for any Agreement past its first increment. `API_DOCS.md` and validation messages need to
  say "rent at start of term".
- **Correcting a term corrects all history.** Fixing a wrong `start_date` or
  `increment_percentage_id` recomputes every past and future statement consistently. Under
  (2) or (3) this would be a data repair.
- **Arrears is no longer `months × rent`.** Every total that walks periods must price each
  period individually. Callers cannot shortcut this.
- **The rent increment schedule shown on a statement is now truthful** rather than a
  projection contradicting the system's own arithmetic. It renders only for the Agreement's
  actual duration, not a fixed four years.
- **The derivation must live in exactly one place** and be used by both the statement and the
  arrears calculation. Two implementations would reintroduce the contradiction this ADR exists
  to remove.
- **The seed-data alignment property is load-bearing.** Adding a payment period that is not a
  divisor of every increment duration in months (e.g. a 5-month period) would split a rent
  period across two rents and break the model. New `payment_period` or `increment_duration`
  rows must preserve it.
