const express = require("express");
const router = express.Router();
const {
  createPaymentPeriod,
  getPaymentPeriods,
  getPaymentPeriodById,
  updatePaymentPeriod,
  deletePaymentPeriod,
} = require("../controllers/paymentPeriodController");
const authorize = require("../middleware/authorization");
const { paymentPeriodValidationRules } = require("../middleware/validations");
const validate = require("../middleware/validate");

router.post(
  "/",
  authorize(["admin"]),
  paymentPeriodValidationRules,
  validate,
  createPaymentPeriod
);
router.get("/", authorize(["admin", "property_owner", "tenant"]), getPaymentPeriods);
router.get("/:id", authorize(["admin", "property_owner", "tenant"]), getPaymentPeriodById);
router.put(
  "/",
  authorize(["admin"]),
  paymentPeriodValidationRules,
  validate,
  updatePaymentPeriod
);
router.delete("/:id", authorize(["admin"]), deletePaymentPeriod);

module.exports = router;
