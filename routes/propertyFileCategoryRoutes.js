const express = require("express");
const router = express.Router();
const {
  getPropertyFileCategories,
  getPropertyFileCategoryById,
  createPropertyFileCategory,
  updatePropertyFileCategory,
  deletePropertyFileCategory,
} = require("../controllers/propertyFileCategoryController");
const { authorize } = require("../middleware/authorization");
const {
  propertyFileCategoriesValidationRules,
} = require("../middleware/validations");
const validate = require("../middleware/validate");

// Route to get all property file categories
router.get(
  "/",
  authorize(["admin", "property_owner"]),
  getPropertyFileCategories
);
// Route to get a property file category by ID
router.get(
  "/:id",
  authorize(["admin", "property_owner"]),
  getPropertyFileCategoryById
);
// Route to create a new property file category
router.post(
  "/",
  authorize(["admin"]),
  propertyFileCategoriesValidationRules,
  validate,
  createPropertyFileCategory
);

// Route to update a property file category by ID
router.put(
  "/:id",
  authorize(["admin"]),
  propertyFileCategoriesValidationRules,
  validate,
  updatePropertyFileCategory
);
// Route to delete a property file category by ID
router.delete("/:id", authorize(["admin"]), deletePropertyFileCategory);

module.exports = router;
