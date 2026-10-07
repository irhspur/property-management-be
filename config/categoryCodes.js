// Stable, machine-readable codes on file categories. `name` is the label
// admins may edit; `code` is set once at creation and never changes, because
// deployed frontend builds upload into categories by code.
//
// Codes the app depends on and that therefore can't be deleted. Keep in step
// with the seed data in data/file_categories.csv,
// data/property_file_categories.csv and data/agreement_file_categories.csv.
const RESERVED_CATEGORY_CODES = {
  file_categories: ["citizenship_front", "citizenship_back"],
  property_file_categories: ["lalpurja", "property_photo"],
  agreement_file_categories: ["signed_contract"],
};

const CATEGORY_CODE_PATTERN = /^[a-z][a-z0-9_]{1,39}$/;
const CATEGORY_CODE_FORMAT_MESSAGE =
  "code must be lowercase letters, digits or underscores, starting with a letter (2–40 chars)";

// The 400 validation envelope, for code checks that need the database.
const codeError = (res, message) =>
  res.status(400).json({ errors: [{ field: "code", message }] });

// 409 when deleting a category the app uploads into; null if it's deletable.
const reservedCodeConflict = (table, code) =>
  RESERVED_CATEGORY_CODES[table].includes(code)
    ? `${code} is used by the app and cannot be deleted`
    : null;

module.exports = {
  RESERVED_CATEGORY_CODES,
  CATEGORY_CODE_PATTERN,
  CATEGORY_CODE_FORMAT_MESSAGE,
  codeError,
  reservedCodeConflict,
};
