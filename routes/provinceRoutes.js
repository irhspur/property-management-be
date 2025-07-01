const express = require("express");
const router = express.Router();
const {
  getAllProvinces,
  getProvinceById,
  createProvince,
  updateProvince,
  deleteProvince,
} = require("../controllers/provinceController");
const { provinceValidationRules } = require("../middleware/validations");
const validate = require("../middleware/validate");
const authorize = require("../middleware/authorization");

router.get(
  "/",
  authorize(["admin", "property_owner", "tenant"]),
  getAllProvinces
);
router.get(
  "/:id",
  authorize(["admin", "property_owner", "tenant"]),
  getProvinceById
);
router.post(
  "/",
  authorize(["admin"]),
  provinceValidationRules,
  validate,
  createProvince
);
router.put(
  "/:id",
  authorize(["admin"]),
  provinceValidationRules,
  validate,
  updateProvince
);
router.delete("/:id", authorize(["admin"]), deleteProvince);
module.exports = router;
