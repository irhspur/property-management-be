const express = require("express");
const router = express.Router();
const {
  createAgreementDuration,
  getAgreementDurations,
  getAgreementDurationById,
  updateAgreementDuration,
  deleteAgreementDuration,
} = require("../controllers/agreementDurationController");
const authorize = require("../middleware/authorization");
const { agreementDurationValidationRules } = require("../middleware/validations");
const validate = require("../middleware/validate");

router.post(
  "/",
  authorize(["admin"]),
  agreementDurationValidationRules,
  validate,
  createAgreementDuration
);
router.get("/", authorize(["admin", "property_owner", "tenant"]), getAgreementDurations);
router.get("/:id", authorize(["admin", "property_owner", "tenant"]), getAgreementDurationById);
router.put(
  "/",
  authorize(["admin"]),
  agreementDurationValidationRules,
  validate,
  updateAgreementDuration
);
router.delete("/:id", authorize(["admin"]), deleteAgreementDuration);

module.exports = router;
