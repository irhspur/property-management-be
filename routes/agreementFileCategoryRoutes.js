const express = require("express");
const router = express.Router();
const {
  getAgreementFileCategories,
  getAgreementFileCategoryById,
  createAgreementFileCategory,
  updateAgreementFileCategory,
  deleteAgreementFileCategory,
} = require("../controllers/agreementFileCategoryController");
const authorize = require("../middleware/authorization");
const {
  agreementFileCategoriesValidationRules,
  categoryCodeCreateRules,
} = require("../middleware/validations");
const validate = require("../middleware/validate");

// Route to get all agreement file categories
router.get(
  "/",
  authorize(["admin", "property_owner", "tenant"]),
  getAgreementFileCategories
);
// Route to get a agreement file category by ID
router.get(
  "/:id",
  authorize(["admin", "property_owner", "tenant"]),
  getAgreementFileCategoryById
);
// Route to create a new agreement file category
router.post(
  "/",
  authorize(["admin"]),
  agreementFileCategoriesValidationRules,
  categoryCodeCreateRules,
  validate,
  createAgreementFileCategory
);

// Route to update a agreement file category by ID
router.put(
  "/:id",
  authorize(["admin"]),
  agreementFileCategoriesValidationRules,
  validate,
  updateAgreementFileCategory
);
// Route to delete a agreement file category by ID
router.delete("/:id", authorize(["admin"]), deleteAgreementFileCategory);

module.exports = router;
