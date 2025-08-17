const express = require("express");
const router = express.Router();
const {
  getMunicipalitiesByDistrictId,
  getMunicipalities,
  getMunicipalityById,
  createMunicipality,
  updateMunicipality,
  deleteMunicipality,
} = require("../controllers/municipalityController");
const { municipalityValidationRules } = require("../middleware/validations");
const validate = require("../middleware/validate");
const authorize = require("../middleware/authorization");
router.get(
  "/by-district",
  authorize(["admin", "property_owner", "tenant"]),
  getMunicipalitiesByDistrictId
);
router.get(
  "/",
  authorize(["admin", "property_owner", "tenant"]),
  getMunicipalities
);
router.get(
  "/:id",
  authorize(["admin", "property_owner", "tenant"]),
  getMunicipalityById
);
router.post(
  "/",
  authorize(["admin"]),
  municipalityValidationRules,
  validate,
  createMunicipality
);
router.put(
  "/:id",
  authorize(["admin"]),
  municipalityValidationRules,
  validate,
  updateMunicipality
);
router.delete("/:id", authorize(["admin"]), deleteMunicipality);

module.exports = router;
