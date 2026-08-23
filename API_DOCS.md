# PropTrove API Documentation

Base URL: `http://localhost:<PORT>`

## Conventions

- All responses: `{ "status": "AK", "data": ... }` (success) or `{ "status": "NAK", "message": "..." }` (failure) — except express-validator failures, which return `{ "errors": [...] }` with no `status` field (see [Common Error Responses](#common-error-responses)), and multer file-upload errors, which currently bypass the JSON envelope entirely (see [File Uploads](#file-uploads) below).
- Auth: `Authorization: Bearer <token>` header on all protected routes
- Token lifetime: 1 hour (session JWT)
- User types: `admin`, `property_owner`, `tenant` — numeric IDs `1`, `2`, `3` respectively (see [User Types](#user-types-user-type)). `user_type_id` is what `POST /auth/register` actually expects.
- **IDs:** UUID strings for user-created records (`user_id`, `property_id`, `file_id`, `agreement_id`, tenant IDs, etc.); small integers for lookup-table records (`gender_id`, `country_id`, `property_type_id`, `agreement_duration_id`, etc.).
- **Numeric fields are returned as strings**, not JSON numbers — `pg` serializes `DECIMAL`/`NUMERIC` columns as strings to avoid float rounding. This affects `rent_amount`, `security_deposit`, `advance_amount`, `property_value`, `amount` (Payments), and all `*_in_years`/`*_percentage` lookup values (e.g. `"rent_amount": "25000.00"`). Parse before doing arithmetic. **`payment_reference` is also a string** for the same reason — it's `BIGSERIAL`, and `pg` stringifies `bigint` too since it can exceed JS's safe integer range. By contrast, computed fields the backend already parsed to a number before responding — `rent_in_force`, `paid_amount`, `arrears`, `total_rent_collected` (Payments/Statement endpoints) — come back as real JSON numbers, not strings. Check each endpoint's field list below rather than assuming.
- **Timestamps** (`created_at`, `updated_at`, `dob`, `paid_on`, `covers_period_start`, etc.) are ISO 8601 UTC strings, e.g. `"2026-08-16T11:25:58.461Z"`. Fields that are calendar dates in Bikram Sambat, not Gregorian (`period_start_bs`, `statement_date_bs`, everywhere a Payment endpoint mentions "BS") come back as a structured object instead — `{ bs_year, bs_month, month_name, day }` — never a string, since BS has no single standard string format. See [Payments](#payments-property-owner).
- **No pagination** on most endpoints — list endpoints return the full result set every time. The one exception is the Payment Ledger (`GET /property-owner/payments`), which paginates by default — see [Payments](#payments-property-owner).
- **CORS** is open to all origins (`cors()` with no options) — no preflight/origin restrictions to work around.
- **No rate limiting** is currently enforced on any route.
- **Empty-list behavior is not uniform** — some list endpoints return `200` with `data: []`, others return `404`. See the table below; get this wrong and empty results will render as an error state instead of an empty state (or vice versa).

  | Returns `200` + `data: []` when empty | Returns `404` when empty |
  |---|---|
  | `GET /user/files`, `GET /user/property-files` | `GET /user/properties`, `GET /user/property?mobile_number=` |
  | `GET /property-owner/tenants`, `GET /property-owner/tenant/:id/files` | `GET /admin/property-owners`, `GET /admin/property-owners/documents` |
  | `GET /property-owner/agreements`, `GET /property-owner/tenant/:id/agreements` | `GET /admin/properties`, `GET /admin/properties/documents` |
  | `GET /property-owner/tenant/:tenantId/agreement/:agreementId/payments`, `GET .../agreement/:agreementId/statement` (empty `periods`, not the statement itself) | — |
  | All plain lookup-table `GET /<lookup>` (no filter) — country, province, district, municipality, gender, user-type, file-category, property-file-category, property-type, agreement-duration, increment-duration, increment-percentage, payment-period, payment-purpose, payment-method | Filtered lookup endpoints — `GET /province/by-country`, `GET /district/by-province`, `GET /municipality/by-district` |

---

## File Uploads

Applies to every `multipart/form-data` upload endpoint: `POST/PUT /user/file`, `POST/PUT /user/property-file/:id`, `POST/PUT /property-owner/tenant/:tenantId/upload-files` and `.../file/:fileId`. Allowed types: JPEG, PNG, PDF. Max size: 10 MB per file.

> ⚠️ **Known gap:** rejections from multer's file-type/size checks (wrong MIME type, file over 10 MB) are **not** caught by the route handler — they bypass the `{ status: "NAK", message }` JSON envelope entirely and currently come back as Express's default error page: `Content-Type: text/html`, HTTP `500`, with a raw stack trace in the body (dev-mode default, since no custom Express error-handling middleware is registered). Every other failure mode in this API returns clean JSON — this is the one exception. The frontend should `try/catch` a failed `res.json()` parse on these specific endpoints and treat a non-JSON response as "invalid file type or too large" rather than a generic server error. (Worth a backend fix — a global Express error handler or a small multer error-catching wrapper on these routes — flagging it here since it changes error handling on the frontend today.)

---

## Auth (`/auth`)

### POST /auth/register
Create a new user account. Sends a verification email (link valid **24 hours**) before the account is usable.

**Body:**
```json
{
  "email": "string (max 100)",
  "password": "string (7–14 chars, 1 uppercase, 1 digit, 1 special char)",
  "user_type_id": "integer (1 = admin, 2 = property_owner, 3 = tenant)"
}
```
**Response:** `{ status, message, data: user, token: verificationToken }` — `data.user` no longer includes the password hash (stripped server-side before the response is built).

> The verification token is also returned directly in the response (`token`), not just emailed — useful for local dev/testing without a working mail sender, since `EMAIL_USER`/`EMAIL_PASS` point at an Ethereal test inbox by default.

---

### POST /auth/resend-verification
Re-send the verification email for an unverified account. *(Not documented previously — exists and is routed.)*

**Body:** `{ "email": "string" }`

**Fails if:** email not found (`404`), account already verified (`400`).

---

### GET /auth/verify-email
Verify email address from the link sent after registration.

**Query:** `?token=<verificationToken>`

---

### POST /auth/login
**Body:**
```json
{
  "email": "string",
  "password": "string"
}
```
**Response:** `{ status, data: user, token: jwtToken }` — `data.user` has the password hash stripped, same as register.

> Fails if: email not found, wrong password, password expired (>1 year old), not verified, not active.

---

### POST /auth/forgot-password
Send a password reset link to email. Reset token valid 15 minutes.

**Body:** `{ "email": "string" }`

> The reset token is also returned directly in the response (`token`), same dev-convenience caveat as registration.

---

### POST /auth/reset-password
**Query:** `?token=<resetToken>`

**Body:**
```json
{
  "newPassword": "string",
  "confirmNewPassword": "string"
}
```

---

### POST /auth/change-password
**Auth:** `admin`, `property_owner`, `tenant`

**Body:**
```json
{
  "oldPassword": "string",
  "newPassword": "string",
  "confirmNewPassword": "string"
}
```

---

## User Profile (`/user`)

All routes require `Authorization` header.

### GET /user
**Auth:** `admin`, `property_owner`, `tenant`

Returns the authenticated user's profile (joins `users` + `user_details`).

**Response data fields:** `user_id, email, first_name, last_name, middle_name, dob, father_full_name, nin_number, mobile_number, citizenship_number, citizenship_issue_date, bank_account_number, bank_name, is_verified, is_active, password_last_changed, created_at, updated_at`

---

### GET /user/profile
**Auth:** `admin`, `property_owner`, `tenant`

Returns the authenticated user's full profile with resolved gender, birth country, province, and district names (joins `users` + `user_details` + `gender` + `country` + `province` + `district`).

**Response data fields:** `user_id, email, first_name, middle_name, last_name, dob, father_full_name, nin_number, mobile_number, citizenship_number, citizenship_issue_date, bank_account_number, bank_name, is_verified, is_active, password_last_changed, created_at, updated_at, gender_id, gender, birth_country_id, birth_country, birth_province_id, birth_province, birth_district_id, birth_district`

---

### GET /user/address
**Auth:** `admin`, `property_owner`, `tenant`

Returns the authenticated user's address with resolved country, province, district, and municipality names.

**Response data fields:** `address_id, country_id, country, province_id, province, district_id, district, municipality_id, municipality, ward_number, street_name, house_number, contact_number_1, contact_number_2, contact_address`

---

### POST /user
**Auth:** `admin`, `property_owner`

Save user details + address in a single transaction. Inserts on first call, updates on subsequent calls (safe to call on every profile page save).

**Body:**
```json
{
  "first_name": "string (max 50, letters/spaces/hyphens)",
  "middle_name": "string (optional, max 50)",
  "last_name": "string (max 50)",
  "gender_id": "integer",
  "dob": "date (YYYY-MM-DD, before today)",
  "birth_country_id": "integer",
  "birth_province_id": "integer",
  "birth_district_id": "integer",
  "father_full_name": "string (max 100)",
  "nin_number": "string (max 10, alphanumeric)",
  "mobile_number": "string (10–15 digits)",
  "citizenship_number": "string (max 20, alphanumeric/hyphens/slashes)",
  "citizenship_issue_district_id": "integer",
  "citizenship_issue_date": "date (before today)",
  "bank_account_number": "string (max 20)",
  "bank_name": "string (max 100)",
  "address_country_id": "integer",
  "province_id": "integer",
  "district_id": "integer",
  "municipality_id": "integer",
  "ward_number": "string (numeric, max 3 digits)",
  "street_name": "string (3–100 chars)",
  "house_number": "string (optional, max 10)",
  "contact_number_1": "string (5–15 digits)",
  "contact_number_2": "string (optional, 5–15 digits)",
  "contact_address": "string (5–200 chars)"
}
```

---

### PUT /user/details
**Auth:** `admin`, `property_owner`

Update user details. `mobile_number` cannot be changed.

**Body:** Same fields as POST /user details section (excluding address fields). `mobile_number` must match existing.

---

### PUT /user/address
**Auth:** `admin`, `property_owner`

**Body:** Address fields from POST /user (`country_id, province_id, district_id, municipality_id, ward_number, street_name, house_number, contact_number_1, contact_number_2, contact_address`)

---

### DELETE /user
**Auth:** `admin`, `property_owner`

Deletes the authenticated user and their upload directory.

---

### GET /user/details
**Auth:** `admin`, `property_owner`

**Query:** `?mobile_number=<string>`

---

## User Files (`/user/file`)

**Auth:** `admin`, `property_owner` (write); `admin`, `property_owner`, `tenant` (read)

File uploads are `multipart/form-data`. Allowed types: JPEG, PNG, PDF. Max size: 10 MB per file.

### POST /user/file
Upload files for the authenticated user.

**Form fields:** `files` (array, max 10), `file_category_id` (integer)

---

### GET /user/files
Get all files belonging to the authenticated user. Returns an empty array if none exist.

---

### GET /user/file/:fileId
Get a single file record.

---

### PUT /user/file/:fileId
Replace a file. Same form fields as POST.

---

### DELETE /user/file/:fileId
**Auth:** `admin`, `property_owner`

---

### GET /user/file/:fileId/view-url
Generate a short-lived signed URL for viewing a file directly in a browser or document viewer (e.g. `<iframe>`, `<embed>`, PDF.js).

**Auth:** `admin`, `property_owner`, `tenant`

**Response:**
```json
{ "status": "AK", "data": { "url": "http://host/files/view/<token>" } }
```

The token is valid for **5 minutes**. Pass the URL directly to any viewer — no `Authorization` header required.

---

### GET /files/view/:token *(public)*
Serve the raw file bytes for a previously issued view token. No authentication header needed.

- Returns the file with its original `Content-Type`.
- Returns `401` if the token is missing, invalid, or expired.

**Typical usage:**
```html
<iframe src="<url from /view-url>" />
```
or fetch as a blob for PDF.js:
```js
const { data } = await fetch('/user/file/:fileId/view-url', { headers: { Authorization: `Bearer ${jwt}` } }).then(r => r.json());
const pdf = await pdfjsLib.getDocument(data.url).promise;
```

---

## Properties (`/user/property`)

**Auth:** `admin`, `property_owner`

### POST /user/property
**Body:**
```json
{
  "country_id": "integer",
  "province_id": "integer",
  "district_id": "integer",
  "municipality_id": "integer",
  "ward_number": "string (numeric)",
  "street_name": "string (3–100 chars)",
  "house_number": "string (optional, max 10)",
  "property_type_id": "integer",
  "property_name": "string (3–100 chars)",
  "property_description": "string (optional, max 500)",
  "property_value": "number (optional, max 15 digits)"
}
```

> `is_vacant` is not settable here — it's derived from Agreement state (see [Agreements](#agreements-property-owner)) and flips automatically when an agreement is created or ended.

---

### GET /user/properties
Get all properties of the authenticated user. **Returns `404`** (not an empty array) if the user has no properties — unlike most other "list mine" endpoints in this API, see [Conventions](#conventions).

**Response data fields (per property):** `property_id, user_id, property_type_id, property_type, country_id, country, province_id, province, district_id, district, municipality_id, municipality, ward_number, street_name, house_number, property_name, property_description, property_value, is_vacant, created_at, updated_at`

> FK IDs and their resolved names are both returned so the frontend can display names and pre-populate edit form dropdowns without extra requests.

---

### GET /user/property/:id
Get a property by ID.

**Response data fields:** Same as GET /user/properties (single object).

---

### GET /user/property
**Query:** `?mobile_number=<string>`

Get properties by mobile number. **Returns `404`** if none found (same as `GET /user/properties` above).

---

### PUT /user/property/:id
Update a property. Same body as POST.

---

### DELETE /user/property/:id

**Fails if:** not found or not owned by this user (`404`), the property is not vacant (`400`) — see `is_vacant` note above — or the property has any recorded Payments against it, even through an **ended** Agreement (`400`, `"Property has recorded payments and cannot be deleted"`). This second case is new: a property can read as vacant (all its Agreements have ended) while still carrying real payment history that deleting the property would cascade away. There is currently no way to delete a property once a Payment has been recorded against it.

---

## Property Files (`/user/property-file`)

**Auth:** `admin`, `property_owner`

File uploads are `multipart/form-data`. Allowed: JPEG, PNG, PDF. Max 10 MB.

### POST /user/property-file/:property_id
**Form fields:** `files` (array, max 10), `property_file_category_id` (integer)

---

### GET /user/property-files
Get all property files for the authenticated user. Returns an empty array if none exist.

---

### GET /user/property-file/:fileId
Get a single property file record.

---

### GET /user/property-file/:fileId/view-url
Generate a short-lived signed URL for viewing a property document directly in a browser or document viewer.

**Response:**
```json
{ "status": "AK", "data": { "url": "http://host/files/view/<token>" } }
```

The token is valid for **5 minutes**. Pass the URL directly to any viewer — no `Authorization` header required. See [`GET /files/view/:token`](#get-filesviewtoken-public) for serving details.

---

### PUT /user/property-file/:fileId
Replace a property file.

---

### DELETE /user/property-file/:fileId

---

## Tenants (`/property-owner`)

**Auth:** `admin`, `property_owner`

Property owners manage their tenants here. Creating a tenant also links them via `owner_tenant`.

> **`admin` role note:** `authorize(["admin", "property_owner"])` lets an `admin`-role user *call* every `/property-owner/tenant/:tenantId/...` and `/property-owner/tenant/:tenantId/agreement/...` route, but every one of those endpoints then checks the Ownership Link against the caller's own `user_id` (`WHERE property_owner_id = req.user.id`) — not against "any owner." In practice this means an `admin` account only succeeds on tenants *it personally created/linked while authenticated as that admin*; it does not grant blanket access to every property owner's tenants. Calling these as `admin` for a tenant linked to a different property owner returns `403`.

### POST /property-owner/tenant
Create tenant account + details + address in one transaction.

**Body:** All fields from auth register + user details + address:
```json
{
  "email": "string",
  "password": "string",
  "user_type_id": "integer (must be tenant type)",
  "first_name": "string",
  "middle_name": "string (optional)",
  "last_name": "string",
  "gender_id": "integer",
  "dob": "date",
  "country_id": "integer",
  "birth_province_id": "integer",
  "birth_district_id": "integer",
  "father_full_name": "string",
  "nin_number": "string",
  "mobile_number": "string",
  "citizenship_number": "string",
  "citizenship_issue_district_id": "integer",
  "citizenship_issue_date": "date",
  "bank_account_number": "string",
  "bank_name": "string",
  "address_country_id": "integer",
  "province_id": "integer",
  "district_id": "integer",
  "municipality_id": "integer",
  "ward_number": "string",
  "street_name": "string",
  "house_number": "string (optional)",
  "contact_number_1": "string",
  "contact_number_2": "string (optional)",
  "contact_address": "string"
}
```

**Response:** `{ status, data: { tenant, tenantDetails, tenantAddress }, message }` — `data.tenant` has the password hash stripped, same as `/auth/register`/`/auth/login`.

---

### GET /property-owner/tenants
Get all tenants linked to the authenticated property owner. Returns full joined data (user, details, address, names resolved). Returns an empty array if none exist.

---

### GET /property-owner/tenant/:tenantId
Get a single tenant (must be linked to requesting property owner).

---

### PUT /property-owner/tenantDetails/:tenantId
Update tenant personal details. `mobile_number` cannot be changed.

**Body:** User details fields (same as POST /user details section).

---

### PUT /property-owner/tenantAddress/:tenantId
Update tenant address.

**Body:** Address fields (`country_id, province_id, district_id, municipality_id, ward_number, street_name, house_number, contact_number_1, contact_number_2, contact_address`)

---

### POST /property-owner/tenant/:tenantId/upload-files
Upload identity documents for a tenant. One file per category allowed.

**Form fields:** `files` (array, max 10 — only 1 allowed per category), `file_category_id` (integer)

---

### GET /property-owner/tenant/:tenantId/files
List all files for a tenant. Returns an empty array if none exist.

---

### GET /property-owner/tenant/:tenantId/file/:fileId
Get a specific file for a tenant.

---

### GET /property-owner/tenant/:tenantId/file/:fileId/view-url
Generate a short-lived signed URL for viewing a tenant's document directly in a browser or document viewer.

**Response:**
```json
{ "status": "AK", "data": { "url": "http://host/files/view/<token>" } }
```

The token is valid for **5 minutes**. Pass the URL directly to any viewer — no `Authorization` header required. See [`GET /files/view/:token`](#get-filesviewtoken-public) for serving details.

---

### PUT /property-owner/tenant/:tenantId/file/:fileId
Replace a tenant file.

**Form fields:** `files`, `mobile_number` (optional filter), `file_category_id` (optional filter)

---

### DELETE /property-owner/tenant/:tenantId/file/:fileId
Delete a tenant file and remove from disk.

---

### DELETE /property-owner/tenant/:tenantId
Delete tenant user record and all their uploaded files.

---

## Agreements (`/property-owner`)

**Auth:** `admin`, `property_owner`

An Agreement records a Tenant occupying a specific Property under agreed terms. Creating one requires the Tenant to already be linked to the property owner (see [Tenants](#tenants-property-owner)) — it does not create the link. A Property and a Tenant may each have at most one **active** agreement at a time; the API rejects a second one with `400`. Creating an agreement flips the property's `is_vacant` to `false`; ending one flips it back to `true`. Ending is an explicit action — an agreement's `end_date` passing does not end it automatically, and ending never removes the tenant's ownership link (they keep document access).

`agreement_duration_id` and `payment_period_id` reference the [Agreement Durations](#agreement-durations-agreement-duration) and [Payment Periods](#payment-periods-payment-period) lookup tables. `advance_amount` (upfront rent, typically adjusted against future rent) is distinct from `security_deposit` (refundable, held against damage) and both may be set independently. `increment_duration_id` + `increment_percentage_id` (referencing [Increment Durations](#increment-durations-increment-duration) / [Increment Percentages](#increment-percentages-increment-percentage)) record an agreed rent-escalation clause. They must be provided together or not at all.

> ⚠️ **`rent_amount` means "rent at the start of the term", not "the current rent".** If increment terms are set, the actual rent for any later period is `rent_amount` compounded by `increment_percentage` once per `increment_duration`, and the frontend should **not** compute this itself — it's returned pre-computed, per period, as `rent_in_force` on the [Payment endpoints](#payments-property-owner) (the Ledger doesn't need it; the Statement does, one value per row). `agreement_duration_id`/`agreement_duration_in_years` is a separate, informational field and is never used to compute rent.

### POST /property-owner/tenant/:tenantId/agreement
Create an agreement between the authenticated property owner and this tenant.

**Body:**
```json
{
  "property_id": "uuid",
  "start_date": "date (YYYY-MM-DD)",
  "end_date": "date (optional — planned lease end; does not end the agreement on its own, and is not validated against agreement_duration_id)",
  "rent_amount": "number (max 15 digits)",
  "security_deposit": "number (optional, max 15 digits)",
  "advance_amount": "number (optional, max 15 digits)",
  "agreement_duration_id": "integer (FK -> agreement_duration)",
  "payment_period_id": "integer (FK -> payment_period)",
  "increment_duration_id": "integer (optional, FK -> increment_duration — must be set together with increment_percentage_id)",
  "increment_percentage_id": "integer (optional, FK -> increment_percentage — must be set together with increment_duration_id)"
}
```

**Fails if:** the tenant isn't linked to this owner (`403`), the property isn't owned by this owner (`404`), the property already has an active agreement (`400`), the tenant already has an active agreement (`400`), `end_date` isn't after `start_date` (`400`), or exactly one of `increment_duration_id`/`increment_percentage_id` is provided (`400`).

---

### GET /property-owner/agreements
List all agreements across every property owned by the authenticated property owner. Returns an empty array if none exist.

---

### GET /property-owner/tenant/:tenantId/agreements
List all agreements (active and ended) between the authenticated property owner and this tenant. Returns an empty array if none exist.

---

### GET /property-owner/tenant/:tenantId/agreement/:agreementId
Get a single agreement. Must belong to this owner and tenant.

**Response data fields:** `agreement_id, property_id, tenant_id, start_date, end_date, rent_amount, security_deposit, advance_amount, agreement_duration_id, agreement_duration_in_years, payment_period_id, payment_period, increment_duration_id, increment_duration_in_years, increment_percentage_id, increment_percentage, status, created_at, updated_at, property_name, property_owner_id, tenant_first_name, tenant_last_name, tenant_mobile_number`

> FK IDs and their resolved lookup values are both returned (e.g. `agreement_duration_id` + `agreement_duration_in_years`), same rationale as Properties — display values and pre-populate edit dropdowns without extra requests.

---

### PUT /property-owner/tenant/:tenantId/agreement/:agreementId/end
End an active agreement. Sets `status` to `ended`, sets `end_date` to today if not already set, and flips the property back to vacant.

**Fails if:** the agreement isn't found or doesn't belong to this owner/tenant (`404`/`403`), or it's already ended (`400`).

---

## Payments (`/property-owner`)

**Auth:** `admin`, `property_owner`

A Payment records money a Property Owner has **already received** from a Tenant against a specific Agreement — this API does not move money, integrate a payment gateway, or hold anything in escrow. It always belongs to exactly one Agreement; Property and Tenant are derived through it, never sent independently. A Payment can be recorded against an Agreement that has since **ended** — arrears from before move-out are still collectible. Payments are freely editable and deletable (no approval workflow, no `pending`/`verified` status) since only the owner who owns the Agreement can write them.

Every Payment has exactly one **Purpose** (`payment_purpose_id`, see [Payment Purposes](#payment-purposes-payment-purpose)) and one **Method** (`payment_method_id`, see [Payment Methods](#payment-methods-payment-method)). Money covering two purposes is always two Payments — there are no line items within one.

**The two dates, and why there are two:** `paid_on` is when the money changed hands. `covers_period_start` is which rent period it settles — required only when `payment_purpose_id` is **Rent** (seeded id `1`), and forbidden for every other purpose. Rent is routinely paid early or late, so these differ often. `covers_period_start` must land exactly on the Agreement's period grid (`start_date` + N × `payment_period`, N ≥ 0) and within the Agreement's term — the API rejects anything off-grid with `400`, on purpose, so a typo doesn't silently create an unpaid period nothing ever resolves. Advance and security-deposit Payments are lump sums against the Agreement, not tied to a period — they have no `covers_period_start` and are not drawn down against future rent by this API.

**Ledger vs. Statement — read this before building either screen.** They filter/sort on **different dates** and will legitimately disagree whenever rent is paid late:
- The **Ledger** (`GET /property-owner/payments`) is a cash-flow view across every Agreement the owner has, filtered and sorted on `paid_on` — "what came in, and when."
- The **Statement** (`GET .../agreement/:agreementId/statement`) is a single Agreement's obligations view, organized by `covers_period_start` — "was this period settled." It's where **Arrears** and **Rent In Force** (the real, already-compounded rent for a given period — see the ⚠️ note in [Agreements](#agreements-property-owner)) live.

A rent Payment recorded for a *future* period (paid ahead) shows up on the Ledger immediately but **not** on the Statement until that period is actually due — this is intentional, not a bug.

### POST /property-owner/tenant/:tenantId/agreement/:agreementId/payment
Record a Payment against this Agreement.

**Body:**
```json
{
  "payment_purpose_id": "integer (FK -> payment_purpose)",
  "payment_method_id": "integer (FK -> payment_method)",
  "amount": "number, > 0 (max 15 digits)",
  "paid_on": "date (YYYY-MM-DD), must not be in the future",
  "covers_period_start": "date (YYYY-MM-DD) — required if payment_purpose_id is Rent (1), forbidden otherwise; must fall exactly on the Agreement's period grid",
  "remarks": "string (optional, max 255)"
}
```
**Response:** `{ status, message, data: payment }`, same field shape as [GET .../payments](#get-property-ownertenanttenantidagreementagreementidpayments) below (a single object, not a list).

**Fails if:** the tenant isn't linked to this owner (`403`), the agreement isn't found or doesn't belong to this owner/tenant (`404`/`403`), `amount <= 0` (`400`), `covers_period_start` is missing/present when it shouldn't be (`400`), or `covers_period_start` isn't a valid period boundary for this Agreement (`400`).

---

### PUT /property-owner/tenant/:tenantId/agreement/:agreementId/payment/:paymentId
Update a Payment. Same body and validation as POST — this is a full replace, not a partial patch; send every field. `agreement_id` cannot be changed (it's not in the body).

---

### DELETE /property-owner/tenant/:tenantId/agreement/:agreementId/payment/:paymentId
Delete a Payment. No confirmation step, no soft-delete — this is permanent. **Response:** `{ status, message, data: payment }` (the now-deleted row).

---

### GET /property-owner/tenant/:tenantId/agreement/:agreementId/payments
List every Payment recorded against this Agreement, most recent `paid_on` first. Returns `200` with `data: []` if none exist (see [Conventions](#conventions)).

**Response data fields (per Payment):** `payment_id, payment_reference, agreement_id, payment_purpose_id, payment_purpose, payment_method_id, payment_method, amount, paid_on, covers_period_start, remarks, created_at, updated_at`

---

### GET /property-owner/tenant/:tenantId/agreement/:agreementId/payment/:paymentId
Get a single Payment. Same field shape as the list above.

---

### GET /property-owner/tenant/:tenantId/agreement/:agreementId/statement
The Payment Statement for one Agreement, one Fiscal Year — see the Ledger vs. Statement note above before using this.

**Query:** `?fiscal_year=<integer, optional>` — the **opening** BS year of the Fiscal Year, e.g. `2080` means FY 2080/81 (Shrawan 2080 – Ashad 2081). Defaults to the current Fiscal Year if omitted. Returns `400` with a clear message if the requested year falls outside the seeded BS calendar range (currently BS 2000–2090, roughly AD 1943–2034).

**Response:**
```json
{
  "status": "AK",
  "data": {
    "agreement": {
      "agreement_id": "uuid", "property_id": "uuid", "property_name": "string",
      "tenant_id": "uuid", "tenant_name": "string | null",
      "start_date": "YYYY-MM-DD", "end_date": "YYYY-MM-DD | null",
      "rent_amount": "number", "security_deposit": "number | null", "advance_amount": "number | null",
      "payment_period": "string", "status": "'active' | 'ended'"
    },
    "fiscal_year": "integer",
    "fiscal_year_range": { "from": "YYYY-MM-DD", "to": "YYYY-MM-DD" },
    "statement_date": "YYYY-MM-DD",
    "statement_date_bs": { "bs_year": "integer", "bs_month": "integer", "month_name": "string", "day": "integer" },
    "periods": [
      {
        "period_start": "YYYY-MM-DD",
        "period_start_bs": { "bs_year": "integer", "bs_month": "integer", "month_name": "string", "day": "integer" },
        "rent_in_force": "number",
        "paid_amount": "number",
        "status": "'paid' | 'partial' | 'unpaid'",
        "payments": [{ "payment_id": "uuid", "payment_reference": "string", "amount": "number", "paid_on": "YYYY-MM-DD" }]
      }
    ],
    "arrears": "number"
  }
}
```

> Unlike every other Payment endpoint, every numeric field inside `data` here — `agreement.rent_amount`, `rent_in_force`, `paid_amount`, `arrears`, the `payments[].amount` — is a real JSON **number**, already parsed server-side. Don't re-`parseFloat` them; do for everything else in this API.

`periods` contains **one row per rent period that has come due** (`period_start <= today`), oldest first, within the requested Fiscal Year. Periods not yet due are omitted entirely, even if already paid ahead — see the note above. A row's `payments` array can hold more than one entry when a period was settled by multiple partial Payments. `arrears` is the sum, across every row shown, of `max(0, rent_in_force - paid_amount)` — it only ever reflects periods that have already come due, never scheduled future rent.

---

### GET /property-owner/payments
The Ledger — every Payment across every Agreement the authenticated owner has, filtered and sorted on `paid_on` (not `covers_period_start` — see the note above). Paginated, unlike the rest of this API.

**Query:**
```
property_id   uuid, optional
tenant_id     uuid, optional
from          date (YYYY-MM-DD), optional — paid_on >= from
to            date (YYYY-MM-DD), optional — paid_on <= to
limit         integer, optional, default 25, max 100 — ignored if all=true
offset        integer, optional, default 0 — ignored if all=true
all           "true", optional — return every matching row (hard-capped at 5000), no pagination envelope
```

**Response (paginated, default):** `{ status: "AK", data: [payment...], total, limit, offset }` — `total` is the full matching count, not just this page's length.

**Response (`all=true`):** `{ status: "AK", data: [payment...] }` — no `total`/`limit`/`offset`. Meant for building a CSV client-side; there is no server-side file export endpoint.

**Response data fields (per row):** everything listed under [GET .../payments](#get-property-ownertenanttenantidagreementagreementidpayments) above, plus `property_id, tenant_id, property_name, tenant_first_name, tenant_last_name` (the last two `null` if the tenant has no `user_details` row yet).

**Fails if:** `from`/`to` isn't `YYYY-MM-DD` (`400`).

---

### GET /property-owner/payments/summary
Total rent collected + a monthly breakdown, scoped by the **same filters** as the Ledger above (`property_id`, `tenant_id`, `from`, `to`) — pass the same query params the Ledger table is currently filtered by so the two stay in sync on screen. Rent-purpose Payments only; deposits/advances/utilities/maintenance are excluded from the total.

**Query:** same `property_id` / `tenant_id` / `from` / `to` as the Ledger. If **both** `from` and `to` are omitted, defaults to the current Fiscal Year (not all-time) — pass explicit dates for an all-time total.

**Response:**
```json
{
  "status": "AK",
  "data": {
    "total_rent_collected": "number",
    "from": "YYYY-MM-DD",
    "to": "YYYY-MM-DD",
    "monthly": [{ "month": "YYYY-MM (Gregorian)", "total": "number" }]
  }
}
```

> `from`/`to` in the response are always the *effective* window actually used (including the FY default), so the frontend can label the card correctly without recomputing the fiscal year itself. `monthly` is grouped by Gregorian month (this is the Ledger's `paid_on`-based side, not BS) and only includes months with at least one rent Payment — pad gaps client-side if the chart needs continuous months.

---

## Admin — Property Owners (`/admin/property-owners`)

**Auth:** `admin` only

All endpoints in this section return `404` (not an empty array) when there's nothing to return.

### GET /admin/property-owners
List all property owners. Supports `?mobile_number=` and `?property_owner_id=` query filters.

### GET /admin/property-owners/documents
List all property owner documents.

---

## Admin — Properties (`/admin/properties`)

**Auth:** `admin` only

All endpoints in this section return `404` (not an empty array) when there's nothing to return.

### GET /admin/properties
List all properties across all users. Supports `?mobile_number=`, `?property_type_id=`, `?district_id=`, `?is_vacant=`, and `?property_owner_id=` query filters (all optional, combinable).

### GET /admin/properties/documents
List all property documents.

---

## Lookup Tables

All lookup tables follow the same pattern. GET endpoints are readable by `admin`, `property_owner`, and `tenant`. Write endpoints (POST/PUT/DELETE) are `admin` only.

### Countries (`/country`)

| Method | Path | Description |
|--------|------|-------------|
| GET | /country | Get all countries |
| GET | /country/:id | Get country by ID |
| POST | /country | Create country |
| PUT | /country/:id | Update country |
| DELETE | /country/:id | Delete country |

**Body (POST/PUT):** `{ iso, name, nicename, iso3, numcode, phonecode }`

---

### Provinces (`/province`)

| Method | Path | Description |
|--------|------|-------------|
| GET | /province | Get all provinces |
| GET | /province/by-country?country_id= | Get provinces by country |
| GET | /province/:id | Get province by ID |
| POST | /province | Create province |
| PUT | /province/:id | Update province |
| DELETE | /province/:id | Delete province |

**Body:** `{ name }`

---

### Districts (`/district`)

| Method | Path | Description |
|--------|------|-------------|
| GET | /district | Get all districts |
| GET | /district/by-province?province_id= | Get districts by province |
| GET | /district/:id | Get district by ID |
| POST | /district | Create district |
| PUT | /district/:id | Update district |
| DELETE | /district/:id | Delete district |

**Body:** `{ name }`

---

### Municipalities (`/municipality`)

| Method | Path | Description |
|--------|------|-------------|
| GET | /municipality | Get all municipalities |
| GET | /municipality/by-district?district_id= | Get by district |
| GET | /municipality/:id | Get by ID |
| POST | /municipality | Create |
| PUT | /municipality/:id | Update |
| DELETE | /municipality/:id | Delete |

**Body:** `{ name }`

---

### Genders (`/gender`)

**Auth for GET:** `admin`, `property_owner`, `tenant`

| Method | Path | Description |
|--------|------|-------------|
| GET | /gender | Get all genders |
| GET | /gender/:id | Get by ID |
| POST | /gender | Create |
| PUT | /gender | Update (no ID in path) |
| DELETE | /gender/:id | Delete |

**Body:** `{ name }`

---

### User Types (`/user-type`)

**Auth for GET:** `admin`, `property_owner`, `tenant`

| Method | Path | Description |
|--------|------|-------------|
| GET | /user-type | Get all |
| GET | /user-type/:id | Get by ID |
| GET | /user-type/:name | Get by name |
| POST | /user-type | Create |
| PUT | /user-type/:id | Update |
| DELETE | /user-type/:id | Delete |

**Body:** `{ name }`

Seeded values: `1 = admin`, `2 = property_owner`, `3 = tenant` — these IDs are what `POST /auth/register` and tenant-creation endpoints expect as `user_type_id`.

---

### File Categories (`/file-category`)

Used for user identity documents (e.g. passport, citizenship).

**Auth for GET:** `admin`, `property_owner`, `tenant`

| Method | Path | Description |
|--------|------|-------------|
| GET | /file-category | Get all |
| GET | /file-category/:id | Get by ID |
| POST | /file-category | Create |
| PUT | /file-category | Update (no ID in path) |
| DELETE | /file-category/:id | Delete |

**Body:** `{ name (max 50) }`

---

### Property File Categories (`/property-file-category`)

Used for property documents (e.g. land deed, blueprint).

**Auth for GET:** `admin`, `property_owner`, `tenant`

| Method | Path | Description |
|--------|------|-------------|
| GET | /property-file-category | Get all |
| GET | /property-file-category/:id | Get by ID |
| POST | /property-file-category | Create |
| PUT | /property-file-category/:id | Update |
| DELETE | /property-file-category/:id | Delete |

**Body:** `{ name (max 50) }`

---

### Property Types (`/property-type`)

**Auth for GET:** `admin`, `property_owner`, `tenant`

| Method | Path | Description |
|--------|------|-------------|
| GET | /property-type | Get all |
| GET | /property-type/:id | Get by ID |
| POST | /property-type | Create |
| PUT | /property-type | Update (no ID in path) |
| DELETE | /property-type/:id | Delete |

**Body:** `{ name (max 50, letters/spaces/hyphens) }`

---

### Agreement Durations (`/agreement-duration`)

Fixed-term lease lengths offered when creating an [Agreement](#agreements-property-owner).

**Auth for GET:** `admin`, `property_owner`, `tenant`

| Method | Path | Description |
|--------|------|-------------|
| GET | /agreement-duration | Get all |
| GET | /agreement-duration/:id | Get by ID |
| POST | /agreement-duration | Create |
| PUT | /agreement-duration | Update (no ID in path) |
| DELETE | /agreement-duration/:id | Delete |

**Body:** `{ duration_in_years (number, > 0) }`

Seeded values: `1, 2, 3, 5`

---

### Increment Durations (`/increment-duration`)

How often (in years) an Agreement's rent increment clause recurs. Recorded on the Agreement only — not automatically applied.

**Auth for GET:** `admin`, `property_owner`, `tenant`

| Method | Path | Description |
|--------|------|-------------|
| GET | /increment-duration | Get all |
| GET | /increment-duration/:id | Get by ID |
| POST | /increment-duration | Create |
| PUT | /increment-duration | Update (no ID in path) |
| DELETE | /increment-duration/:id | Delete |

**Body:** `{ increment_duration_in_years (number, > 0) }`

Seeded values: `1, 2, 3`

---

### Increment Percentages (`/increment-percentage`)

By how much (%) an Agreement's rent increment clause raises rent. Recorded on the Agreement only — not automatically applied.

**Auth for GET:** `admin`, `property_owner`, `tenant`

| Method | Path | Description |
|--------|------|-------------|
| GET | /increment-percentage | Get all |
| GET | /increment-percentage/:id | Get by ID |
| POST | /increment-percentage | Create |
| PUT | /increment-percentage | Update (no ID in path) |
| DELETE | /increment-percentage/:id | Delete |

**Body:** `{ increment_percentage (number, 0–100) }`

Seeded values: `5, 10, 15, 20`

---

### Payment Periods (`/payment-period`)

How often rent is due under an [Agreement](#agreements-property-owner).

**Auth for GET:** `admin`, `property_owner`, `tenant`

| Method | Path | Description |
|--------|------|-------------|
| GET | /payment-period | Get all |
| GET | /payment-period/:id | Get by ID |
| POST | /payment-period | Create |
| PUT | /payment-period | Update (no ID in path) |
| DELETE | /payment-period/:id | Delete |

**Body:** `{ payment_period (max 20, letters/spaces/hyphens) }`

Seeded values: `Monthly, Quarterly, Half-yearly, Yearly`

---

### Payment Purposes (`/payment-purpose`)

What a [Payment](#payments-property-owner) was for. `id: 1` (Rent) is the one purpose that requires `covers_period_start` on the Payment — the frontend needs this ID to decide whether to show that field on the payment form. Don't hardcode `1` without also handling the (unlikely but possible) case of a re-seed changing it — fetch this list and match on the `payment_purpose` label if you want that to be robust.

**Auth for GET:** `admin`, `property_owner`, `tenant`

| Method | Path | Description |
|--------|------|-------------|
| GET | /payment-purpose | Get all |
| GET | /payment-purpose/:id | Get by ID |
| POST | /payment-purpose | Create |
| PUT | /payment-purpose | Update (no ID in path) |
| DELETE | /payment-purpose/:id | Delete |

**Body:** `{ payment_purpose (max 30, letters/spaces/hyphens) }`

Seeded values (in id order): `Rent, Advance, Security Deposit, Utilities, Maintenance, Other`

---

### Payment Methods (`/payment-method`)

How the tenant says they paid a [Payment](#payments-property-owner) — a descriptive label only. There is no payment gateway behind this; recording `eSewa` or `Khalti` here does not integrate with either service.

**Auth for GET:** `admin`, `property_owner`, `tenant`

| Method | Path | Description |
|--------|------|-------------|
| GET | /payment-method | Get all |
| GET | /payment-method/:id | Get by ID |
| POST | /payment-method | Create |
| PUT | /payment-method | Update (no ID in path) |
| DELETE | /payment-method/:id | Delete |

**Body:** `{ payment_method (max 30, letters/spaces/hyphens) }`

Seeded values (in id order): `Cash, Bank Transfer, eSewa, Khalti, Cheque, Other`

---

## Common Error Responses

| Status | Meaning |
|--------|---------|
| 400 | Validation error or duplicate data |
| 401 | Missing or invalid JWT |
| 403 | User not verified / inactive / wrong user type |
| 404 | Resource not found |
| 500 | Server error |

Validation errors return:
```json
{
  "errors": [{ "field": "fieldName", "message": "error message" }]
}
```
