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
router.get("/agreement/:agreementId/payment/:paymentId/receipt/:fileId/view-url", tenant, c.getReceiptViewUrl);
router.get("/agreement/:agreementId/files", tenant, c.getAgreementFiles);
router.get("/agreement/:agreementId/file/:fileId/view-url", tenant, c.getAgreementFileViewUrl);

// The Tenant themselves: personal Documents, profile, Property Owner card.
router.get("/files", tenant, c.getFiles);
router.get("/file/:fileId/view-url", tenant, c.getFileViewUrl);
router.get("/profile", tenant, c.getProfile);
router.get("/owner", tenant, c.getOwner);

module.exports = router;
