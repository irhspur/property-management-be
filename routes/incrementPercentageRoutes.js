const express = require("express");
const router = express.Router();
const {
  createIncrementPercentage,
  getIncrementPercentages,
  getIncrementPercentageById,
  updateIncrementPercentage,
  deleteIncrementPercentage,
} = require("../controllers/incrementPercentageController");
const authorize = require("../middleware/authorization");
const { incrementPercentageValidationRules } = require("../middleware/validations");
const validate = require("../middleware/validate");

router.post(
  "/",
  authorize(["admin"]),
  incrementPercentageValidationRules,
  validate,
  createIncrementPercentage
);
router.get("/", authorize(["admin", "property_owner", "tenant"]), getIncrementPercentages);
router.get("/:id", authorize(["admin", "property_owner", "tenant"]), getIncrementPercentageById);
router.put(
  "/",
  authorize(["admin"]),
  incrementPercentageValidationRules,
  validate,
  updateIncrementPercentage
);
router.delete("/:id", authorize(["admin"]), deleteIncrementPercentage);

module.exports = router;
