// The tenant portal: a Tenant's own records, read-only. Mounted at /tenant.
// Every route is tenant-only; a record that isn't the caller's is 404
// (services/ownership.ts byTenant).
const express = require("express");
const router = express.Router();
const authorize = require("../middleware/authorization");

const {
  getAgreements,
  getAgreement,
  getStatement,
  getPayments,
  getReceipts,
  getReceiptViewUrl,
  getAgreementFiles,
  getAgreementFileViewUrl,
  getFiles,
  getFileViewUrl,
  getProfile,
  getOwner,
} = require("../controllers/tenantPortalController");

// Agreements and Statements
router.get("/agreements", authorize(["tenant"]), getAgreements);
router.get("/agreement/:agreementId", authorize(["tenant"]), getAgreement);
router.get("/agreement/:agreementId/statement", authorize(["tenant"]), getStatement);

// Payments, Payment Receipts and Agreement Documents
router.get("/agreement/:agreementId/payments", authorize(["tenant"]), getPayments);
router.get("/agreement/:agreementId/payment/:paymentId/receipts", authorize(["tenant"]), getReceipts);
router.get(
  "/agreement/:agreementId/payment/:paymentId/receipt/:fileId/view-url",
  authorize(["tenant"]),
  getReceiptViewUrl
);
router.get("/agreement/:agreementId/files", authorize(["tenant"]), getAgreementFiles);
router.get("/agreement/:agreementId/file/:fileId/view-url", authorize(["tenant"]), getAgreementFileViewUrl);

// The Tenant themselves: personal Documents, profile, Property Owner card
router.get("/files", authorize(["tenant"]), getFiles);
router.get("/file/:fileId/view-url", authorize(["tenant"]), getFileViewUrl);
router.get("/profile", authorize(["tenant"]), getProfile);
router.get("/owner", authorize(["tenant"]), getOwner);

module.exports = router;
