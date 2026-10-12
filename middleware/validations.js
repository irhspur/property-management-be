const { body, query } = require("express-validator");
const pool = require("../config/database");
const { UserDetailsSchema, AddressSchema, PropertySchema, AgreementSchema, PaymentSchema } = require("../schemas");
const { buildValidationRules } = require("../schemas/buildValidation");

// createUser uses birth_country_id in the request body; the DB column is country_id
exports.userValidationRules = buildValidationRules(
  UserDetailsSchema,
  { birth_country_id: 'country_id' }
);

// updateAddress uses country_id directly; createUser uses address_country_id (alias passed there)
exports.addressValidationRules = buildValidationRules(AddressSchema);

const passwordPolicy = (fieldName = "password") =>
  body(fieldName)
    .trim()
    .notEmpty()
    .withMessage("Password must not be empty")
    .isLength({ min: 7, max: 14 })
    .withMessage("Password must be 7 - 14 characters")
    .custom((value) => {
      if (!/[A-Z]/.test(value))
        throw new Error("Must include at least one uppercase letter");
      if (!/[0-9]/.test(value))
        throw new Error("Must include at least one digit");
      if (!/[!@#$%^&*(),.?":{}|<>]/.test(value))
        throw new Error("Must include at least one special character");
      return true;
    });
const emailPolicy = (fieldName = "email") =>
  body(fieldName)
    .trim()
    .notEmpty()
    .withMessage("Email must not be empty")
    .isEmail()
    .withMessage("Invalid email format")
    .isLength({ max: 100 })
    .withMessage("Email must be at most 100 characters");

const confirmPasswordRule = (originalField, confirmField) =>
  body(confirmField)
    .notEmpty()
    .withMessage("Confirm password must not be empty")
    .custom((value, { req }) => {
      if (value !== req.body[originalField]) {
        throw new Error("Passwords do not match");
      }
      return true;
    });
exports.registerValidationRules = [emailPolicy(), passwordPolicy()];
exports.loginValidationRules = [emailPolicy(), passwordPolicy()];
exports.forgotPasswordValidationRules = [emailPolicy()];
// An owner creating a Tenant: no password, the Tenant sets one from the Invite.
exports.tenantCreateValidationRules = [emailPolicy()];
exports.resetPasswordValidationRules = [
  passwordPolicy("newPassword"),
  confirmPasswordRule("newPassword", "confirmNewPassword"),
];
exports.changePasswordValidationRules = [
  body("oldPassword")
    .trim()
    .notEmpty()
    .withMessage("Old password must not be empty"),
  passwordPolicy("newPassword"),
  confirmPasswordRule("newPassword", "confirmNewPassword"),
];

// Present and non-blank. Runs after the schema chains, so blanks are already null.
const isSet = (v) => v !== undefined && v !== null && !(typeof v === "string" && v.trim() === "");

exports.propertyValidationRules = [
  ...buildValidationRules(PropertySchema),
  // The DB enforces both pairings too (properties_area_unit_pair,
  // properties_lat_lng_pair); these turn a would-be 500 into a field error.
  body("land_area_unit").custom((unit, { req }) => {
    if (isSet(req.body.land_area_sqft) && !isSet(unit))
      throw new Error("land_area_unit is required when land_area_sqft is provided");
    if (!isSet(req.body.land_area_sqft) && isSet(unit))
      throw new Error("land_area_unit must be empty when land_area_sqft is not provided");
    return true;
  }),
  body("latitude").custom((lat, { req }) => {
    const lng = req.body.longitude;
    if ((lat === undefined) !== (lng === undefined) || isSet(lat) !== isSet(lng))
      throw new Error("latitude and longitude must be provided together");
    return true;
  }),
];
exports.agreementValidationRules = buildValidationRules(AgreementSchema);
exports.paymentValidationRules = buildValidationRules(PaymentSchema);

// GET /property-owner/tenants (My Tenants spec). All optional; limit turns on paging.
exports.agreementListQueryRules = [
  query("q").optional().trim()
    .isLength({ max: 100 }).withMessage("q must be at most 100 characters"),
  query("status").optional()
    .isIn(["active", "expiring", "ended"])
    .withMessage("status must be one of: active, expiring, ended"),
  query("sort").optional()
    .isIn(["newest", "ending_soonest", "rent_desc"])
    .withMessage("sort must be one of: newest, ending_soonest, rent_desc"),
  query("limit").optional()
    .isInt({ min: 1, max: 100 }).withMessage("limit must be an integer between 1 and 100"),
  query("offset").optional()
    .isInt({ min: 0 }).withMessage("offset must be a non-negative integer"),
];

exports.tenantListQueryRules = [
  query("q").optional().trim()
    .isLength({ max: 100 }).withMessage("q must be at most 100 characters"),
  query("status").optional()
    .isIn(["active", "expiring", "ended", "none"])
    .withMessage("status must be one of: active, expiring, ended, none"),
  query("limit").optional()
    .isInt({ min: 1, max: 100 }).withMessage("limit must be an integer between 1 and 100"),
  query("offset").optional()
    .isInt({ min: 0 }).withMessage("offset must be a non-negative integer"),
];
