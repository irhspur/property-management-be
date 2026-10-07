const express = require("express");
const router = express.Router();
const authorize = require("../middleware/authorization");
const {
  agreementValidationRules,
  agreementListQueryRules,
} = require("../middleware/validations");
const validate = require("../middleware/validate");
const { documentsUpload } = require("../config/multer");

const {
  createAgreement,
  getAgreementsByOwner,
  getAgreementSummary,
  getAgreementsForTenant,
  getAgreement,
  getAgreementById,
  endAgreement,
  getAgreementFiles,
  uploadAgreementFiles,
  getAgreementFileViewUrl,
  deleteAgreementFile,
} = require("../controllers/agreementController");

// Agreement Routes
router.post(
  "/tenant/:tenantId/agreement",
  authorize(["admin", "property_owner"]),
  agreementValidationRules,
  validate,
  createAgreement
);

router.get(
  "/agreements",
  authorize(["admin", "property_owner"]),
  agreementListQueryRules,
  validate,
  getAgreementsByOwner
);

// Before /agreements/:agreementId, which would otherwise match "summary".
router.get(
  "/agreements/summary",
  authorize(["admin", "property_owner"]),
  getAgreementSummary
);

router.get(
  "/agreements/:agreementId",
  authorize(["admin", "property_owner"]),
  getAgreementById
);

router.get(
  "/tenant/:tenantId/agreements",
  authorize(["admin", "property_owner"]),
  getAgreementsForTenant
);

router.get(
  "/tenant/:tenantId/agreement/:agreementId",
  authorize(["admin", "property_owner"]),
  getAgreement
);

router.put(
  "/tenant/:tenantId/agreement/:agreementId/end",
  authorize(["admin", "property_owner"]),
  endAgreement
);

// Agreement documents
router.get(
  "/tenant/:tenantId/agreement/:agreementId/files",
  authorize(["admin", "property_owner"]),
  getAgreementFiles
);

router.post(
  "/tenant/:tenantId/agreement/:agreementId/files",
  authorize(["admin", "property_owner"]),
  documentsUpload,
  uploadAgreementFiles
);

router.get(
  "/tenant/:tenantId/agreement/:agreementId/file/:fileId/view-url",
  authorize(["admin", "property_owner"]),
  getAgreementFileViewUrl
);

router.delete(
  "/tenant/:tenantId/agreement/:agreementId/file/:fileId",
  authorize(["admin", "property_owner"]),
  deleteAgreementFile
);

module.exports = router;
