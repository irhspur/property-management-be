# ADR-0007 — A Payment Records Both When It Was Received and Which Period It Settles

**Status:** Accepted
**Date:** 2026-08-22

## Context

The Payment Statement exists to answer "has this month's rent been paid?" and to quantify
Arrears. The screen designs modelled a payment with a single date and a `Month` column derived
from it — implicitly assuming rent for month N is always paid within month N.

Nepali rent practice does not honour that assumption. Rent is routinely paid late and
sometimes early. Under a single date:

- A tenant who pays nothing in Shrawan and then hands over two months' rent in Bhadra produces
  either one row labelled Bhadra (Shrawan silently vanishes) or two rows both labelled Bhadra
  (Shrawan still vanishes, and Bhadra appears double-paid).
- Arrears becomes uncomputable. There is no way to name *which* period is unpaid, only to
  observe that totals do not match.

An alternative was to keep one date and infer coverage by counting rent Payments forward from
`agreements.start_date` — the Nth rent payment settles the Nth period. This breaks on partial
payment, out-of-order payment, and skipped months, which are precisely the cases the statement
exists to expose.

## Decision

**A Payment records two dates, and a rent Payment must land on the Agreement's period grid.**

- `paid_on` — when the money changed hands. Cash flow.
- `covers_period_start` — the first day of the rent period settled. Obligations.
- `covers_period_start` is required for `rent` Payments and NULL for every other Payment
  Purpose. An advance, deposit, utility or maintenance Payment settles no rent period.
- **One Payment settles one period.** Money covering two months is two Payments. There are no
  line items within a Payment.
- **The grid is strict:** `covers_period_start` is rejected unless it equals
  `start_date + N × payment_period` and falls within the Agreement's term.
- The period's *length* is not stored on the Payment — it is `agreements.payment_period_id`,
  which already has one home.

The two dates give the two screens different organising principles, deliberately:

- The **Ledger** filters and sorts on `paid_on` — it is a cash-flow view reconcilable against a
  bank statement.
- The **Payment Statement** is organised by `covers_period_start` — it walks the Agreement's
  periods and reports whether each was settled, while still displaying `paid_on` so lateness is
  visible.

They disagree whenever rent is paid late. Both are correct, and the labels must say which date
each is showing.

## Consequences

- **Arrears is a set difference, not arithmetic.** Expected periods up to today, minus periods
  settled, each priced at its Rent In Force (ADR-0005). This is only possible because both
  sides land on the same grid — which is the entire reason strictness was chosen over
  permissiveness.
- **Strictness is a real constraint on data entry.** An owner cannot record rent against an
  arbitrary date. This is the point: one owner typing the 12th instead of the 1st would
  otherwise create a period matching nothing, leaving the intended month permanently "unpaid"
  with no visible cause — a bug users experience as "the app is wrong".
- **Partial and irregular payment still work.** Paying on the 12th is `paid_on`. Paying half a
  month twice is two Payments sharing one `covers_period_start`. Neither bends the grid.
- **Correcting an Agreement's `start_date` after Payments exist shifts the grid** and can orphan
  previously-valid rows. Rare, but it is a data-migration concern rather than a daily one, and
  there is no guard against it today.
- **The Statement shows unpaid periods as rows**, not just a total, because the grid makes them
  enumerable. Periods not yet due are hidden — future rent is not a debt (see Arrears in
  `CONTEXT.md`).
- **Advance is not early rent.** Paying next month's rent early is a `rent` Payment with a
  forward `covers_period_start`. Advance remains an Agreement term recorded as a lump with no
  period, and the system does not draw it down against future rent.
