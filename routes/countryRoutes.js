const express = require("express");
const router = express.Router();

const {getAllCountries, getCountryById, createCountry, updateCountry, deleteCountry} = require("../controllers/countryController");

router.get("/", getAllCountries);

router.get("/:id", getCountryById);

router.post("/", countryValidationRules, validateCountry, createCountry);

router.put("/:id", updateCountry);

router.delete("/:id", deleteCountry);


    

module.exports = router;