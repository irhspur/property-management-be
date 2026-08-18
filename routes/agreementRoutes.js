const express = require("express");
const router = express.Router();
const authorize = require("../middleware/authorization");
const { agreementValidationRules } = require("../middleware/validations");
const validate = require("../middleware/validate");

const {
  createAgreement,
  getAgreementsByOwner,
  getAgreementsForTenant,
  getAgreement,
  endAgreement,
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
  getAgreementsByOwner
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

module.exports = router;
