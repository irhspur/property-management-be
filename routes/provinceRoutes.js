const express = require("express");
const router = express.Router();
const {getAllProvinces, getProvinceById, createProvince, updateProvince, deleteProvince} = require("../controllers/provinceController");
router.get("/", getAllProvinces);
router.get("/:id", getProvinceById);
router.post("/", createProvince);
router.put("/:id", updateProvince);
router.delete("/:id", deleteProvince);
module.exports = router;
