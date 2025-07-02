const express = require("express");
const router = express.Router();
const {
  getFileCategories,
  getFileCategoryById,
  createFileCategory,
  updateFileCategory,
  deleteFileCategory,
} = require("../controllers/fileCategoryController");
const authorize = require("../middleware/authorization");
const { fileCategoriesValidationRules } = require("../middleware/validations");
const validate = require("../middleware/validate");

router.get("/", authorize(["admin", "property_owner"]), getFileCategories);
router.get("/:id", authorize(["admin", "property_owner"]), getFileCategoryById);
router.post(
  "/",
  authorize(["admin"]),
  fileCategoriesValidationRules,
  validate,
  createFileCategory
);
router.put(
  "/:id",
  authorize(["admin"]),
  fileCategoriesValidationRules,
  validate,
  updateFileCategory
);
router.delete("/:id", authorize(["admin"]), deleteFileCategory);

module.exports = router;
