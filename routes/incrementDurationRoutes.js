const express = require("express");
const router = express.Router();
const {
  createIncrementDuration,
  getIncrementDurations,
  getIncrementDurationById,
  updateIncrementDuration,
  deleteIncrementDuration,
} = require("../controllers/incrementDurationController");
const authorize = require("../middleware/authorization");
const { incrementDurationValidationRules } = require("../middleware/validations");
const validate = require("../middleware/validate");

router.post(
  "/",
  authorize(["admin"]),
  incrementDurationValidationRules,
  validate,
  createIncrementDuration
);
router.get("/", authorize(["admin", "property_owner", "tenant"]), getIncrementDurations);
router.get("/:id", authorize(["admin", "property_owner", "tenant"]), getIncrementDurationById);
router.put(
  "/",
  authorize(["admin"]),
  incrementDurationValidationRules,
  validate,
  updateIncrementDuration
);
router.delete("/:id", authorize(["admin"]), deleteIncrementDuration);

module.exports = router;
