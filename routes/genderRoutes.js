const express = require("express");
const router = express.Router();
const {
  getAllGenders,
  getGenderById,
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
router.get(
  "/:id",
  authorize(["admin", "property_owner", "tenant"]),
  getGenderById
);
router.post(
  "/",
  authorize(["admin"]),
  genderValidationRules,
  validate,
  createGender
);
router.put(
  "/",
  authorize(["admin"]),
  genderValidationRules,
  validate,
  updateGender
);
router.delete("/:id", authorize(["admin"]), deleteGender);
module.exports = router;
