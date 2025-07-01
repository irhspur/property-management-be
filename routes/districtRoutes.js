const express = require("express");
const router = express.Router();
const {
  getAllDistricts,
  getDistrictById,
  createDistrict,
  updateDistrict,
  deleteDistrict,
} = require("../controllers/districtController");
const { districtValidationRules } = require("../middleware/validations");
const validate = require("../middleware/validate");
const authorize = require("../middleware/authorization");
router.get(
  "/",
  authorize(["admin", "property_owner", "tenant"]),
  getAllDistricts
);
router.get(
  "/:id",
  authorize(["admin", "property_owner", "tenant"]),
  getDistrictById
);
router.post(
  "/",
  authorize(["admin"]),
  districtValidationRules,
  validate,
  createDistrict
);
router.put(
  "/:id",
  authorize(["admin"]),
  districtValidationRules,
  validate,
  updateDistrict
);
router.delete("/:id", authorize(["admin"]), deleteDistrict);
module.exports = router;
