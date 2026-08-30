# Architecture Implementation Guide

Decision rationale: see [docs/adr/0001-mvc-layered-architecture.md](adr/0001-mvc-layered-architecture.md)

---

## Target file tree

```
models/
  userModel.js
  userDetailsModel.js
  addressModel.js
  propertyModel.js
  fileModel.js
  propertyFileModel.js
  ownerTenantModel.js

services/
  passwordService.js        ← pure functions, no DB
  authService.js
  userService.js
  tenantService.js
  fileService.js
  propertyFileService.js
  propertyService.js
  # linkTenantToOwner.js absorbed into tenantService

controllers/                ← keep existing files, thin them out
  authController.js
  userController.js
  tenantController.js
  fileController.js
  propertyController.js
  propertyFileController.js
  adminController/
```

---

## Model interfaces

### `models/userModel.js`
```js
findById(id)                          // SELECT * FROM users WHERE user_id=$1
findByEmail(email)                    // SELECT * FROM users WHERE email=$1
create({ email, password, userTypeId })
setVerified(id)
setPassword(id, hashedPassword)       // also sets password_last_changed=NOW()
delete(id)
```

### `models/userDetailsModel.js`
```js
findByUserId(userId)
findWithProfile(userId)               // LEFT JOINs gender, country, province, district
upsert(userId, fields)                // INSERT or UPDATE depending on existence
```

### `models/addressModel.js`
```js
findByUserId(userId)
findByUserIdWithNames(userId)         // LEFT JOINs country, province, district, municipality
upsert(userId, fields)
```

### `models/propertyModel.js`
```js
findById(propertyId)                  // with JOINs for type/geo names
findAllByUser(userId)
create(userId, fields)
update(propertyId, fields)
delete(propertyId)
existsWithName(userId, name)          // for duplicate name validation
```

### `models/fileModel.js`
```js
findById(fileId)
findAllByUser(userId)
create({ userId, filename, categoryId, filePath })
update(fileId, fields)
delete(fileId)
```

### `models/propertyFileModel.js`
```js
findById(fileId)
findAllByProperty(propertyId)
findAllByUser(userId)
create({ propertyId, filename, categoryId, filePath })
update(fileId, fields)
delete(fileId)
```

### `models/ownerTenantModel.js`
```js
link(ownerId, tenantId)               // INSERT ... ON CONFLICT DO NOTHING
assertLinked(ownerId, tenantId)       // throws { message, status: 403 } if not linked
findTenantsByOwner(ownerId)           // full JOIN query returning tenant rows
```

---

## Service interfaces

### `services/passwordService.js`  *(pure — no DB)*
```js
hash(plain)                           // bcrypt.hash, ROUNDS=10
verify(plain, hashed)                 // bcrypt.compare
isExpired(lastChanged)                // checks 1-year policy
generateResetToken()                  // crypto.randomBytes(32).toString('hex')
```

### `services/authService.js`
```js
register({ email, password, userTypeId })       // hash → insert user → send verify email
verifyEmail(token)                              // validate token → set is_verified=TRUE
login({ email, password })                      // verify + expiry + active checks → JWT
forgotPassword(email)                           // generate reset token → send email
resetPassword(token, newPassword)               // validate token → update password
changePassword(userId, oldPassword, newPassword)
```

### `services/userService.js`
```js
upsertProfile(pool, userId, details, address)   // transaction: upserts both tables
getProfile(userId)                              // delegates to userDetailsModel.findWithProfile
getAddress(userId)                              // delegates to addressModel.findByUserIdWithNames
deleteWithCleanup(userId)                       // delete DB row (CASCADE) + rm uploads dir
```

### `services/tenantService.js`
```js
create(pool, ownerId, data)                     // transaction: user + details + address + link
assertOwnership(ownerId, tenantId)              // delegates to ownerTenantModel.assertLinked
getAll(ownerId)
getOne(ownerId, tenantId)                       // asserts ownership first
updateDetails(pool, ownerId, tenantId, fields)  // asserts ownership + updates user_details
updateAddress(pool, ownerId, tenantId, fields)  // asserts ownership + updates address
delete(pool, ownerId, tenantId)                 // asserts + deletes + cleans uploads dir
```

### `services/fileService.js`  *(absorbs the 9× repeated DB+FS transaction)*
```js
save(pool, { userId, mobile, filename, buffer, categoryId })
update(pool, fileId, { buffer, filename })
delete(pool, fileId)
getAllByUser(userId)
getOne(fileId)
```

### `services/propertyFileService.js`
```js
// same shape as fileService but scoped to properties
save(pool, { propertyId, mobile, filename, buffer, categoryId })
update(pool, fileId, { buffer, filename })
delete(pool, fileId)
getAllByProperty(propertyId)
getAllByUser(userId)
```

### `services/propertyService.js`
```js
create(userId, fields)
getAll(userId)
getOne(propertyId)
update(propertyId, fields)
delete(pool, propertyId)                        // vacancy check + delete + rm uploads dir
```

---

## Migration order

Implement bottom-up. The app keeps working at every step.

### Step 1 — Models (extract SQL, no logic changes)
1. `models/ownerTenantModel.js` — highest impact first (replaces 8× repeated check + `linkTenantToOwner.js`)
2. `models/userModel.js` + `models/userDetailsModel.js` + `models/addressModel.js`
3. `models/fileModel.js` + `models/propertyFileModel.js`
4. `models/propertyModel.js`

### Step 2 — Services (add business logic on top of models)
1. `services/passwordService.js` — pure functions, zero risk, start here
2. `services/fileService.js` — consolidates the 9× repeated transaction
3. `services/tenantService.js` — largest win (907-line controller)
4. `services/userService.js`
5. `services/authService.js`
6. `services/propertyService.js` + `services/propertyFileService.js`

### Step 3 — Thin controllers
For each controller, replace inline SQL + logic with a single service call. The route, middleware, and response envelope stay identical — the API surface is unchanged.

---

## Error handling convention

Services throw plain errors for known business-rule failures:
```js
const err = new Error('Not your tenant');
err.status = 403;
throw err;
```

Controllers catch and forward:
```js
} catch (err) {
  if (err.status)
    return res.status(err.status).json({ status: 'NAK', message: err.message });
  console.error(err.message);
  res.json({ status: 'NAK', message: 'Internal error' });
}
```
