const express = require("express");
const router = express.Router();
const {
  getAllGenders,
  createGender,
  updateGender,
  deleteGender,
} = require("../controllers/genderController");
const { genderValidationRules } = require("../middleware/validations");
const validate = require("../middleware/validate");
const authorize = require("../middleware/authorization");

router.get(
  "/",
  authorize(["admin", "property_owner", "tenant"]),
  getAllGenders
);
router.post(
  "/",
  authorize(["admin"]),
  genderValidationRules,
  validate,
  createGender
);
router.put(
  "/:id",
  authorize(["admin"]),
  genderValidationRules,
  validate,
  updateGender
);
router.delete("/:id", authorize(["admin"]), deleteGender);
module.exports = router;
