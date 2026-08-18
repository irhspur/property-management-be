const { body } = require("express-validator");
const pool = require("../config/database");
const { UserDetailsSchema, AddressSchema, PropertySchema, AgreementSchema } = require("../schemas");
const { buildValidationRules } = require("../schemas/buildValidation");

exports.genderValidationRules = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Gender name must not be empty")
    .isLength({ max: 20 })
    .withMessage("Gender name must be at most 20 characters")
    .matches(/^[A-Za-z\s\-]+$/)
    .withMessage("Gender name must contain only letters, spaces, or hyphens"),
];

exports.validateGender = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ status: "NAK", errors: errors.array() });
  }
  next();
};

exports.countryValidationRules = [
  /*body("code")
    .trim()
    .notEmpty()
    .withMessage("Country code must not be empty")
    .isLength({ max: 3 })
    .withMessage("Country code must be at most 3 characters")
    .matches(/^[A-Z]+$/)
    .withMessage("Country code must contain only uppercase letters"),*/
  body("iso")
    .trim()
    .notEmpty()
    .withMessage("Country ISO must not be empty")
    .isLength({ max: 2 })
    .withMessage("Country ISO must be at most 2 characters")
    .matches(/^[A-Za-z]+$/)
    .withMessage("Country ISO must contain only letters"),
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Country name must not be empty")
    .isLength({ max: 100 })
    .withMessage("Country name must be at most 100 characters")
    .matches(/^[A-Za-z\s\-]+$/)
    .withMessage("Country name must contain only letters, spaces, or hyphens"),
  body("nicename")
    .trim()
    .notEmpty()
    .withMessage("Country nicename must not be empty")
    .isLength({ max: 100 })
    .withMessage("Country nicename must be at most 100 characters")
    .matches(/^[A-Za-z\s\-]+$/)
    .withMessage(
      "Country nicename must contain only letters, spaces, or hyphens"
    ),
  body("iso3")
    .trim()
    .notEmpty()
    .withMessage("Country ISO3 must not be empty")
    .isLength({ max: 3 })
    .withMessage("Country ISO3 must be at most 3 characters")
    .matches(/^[A-Za-z]+$/)
    .withMessage("Country ISO3 must contain only letters"),
  body("numcode")
    .trim()
    .notEmpty()
    .withMessage("Country numcode must not be empty")
    .isNumeric()
    .withMessage("Country numcode must be a number")
    .isLength({ max: 3 })
    .withMessage("Country numcode must be at most 3 digits"),
  body("phonecode")
    .trim()
    .notEmpty()
    .withMessage("Country phonecode must not be empty")
    .isNumeric()
    .withMessage("Country phonecode must be a number")
    .isLength({ max: 5 })
    .withMessage("Country phonecode must be at most 5 digits"),
];

exports.provinceValidationRules = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Province name must not be empty")
    .isLength({ max: 100 })
    .withMessage("Province name must be at most 100 characters")
    .matches(/^[A-Za-z0-9\s\-\[\]]+$/)
    .withMessage(
      "Province name must contain only letters, numbers, spaces, hyphens or brackets"
    ),
];

exports.districtValidationRules = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("District name must not be empty")
    .isLength({ max: 100 })
    .withMessage("District name must be at most 100 characters")
    .matches(/^[A-Za-z\s\-]+$/)
    .withMessage("District name must contain only letters, spaces, or hyphens"),
];

exports.municipalityValidationRules = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Municipality name must not be empty")
    .isLength({ max: 100 })
    .withMessage("Municipality name must be at most 100 characters")
    .matches(/^[A-Za-z\s\-]+$/)
    .withMessage(
      "Municipality name must contain only letters, spaces, or hyphens"
    ),
];

exports.userTypeValidationRules = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("User type name must not be empty")
    .isLength({ max: 50 })
    .withMessage("User type name must be at most 50 characters")
    .matches(/^[A-Za-z\s\-]+$/)
    .withMessage(
      "User type name must contain only letters, spaces, or hyphens"
    ),
];

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

exports.fileCategoriesValidationRules = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("File category name must not be empty")
    .isLength({ max: 50 })
    .withMessage("File category name must be at most 50 characters"),
];
exports.propertyFileCategoriesValidationRules = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Property file category name must not be empty")
    .isLength({ max: 50 })
    .withMessage("Property file category name must be at most 50 characters"),
];
exports.propertyTypesValidationRules = [
  body("name")
    .trim()
    .notEmpty()
    .withMessage("Property type name must not be empty")
    .isLength({ max: 50 })
    .withMessage("Property type name must be at most 50 characters")
    .matches(/^[A-Za-z\s\-]+$/)
    .withMessage(
      "Property type name must contain only letters, spaces, or hyphens"
    ),
];
exports.propertyValidationRules = buildValidationRules(PropertySchema);
exports.agreementValidationRules = buildValidationRules(AgreementSchema);

exports.agreementDurationValidationRules = [
  body("duration_in_years")
    .notEmpty()
    .withMessage("Duration in years must not be empty")
    .isFloat({ min: 0.1, max: 999.99 })
    .withMessage("Duration in years must be a positive number"),
];

exports.incrementDurationValidationRules = [
  body("increment_duration_in_years")
    .notEmpty()
    .withMessage("Increment duration in years must not be empty")
    .isFloat({ min: 0.1, max: 999.99 })
    .withMessage("Increment duration in years must be a positive number"),
];

exports.incrementPercentageValidationRules = [
  body("increment_percentage")
    .notEmpty()
    .withMessage("Increment percentage must not be empty")
    .isFloat({ min: 0.01, max: 100 })
    .withMessage("Increment percentage must be between 0 and 100"),
];

exports.paymentPeriodValidationRules = [
  body("payment_period")
    .trim()
    .notEmpty()
    .withMessage("Payment period must not be empty")
    .isLength({ max: 20 })
    .withMessage("Payment period must be at most 20 characters")
    .matches(/^[A-Za-z\s\-]+$/)
    .withMessage("Payment period must contain only letters, spaces, or hyphens"),
];
