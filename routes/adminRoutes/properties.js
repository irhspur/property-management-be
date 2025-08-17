const express = require("express");
const router = express.Router();

const {
  getProperties,
  getPropertiesDocuments,
} = require("../../controllers/adminController/properties");
const authorize = require("../../middleware/authorization");

router.get("/", authorize(["admin"]), getProperties);
router.get("/documents", authorize(["admin"]), getPropertiesDocuments);

module.exports = router;
