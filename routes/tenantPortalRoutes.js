// The tenant portal: a Tenant's own records, read-only. Mounted at /tenant.
// Every route is tenant-only; a record that isn't the caller's is 404
// (services/ownership.ts byTenant).
const express = require("express");
const router = express.Router();
const authorize = require("../middleware/authorization");
const c = require("../controllers/tenantPortalController");

const tenant = authorize(["tenant"]);

router.get("/agreements", tenant, c.getAgreements);
router.get("/agreement/:agreementId", tenant, c.getAgreement);
router.get("/agreement/:agreementId/statement", tenant, c.getStatement);

// Payments, Payment Receipts and Agreement Documents (ticket 04)
router.get("/agreement/:agreementId/payments", tenant, c.getPayments);
router.get("/agreement/:agreementId/payment/:paymentId/receipts", tenant, c.getReceipts);

module.exports = router;
