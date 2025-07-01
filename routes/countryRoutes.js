const express = require("express");
const router = express.Router();

const {
  getAllCountries,
  getCountryById,
  createCountry,
  updateCountry,
  deleteCountry,
} = require("../controllers/countryController");

const { countryValidationRules } = require("../middleware/validations");
const validate = require("../middleware/validate");
const authorize = require("../middleware/authorization");

router.get(
  "/",
  authorize(["admin", "property_owner", "tenant"]),
  getAllCountries
);

router.get(
  "/:id",
  authorize(["admin", "property_owner", "tenant"]),
  getCountryById
);

router.post(
  "/",
  authorize(["admin"]),
  countryValidationRules,
  validate,
  createCountry
);

router.put(
  "/:id",
  authorize(["admin"]),
  countryValidationRules,
  validate,
  updateCountry
);

router.delete("/:id", authorize(["admin"]), deleteCountry);

module.exports = router;
