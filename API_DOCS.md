# PropTrove API Documentation

Base URL: `http://localhost:<PORT>`

## Conventions

- All responses: `{ "status": "AK", "data": ... }` (success) or `{ "status": "NAK", "message": "..." }` (failure)
- Auth: `Authorization: Bearer <token>` header on all protected routes
- Token lifetime: 1 hour (session JWT)
- User types: `admin`, `property_owner`, `tenant`

---

## Auth (`/auth`)

### POST /auth/register
Create a new user account. Sends a verification email before the account is usable.

**Body:**
```json
{
  "email": "string (max 100)",
  "password": "string (7–14 chars, 1 uppercase, 1 digit, 1 special char)",
  "user_type_id": "integer"
}
```
**Response:** `{ status, message, data: user, token: verificationToken }`

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
**Response:** `{ status, data: user, token: jwtToken }`

> Fails if: email not found, wrong password, password expired (>1 year old), not verified, not active.

---

### POST /auth/forgot-password
Send a password reset link to email. Reset token valid 15 minutes.

**Body:** `{ "email": "string" }`

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
Get all files belonging to the authenticated user.

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
  "property_value": "number (optional, max 15 digits)",
  "is_vacant": "boolean (optional)"
}
```

---

### GET /user/properties
Get all properties of the authenticated user.

**Response data fields (per property):** `property_id, user_id, property_type_id, property_type, country_id, country, province_id, province, district_id, district, municipality_id, municipality, ward_number, street_name, house_number, property_name, property_description, property_value, is_vacant, created_at, updated_at`

> FK IDs and their resolved names are both returned so the frontend can display names and pre-populate edit form dropdowns without extra requests.

---

### GET /user/property/:id
Get a property by ID.

**Response data fields:** Same as GET /user/properties (single object).

---

### GET /user/property
**Query:** `?mobile_number=<string>`

Get properties by mobile number.

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
Get all property files for the authenticated user.

---

### GET /user/property-file/:fileId
Get a single property file record.

---

### PUT /user/property-file/:fileId
Replace a property file.

---

### DELETE /user/property-file/:fileId

---

## Tenants (`/property-owner`)

**Auth:** `admin`, `property_owner`

Property owners manage their tenants here. Creating a tenant also links them via `owner_tenant`.

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

---

### GET /property-owner/tenants
Get all tenants linked to the authenticated property owner. Returns full joined data (user, details, address, names resolved).

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
List all files for a tenant.

---

### GET /property-owner/tenant/:tenantId/file/:fileId
Get a specific file for a tenant.

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

## Admin — Property Owners (`/admin/property-owners`)

**Auth:** `admin` only

### GET /admin/property-owners
List all property owners.

### GET /admin/property-owners/documents
List all property owner documents.

---

## Admin — Properties (`/admin/properties`)

**Auth:** `admin` only

### GET /admin/properties
List all properties across all users.

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

Seeded values: `admin`, `property_owner`, `tenant`

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
