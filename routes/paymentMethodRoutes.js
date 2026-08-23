const express = require("express");
const router = express.Router();
const {
  createPaymentMethod,
  getPaymentMethods,
  getPaymentMethodById,
  updatePaymentMethod,
  deletePaymentMethod,
} = require("../controllers/paymentMethodController");
const authorize = require("../middleware/authorization");
const { paymentMethodValidationRules } = require("../middleware/validations");
const validate = require("../middleware/validate");

router.post(
  "/",
  authorize(["admin"]),
  paymentMethodValidationRules,
  validate,
  createPaymentMethod
);
router.get("/", authorize(["admin", "property_owner", "tenant"]), getPaymentMethods);
router.get("/:id", authorize(["admin", "property_owner", "tenant"]), getPaymentMethodById);
router.put(
  "/",
  authorize(["admin"]),
  paymentMethodValidationRules,
  validate,
  updatePaymentMethod
);
router.delete("/:id", authorize(["admin"]), deletePaymentMethod);

module.exports = router;
