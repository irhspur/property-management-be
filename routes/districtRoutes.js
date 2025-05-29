const express = require("express");
const router = express.Router();
const {getAllDistricts, getDistrictById, createDistrict, updateDistrict, deleteDistrict} = require("../controllers/districtController");
router.get("/", getAllDistricts);
router.get("/:id", getDistrictById);
router.post("/", createDistrict);
router.put("/:id", updateDistrict);
router.delete("/:id", deleteDistrict);
module.exports = router;
