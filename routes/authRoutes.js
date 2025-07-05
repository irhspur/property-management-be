const express = require("express");
const router = express.Router();

const {
  register,
  verifyEmail,
  login,
  forgotPassword,
  resetPassword,
  changePassword,
} = require("../controllers/authController");

const {
  registerValidationRules,
  loginValidationRules,
  forgotPasswordValidationRules,
  resetPasswordValidationRules,
  changePasswordValidationRules,
} = require("../middleware/validations");

const validate = require("../middleware/validate");
const authorize = require("../middleware/authorization");

// Authentication routes

router.post("/register", registerValidationRules, validate, register);
router.get("/verify-email?:token", verifyEmail);
router.post("/login", loginValidationRules, validate, login);
router.post(
  "/forgot-password",
  forgotPasswordValidationRules,
  validate,
  forgotPassword
);
router.post(
  "/reset-password?:token",
  resetPasswordValidationRules,
  validate,
  resetPassword
);
router.post(
  "/change-password",
  authorize(["admin", "property_owner", "tenant"]),
  changePasswordValidationRules,
  validate,
  changePassword
);

module.exports = router;
