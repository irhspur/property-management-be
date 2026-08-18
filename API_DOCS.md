# PropTrove API Documentation

Base URL: `http://localhost:<PORT>`

## Conventions

- All responses: `{ "status": "AK", "data": ... }` (success) or `{ "status": "NAK", "message": "..." }` (failure) — except express-validator failures, which return `{ "errors": [...] }` with no `status` field (see [Common Error Responses](#common-error-responses)), and multer file-upload errors, which currently bypass the JSON envelope entirely (see [File Uploads](#file-uploads) below).
- Auth: `Authorization: Bearer <token>` header on all protected routes
- Token lifetime: 1 hour (session JWT)
- User types: `admin`, `property_owner`, `tenant` — numeric IDs `1`, `2`, `3` respectively (see [User Types](#user-types-user-type)). `user_type_id` is what `POST /auth/register` actually expects.
- **IDs:** UUID strings for user-created records (`user_id`, `property_id`, `file_id`, `agreement_id`, tenant IDs, etc.); small integers for lookup-table records (`gender_id`, `country_id`, `property_type_id`, `agreement_duration_id`, etc.).
- **Numeric fields are returned as strings**, not JSON numbers — `pg` serializes `DECIMAL`/`NUMERIC` columns as strings to avoid float rounding. This affects `rent_amount`, `security_deposit`, `advance_amount`, `property_value`, and all `*_in_years`/`*_percentage` lookup values (e.g. `"rent_amount": "25000.00"`). Parse before doing arithmetic.
- **Timestamps** (`created_at`, `updated_at`, `dob`, etc.) are ISO 8601 UTC strings, e.g. `"2026-08-16T11:25:58.461Z"`.
- **No pagination** on any endpoint — list endpoints return the full result set every time.
- **CORS** is open to all origins (`cors()` with no options) — no preflight/origin restrictions to work around.
- **No rate limiting** is currently enforced on any route.
- **Empty-list behavior is not uniform** — some list endpoints return `200` with `data: []`, others return `404`. See the table below; get this wrong and empty results will render as an error state instead of an empty state (or vice versa).

  | Returns `200` + `data: []` when empty | Returns `404` when empty |
  |---|---|
  | `GET /user/files`, `GET /user/property-files` | `GET /user/properties`, `GET /user/property?mobile_number=` |
  | `GET /property-owner/tenants`, `GET /property-owner/tenant/:id/files` | `GET /admin/property-owners`, `GET /admin/property-owners/documents` |
  | `GET /property-owner/agreements`, `GET /property-owner/tenant/:id/agreements` | `GET /admin/properties`, `GET /admin/properties/documents` |
  | All plain lookup-table `GET /<lookup>` (no filter) — country, province, district, municipality, gender, user-type, file-category, property-file-category, property-type, agreement-duration, increment-duration, increment-percentage, payment-period | Filtered lookup endpoints — `GET /province/by-country`, `GET /district/by-province`, `GET /municipality/by-district` |

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

`agreement_duration_id` and `payment_period_id` reference the [Agreement Durations](#agreement-durations-agreement-duration) and [Payment Periods](#payment-periods-payment-period) lookup tables. `advance_amount` (upfront rent, typically adjusted against future rent) is distinct from `security_deposit` (refundable, held against damage) and both may be set independently. `increment_duration_id` + `increment_percentage_id` (referencing [Increment Durations](#increment-durations-increment-duration) / [Increment Percentages](#increment-percentages-increment-percentage)) record an agreed rent-escalation clause — **the system does not automatically apply it to `rent_amount`**; they're stored as declared terms only. They must be provided together or not at all.

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
