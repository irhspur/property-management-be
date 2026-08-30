# PropTrove

A property management platform that connects Property Owners with their Tenants and tracks documents for both.

## Language

**Property Owner**:
A user who owns one or more properties and is responsible for managing Tenants and their Documents.
_Avoid_: landlord, owner, user

**Tenant**:
A user created and linked to a Property Owner via an Ownership Link. A Tenant occupies at most one Property at a time, recorded via an Agreement — the Ownership Link itself carries no property or occupancy information.
_Avoid_: renter, occupant, user

**Document**:
A file uploaded into the system, associated with either a specific User (personal identity documents such as citizenship, driving licence) or a Property (title deed, agreement). Every Document belongs to one User and optionally to one Property, and optionally to one Agreement (e.g. the signed contract for that specific tenancy).
_Avoid_: file, attachment, upload

**Signed View URL**:
A time-limited link (5-minute JWT) that allows a browser to render a Document directly without requiring authentication. Generated on demand; not stored.
_Avoid_: download link, file URL, presigned URL

**Ownership Link**:
The association between a Property Owner and a Tenant, recorded in the system to authorize the Property Owner to manage that Tenant's Documents. Independent of occupancy: it persists even after an Agreement ends, and must exist before an Agreement can be created.
_Avoid_: relationship, assignment

**Agreement**:
The record of a Tenant occupying a specific Property under agreed terms — start date, end date, rent, security deposit, advance amount, agreement duration, payment period, and an optional rent increment (increment duration + increment percentage). Requires an existing Ownership Link between the Property's owner and the Tenant; a Property and a Tenant each hold at most one active Agreement at a time. Ending an Agreement is an explicit action (not automatic on `end_date` passing) and flips the Property back to vacant without removing the Ownership Link. Advance amount (upfront rent, typically adjusted against future rent) is distinct from security deposit (refundable, held against damage). Agreement duration is a declared term independent of `end_date` — the two are not validated against each other.

Rent increment terms are applied, not merely recorded. The rent stated on the Agreement is the rent at the start of the term; the rent in force for any later period is that figure compounded by the increment percentage once per increment duration. Because payment periods are one, three, six, or twelve months and increment durations are whole years, an increment always falls on a payment period boundary — no period is ever split across two rents.
_Avoid_: lease, contract, tenancy, rental, escalation (for rent increment), prepayment (for advance amount)

**Rent In Force**:
The rent that applies to a particular rent period of an Agreement — the Agreement's starting rent compounded by its increment terms for each completed increment duration since the term began. It is calculated from the Agreement's recorded terms whenever it is needed, never stored, so correcting a term corrects every past and future statement at once. An Agreement with no increment terms has one Rent In Force for its whole term.
_Avoid_: current rent, escalated rent, adjusted rent

**Payment**:
A record of money received by a Property Owner from a Tenant against a specific Agreement. Always belongs to exactly one Agreement — the Property and Tenant it concerns are derived from that Agreement, never recorded independently. A Payment records money that has already changed hands elsewhere; the system does not move money.

Every Payment carries exactly one Payment Purpose. Money covering two purposes is two Payments, never one combined record — there are no line items within a Payment.

A Payment records two distinct dates: when the money was received, and which rent period it settles. These routinely differ — rent is often paid late, sometimes early — and collapsing them into one date makes unpaid periods invisible. Only a rent Payment settles a period. An advance, security deposit, utility, or maintenance Payment settles none — an advance is a lump against the Agreement, reconciled against the advance amount the Agreement declares, and the system does not draw it down against future rent. One Payment settles one period: money covering two months is two Payments.

Paying next month's rent early is rent settling a future period — it is not an advance. Advance remains what the Agreement declares: an upfront lump, distinct from rent.

Only a Property Owner records Payments. A Payment is therefore a statement of fact by the owner, not a claim awaiting confirmation — it has no pending/verified lifecycle.
_Avoid_: transaction, ledger entry, receipt

**Payment Purpose**:
What a Payment was for: rent, security deposit, advance, utilities, maintenance, or other. Advance is a distinct purpose from rent, mirroring the Agreement terms where advance amount and rent are already separate. Purpose is what makes a Payment countable — totals such as rent paid to date are computed over a single purpose, never across all Payments.
_Avoid_: type, category, reason

**Fiscal Year**:
The Nepali fiscal year, running Shrawan 1 to the last day of Ashad in Bikram Sambat — so FY 2080/81 begins in Shrawan 2080 and ends in Ashad 2081. Statements are scoped by Fiscal Year, never by BS calendar year and never by Gregorian year. Dates are recorded in Gregorian (AD) and shown in Bikram Sambat (BS); BS is a presentation of a date, never a second date.
_Avoid_: financial year, FY (unqualified), tax year, calendar year

**Arrears**:
Rent for periods that have already elapsed and remain unsettled by any Payment. Computed as a set difference: the rent periods expected under the Agreement up to today, minus the periods actually settled. Each unsettled period is owed at the Rent In Force for that period, not at a single flat rent. Arrears is a debt owed now. It is never the value of rent not yet due — future scheduled rent is not arrears and is not shown as money owed.
_Avoid_: outstanding balance, dues, overdue amount, remaining contract

**Payment Statement**:
A per-Agreement account of one Fiscal Year, organised by the rent periods the Agreement expects: what each period cost, whether a Payment settled it, and what remains in Arrears. It is always calculated afresh from current records, never stored, so it reflects the truth at the moment it is read rather than the moment it was issued.
_Avoid_: invoice, bill, account statement

**Ledger**:
A Property Owner's cash-flow view across all their Agreements, organised by when money was received rather than by what it settled. Answers "what came in during this window", where a Payment Statement answers "was this period paid". The two disagree whenever rent is paid late, and both are correct.
_Avoid_: transactions list, payment history

## Example dialogue

> Dev: "Can a Property Owner see a Tenant's Documents?"
> Domain expert: "Yes — but only if there's an Ownership Link between them. The Property Owner generates a Signed View URL for each Document they want to inspect in the browser."
>
> Dev: "What if the Tenant uploaded the Document themselves?"
> Domain expert: "Doesn't matter — the Document still belongs to the Tenant. The Property Owner's access is governed by the Ownership Link, not by who originally uploaded it."

> Dev: "The tenant paid Shrawan's rent in Bhadra. The Ledger for Shrawan shows nothing, but the Payment Statement shows Shrawan as settled. Is one of them broken?"
> Domain expert: "Both are right. The Ledger tells you what money came in during Shrawan — none did. The Payment Statement tells you whether Shrawan's rent got settled — it did, late. If they always agreed we wouldn't need two views."
>
> Dev: "Then what shows up as Arrears?"
> Domain expert: "Nothing, once it's paid. Arrears is only periods that have come due and still aren't settled. And don't add the rest of the contract to it — a tenant three months into a two-year term doesn't owe you the other twenty-one months today."

