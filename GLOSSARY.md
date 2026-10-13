# PropTrove

A property management platform that connects Property Owners with their Tenants and tracks documents for both.

## Language

**Property Owner**:
A user who owns one or more properties and is responsible for managing Tenants and their Documents.
_Avoid_: landlord, owner, user

**Tenant**:
A user created and linked to a Property Owner via an Ownership Link. A Tenant occupies at most one Property at a time, recorded via an Agreement — the Ownership Link itself carries no property or occupancy information.
_Avoid_: renter, occupant, user

**Invite**:
The email a Tenant receives when a Property Owner creates them, with a link to set their own password. The Property Owner never chooses or knows a Tenant's password. Until the Tenant uses it, they are invite pending and can't sign in; the Property Owner can resend it. The link expires after 7 days and works once.
_Avoid_: invitation, activation email, welcome email

**Document**:
A file kept in the system as a record, belonging to exactly one thing: a person, a Property, an Agreement or a Payment. Which one it belongs to is its kind, and it is reached through that owner. A Document is never shared between two owners.
_Avoid_: file, attachment, upload

**Personal Document**:
A Document belonging to a person — a Property Owner's or a Tenant's identity papers such as citizenship or a driving licence — filed under a document category.
_Avoid_: user file, identity file

**Property Document**:
A Document belonging to a Property, such as its title deed (lalpurja), map or photos.
_Avoid_: property file

**Agreement Document**:
A Document belonging to one Agreement, such as the signed contract for that tenancy. It concerns the Tenant but belongs to the Agreement, so it is reached through the Agreement, not through the Tenant.
_Avoid_: lease document, tenant document

**Payment Receipt**:
A Document belonging to one Payment as proof the money was received — a photo or scan of the cash receipt, cheque or bank slip — kept in case the Tenant later disputes the Payment.
_Avoid_: proof of payment (in code and API), attachment

**Signed View URL**:
A short-lived link that lets a browser show a Document, or a Tenant's profile photo, without signing in. Made on demand for someone allowed to see it; never stored.
_Avoid_: download link, file URL, presigned URL

**Ownership Link**:
The association between a Property Owner and a Tenant, recorded in the system to authorize the Property Owner to manage that Tenant's Documents. Independent of occupancy: it persists even after an Agreement ends, and must exist before an Agreement can be created.
_Avoid_: relationship, assignment

**Ownership**:
Whether a Property Owner may act on a record. A Property Owner owns a record when it hangs off one of their Properties (the Property itself, its Agreements, their Payments, and the Property, Agreement and Payment Receipt Documents of these) or off a Tenant linked to them by an Ownership Link (the Tenant and the Tenant's Personal Documents). An Ownership Link is one of the two routes to Ownership, not a synonym for it. To anyone without Ownership, a record behaves as if it doesn't exist.
_Avoid_: access, permission, authorization (for this record-level sense; role checks are separate)

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
_Avoid_: transaction, ledger entry, receipt (that is the Payment Receipt, a Document)

**Payment Purpose**:
What a Payment was for: rent, security deposit, advance, utilities, maintenance, or other. Advance is a distinct purpose from rent, mirroring the Agreement terms where advance amount and rent are already separate. Purpose is what makes a Payment countable — totals such as rent paid to date are computed over a single purpose, never across all Payments.
_Avoid_: type, category, reason

**Fiscal Year**:
The Nepali fiscal year, running Shrawan 1 to the last day of Ashad in Bikram Sambat — so FY 2080/81 begins in Shrawan 2080 and ends in Ashad 2081. Statements are scoped by Fiscal Year, never by BS calendar year and never by Gregorian year. Dates are recorded in Gregorian (AD) and shown in Bikram Sambat (BS); BS is a presentation of a date, never a second date.
_Avoid_: financial year, FY (unqualified), tax year, calendar year

**Arrears**:
Rent for periods that have already elapsed and remain unsettled by any Payment. Computed as a set difference: the rent periods expected under the Agreement up to today, minus the periods actually settled. Each unsettled period is owed at the Rent In Force for that period, not at a single flat rent. Arrears is a debt owed now. It is never the value of rent not yet due — future scheduled rent is not arrears and is not shown as money owed.
_Avoid_: outstanding balance, dues, overdue amount, remaining contract

**Next Due Date**:
The first day of the next rent period that hasn't yet fallen due: the first period starting after today (Kathmandu), within the Agreement's term. A rent period falls due on its first day, so the period starting today is already due. Before the Agreement starts, it is the first period; an ended Agreement, or one with no period left in its term, has none. Its rent is that period's Rent In Force.
_Avoid_: due date (unqualified), next payment date

**Portfolio Arrears**:
Arrears summed across every Agreement a Property Owner has — active or ended — over each Agreement's whole life up to today, not limited to one Fiscal Year. Ending an Agreement doesn't forgive what the Tenant still owes, so a former Tenant's unpaid rent stays in it until paid. It is the same per-period calculation as a Payment Statement's Arrears; the Statement shows the slice falling in one Fiscal Year.
_Avoid_: total dues, balance

**Business Date**:
Today's date in Kathmandu. Every "today", "this month" and "due so far" means the Business Date, wherever the person or the server happens to be.
_Avoid_: server date, local date

**Activity Event**:
An immutable record that something happened to a Property Owner's portfolio — a property added or removed, a tenant linked or removed, an Agreement created or ended, a Payment recorded, changed or deleted. Written at the moment of the change, with names and amounts copied in, so it stays readable after its subject is gone. See ADR-0008.
_Avoid_: audit log, history (unqualified), notification

**Payment Statement**:
A per-Agreement account of one Fiscal Year, organised by the rent periods the Agreement expects: what each period cost, whether a Payment settled it, and what remains in Arrears. It is always calculated afresh from current records, never stored, so it reflects the truth at the moment it is read rather than the moment it was issued.
_Avoid_: invoice, bill, account statement

**Ledger**:
A Property Owner's cash-flow view across all their Agreements, organised by when money was received rather than by what it settled. Answers "what came in during this window", where a Payment Statement answers "was this period paid". The two disagree whenever rent is paid late, and both are correct.
_Avoid_: transactions list, payment history

## Example dialogue

> Dev: "Can a Property Owner see a Tenant's Documents?"
> Domain expert: "Their Personal Documents, yes — but only if there's an Ownership Link between them. The Property Owner opens each one through a Signed View URL."
>
> Dev: "And the signed contract? It's about the Tenant."
> Domain expert: "It's about the Tenant, but it belongs to the Agreement — it's an Agreement Document. You reach it through the Agreement, and the Tenant's Personal Documents don't include it. Same with a Payment Receipt: it belongs to its Payment."

> Dev: "The tenant paid Shrawan's rent in Bhadra. The Ledger for Shrawan shows nothing, but the Payment Statement shows Shrawan as settled. Is one of them broken?"
> Domain expert: "Both are right. The Ledger tells you what money came in during Shrawan — none did. The Payment Statement tells you whether Shrawan's rent got settled — it did, late. If they always agreed we wouldn't need two views."
>
> Dev: "Then what shows up as Arrears?"
> Domain expert: "Nothing, once it's paid. Arrears is only periods that have come due and still aren't settled. And don't add the rest of the contract to it — a tenant three months into a two-year term doesn't owe you the other twenty-one months today."

