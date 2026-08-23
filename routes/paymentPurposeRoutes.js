const express = require("express");
const router = express.Router();
const {
  createPaymentPurpose,
  getPaymentPurposes,
  getPaymentPurposeById,
  updatePaymentPurpose,
  deletePaymentPurpose,
} = require("../controllers/paymentPurposeController");
const authorize = require("../middleware/authorization");
const { paymentPurposeValidationRules } = require("../middleware/validations");
const validate = require("../middleware/validate");

router.post(
  "/",
  authorize(["admin"]),
  paymentPurposeValidationRules,
  validate,
  createPaymentPurpose
);
router.get("/", authorize(["admin", "property_owner", "tenant"]), getPaymentPurposes);
router.get("/:id", authorize(["admin", "property_owner", "tenant"]), getPaymentPurposeById);
router.put(
  "/",
  authorize(["admin"]),
  paymentPurposeValidationRules,
  validate,
  updatePaymentPurpose
);
router.delete("/:id", authorize(["admin"]), deletePaymentPurpose);

module.exports = router;
