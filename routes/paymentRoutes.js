const express = require("express");
const router = express.Router();
const authorize = require("../middleware/authorization");
const { paymentValidationRules } = require("../middleware/validations");
const validate = require("../middleware/validate");

const {
  createPayment,
  updatePayment,
  deletePayment,
  getPayment,
  getPaymentsForAgreement,
  getStatement,
  getLedger,
  getLedgerSummary,
} = require("../controllers/paymentController");

// Ledger — flat, cross-Agreement (Q17-Q19). Registered before the nested
// :tenantId routes below only for readability; Express doesn't need the
// ordering since "/payments" and "/tenant/..." can't collide.
router.get("/payments", authorize(["admin", "property_owner"]), getLedger);
router.get("/payments/summary", authorize(["admin", "property_owner"]), getLedgerSummary);

// Payment Routes — nested under Agreement, mirroring agreementRoutes.js
router.post(
  "/tenant/:tenantId/agreement/:agreementId/payment",
  authorize(["admin", "property_owner"]),
  paymentValidationRules,
  validate,
  createPayment
);

router.get(
  "/tenant/:tenantId/agreement/:agreementId/payments",
  authorize(["admin", "property_owner"]),
  getPaymentsForAgreement
);

router.get(
  "/tenant/:tenantId/agreement/:agreementId/payment/:paymentId",
  authorize(["admin", "property_owner"]),
  getPayment
);

router.get(
  "/tenant/:tenantId/agreement/:agreementId/statement",
  authorize(["admin", "property_owner"]),
  getStatement
);

router.put(
  "/tenant/:tenantId/agreement/:agreementId/payment/:paymentId",
  authorize(["admin", "property_owner"]),
  paymentValidationRules,
  validate,
  updatePayment
);

router.delete(
  "/tenant/:tenantId/agreement/:agreementId/payment/:paymentId",
  authorize(["admin", "property_owner"]),
  deletePayment
);

module.exports = router;
