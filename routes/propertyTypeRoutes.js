const express = require("express");
const router = express.Router();
const {
  createPropertyType,
  getPropertyTypes,
  getPropertyTypeById,
  updatePropertyType,
  deletePropertyType,
} = require("../controllers/propertyTypeController");
const authorize = require("../middleware/authorization");
const { propertyTypesValidationRules } = require("../middleware/validations");
const validate = require("../middleware/validate");
router.post(
  "/",
  authorize(["admin"]),
  propertyTypesValidationRules,
  validate,
  createPropertyType
);
router.get("/", authorize(["admin"]), getPropertyTypes);
router.get("/:id", authorize(["admin"]), getPropertyTypeById);
router.put(
  "/",
  authorize(["admin"]),
  propertyTypesValidationRules,
  validate,
  updatePropertyType
);
router.delete("/:id", authorize(["admin"]), deletePropertyType);

module.exports = router;
