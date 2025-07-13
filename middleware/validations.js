const { body } = require("express-validator");

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

exports.userValidationRules = [
  body("firstname")
    .trim()
    .notEmpty()
    .withMessage("First name must not be empty")
    .isLength({ max: 50 })
    .withMessage("First name must be at most 50 characters")
    .matches(/^[A-Za-z\s\-]+$/)
    .withMessage("First name must contain only letters, spaces, or hyphens"),
  body("middlename")
    .trim()
    .isLength({ max: 50 })
    .withMessage("Middle name must be at most 50 characters")
    .matches(/^[A-Za-z\s\-]+$/)
    .withMessage("Middle name must contain only letters, spaces, or hyphens"),
  body("lastname")
    .trim()
    .notEmpty()
    .withMessage("Last name must not be empty")
    .isLength({ max: 50 })
    .withMessage("Last name must be at most 50 characters"),
  body("dob")
    .trim()
    .notEmpty()
    .withMessage("Date of birth must not be empty")
    .isDate()
    .withMessage("Date of birth must be a valid date")
    .isBefore()
    .withMessage("Date of birth must be before today"),
  body("father_full_name")
    .trim()
    .notEmpty()
    .withMessage("Father full name must not be empty")
    .isLength({ max: 100 })
    .withMessage("Father full name must be at most 100 characters")
    .matches(/^[A-Za-z\s\-]+$/)
    .withMessage(
      "Father full name must contain only letters, spaces, or hyphens"
    ),
  body("nin_number")
    .trim()
    .notEmpty()
    .withMessage("NIN number must not be empty")
    .isLength({ max: 10 })
    .withMessage("NIN number must be at most 20 characters")
    .matches(/^[0-9A-Za-z]+$/)
    .withMessage("NIN number must contain only alphanumeric characters"),
  body("mobile_number")
    .trim()
    .notEmpty()
    .withMessage("Mobile number must not be empty")
    .isNumeric()
    .withMessage("Mobile number must be numeric")
    .isLength({ min: 10, max: 15 })
    .withMessage("Mobile number must be between 10 and 15 digits")
    .matches(/^[0-9]+$/)
    .withMessage("Mobile number must contain only digits")
    .custom(async (value, { req }) => {
      const existingUser = await pool.query(
        `SELECT * FROM user_details WHERE mobile_number = $1`,
        [value]
      );
      if (existingUser.rows.length > 0) {
        throw new Error("Mobile number already exists");
      }
      return true;
    }),
  body("citizenship_number")
    .trim()
    .notEmpty()
    .withMessage("Citizenship number must not be empty")
    .isLength({ max: 20 })
    .withMessage("Citizenship number must be at most 20 characters")
    .matches(/^[a-zA-Z0-9\s\-\/]+$/)
    .withMessage(
      "Citizenship number must contain only alphanumeric characters, spaces, hyphens, or slashes"
    ),
  body("citizenship_issue_date")
    .trim()
    .notEmpty()
    .withMessage("Citizenship issue date must not be empty")
    .isDate()
    .withMessage("Citizenship issue date must be a valid date")
    .isBefore()
    .withMessage("Citizenship issue date must be before today"),
  body("bank_account_number")
    .trim()
    .notEmpty()
    .withMessage("Bank account number must not be empty")
    .isLength({ max: 20 })
    .withMessage("Bank account number must be at most 20 digits")
    .matches(/^[a-zA-Z0-9\s\-\/]+$/)
    .withMessage(
      "Bank account number must contain only alphanumeric characters, spaces, hyphens, or slashes"
    ),
  body("bank_name")
    .trim()
    .notEmpty()
    .withMessage("Bank name must not be empty")
    .isLength({ max: 100 })
    .withMessage("Bank name must be at most 100 characters")
    .matches(/^[A-Za-z\s\-]+$/)
    .withMessage("Bank name must contain only letters, spaces, or hyphens"),
];

exports.addressValidationRules = [
  body("ward_number")
    .trim()
    .notEmpty()
    .withMessage("Ward number must not be empty")
    .isNumeric()
    .withMessage("Ward number must be numeric")
    .isLength({ max: 3 })
    .withMessage("Ward number must be at most 3 digits"),
  body("street_name")
    .trim()
    .notEmpty()
    .withMessage("Street name must not be empty")
    .isLength({ min: 3, max: 100 })
    .withMessage("Street name must be between 3 and 100 characters long."),
  body("house_number")
    .trim()
    .notEmpty()
    .withMessage("House number must not be empty")
    .isLength({ max: 10 })
    .withMessage("House number must be at most 10 characters long.")
    .matches(/^[A-Za-z0-9\s\-]+$/)
    .withMessage(
      "House number must contain only letters, numbers, spaces, or hyphens"
    ),
  body("contact_number1")
    .trim()
    .notEmpty()
    .withMessage("Contact number 1 must not be empty")
    .isNumeric()
    .withMessage("Contact number 1 must be numeric")
    .isLength({ min: 5, max: 15 })
    .withMessage("Contact number 1 must be between 5 and 15 digits")
    .matches(/^[0-9]+$/)
    .withMessage("Contact number 1 must contain only digits"),
  body("contact_number2")
    .optional()
    .trim()
    .isNumeric()
    .withMessage("Contact number 2 must be numeric")
    .isLength({ min: 5, max: 15 })
    .withMessage("Contact number 2 must be between 5 and 15 digits")
    .matches(/^[0-9]+$/)
    .withMessage("Contact number 2 must contain only digits"),
  body("contact_address")
    .trim()
    .notEmpty()
    .withMessage("Contact address must not be empty")
    .isLength({ min: 5, max: 200 })
    .withMessage("Contact address must be between 5 and 200 characters long."),
];

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
exports.propertyValidationRules = [
  body("ward_number")
    .trim()
    .notEmpty()
    .withMessage("Ward number must not be empty")
    .isNumeric()
    .withMessage("Ward number must be numeric"),
  body("street_name")
    .trim()
    .notEmpty()
    .withMessage("Street name must not be empty")
    .isLength({ min: 3, max: 100 })
    .withMessage("Street name must be between 3 and 100 characters long."),
  body("house_number")
    .trim()
    .notEmpty()
    .withMessage("House number must not be empty")
    .isLength({ max: 10 })
    .withMessage("House number must be at most 10 characters long.")
    .matches(/^[A-Za-z0-9\s\-]+$/)
    .withMessage(
      "House number must contain only letters, numbers, spaces, or hyphens"
    ),
  body("property_name")
    .trim()
    .notEmpty()
    .withMessage("Property name must not be empty")
    .isLength({ min: 3, max: 100 })
    .withMessage("Property name must be between 3 and 100 characters long."),
  body("property_description")
    .optional()
    .trim()
    .isLength({ max: 500 })
    .withMessage("Property description must be at most 500 characters long."),
  body("property_value")
    .optional()
    .isNumeric()
    .withMessage("Property value must be a number")
    .isLength({ max: 15 })
    .withMessage("Property value must be at most 15 digits"),
  body("is_vacant")
    .optional()
    .isBoolean()
    .withMessage("Is vacant must be a boolean value"),
];
