// Stable, machine-readable codes on file categories. `name` is the label
// admins may edit; `code` is set once at creation and never changes, because
// deployed frontend builds upload into categories by code. Which codes are
// reserved (undeletable) lives with each category table's description in
// services/lookupTables.ts.
const CATEGORY_CODE_PATTERN = /^[a-z][a-z0-9_]{1,39}$/;
const CATEGORY_CODE_FORMAT_MESSAGE =
  "code must be lowercase letters, digits or underscores, starting with a letter (2–40 chars)";

module.exports = { CATEGORY_CODE_PATTERN, CATEGORY_CODE_FORMAT_MESSAGE };
