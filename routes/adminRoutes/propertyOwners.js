const express = require("express");
const router = express.Router();

const {
  getPropertyOwners,
  getPropertyOwnersDocuments,
} = require("../../controllers/adminController/propertyOwner");

const authorize = require("../../middleware/authorization");

router.get("/", authorize(["admin"]), getPropertyOwners);
router.get("/documents", authorize(["admin"]), getPropertyOwnersDocuments);

module.exports = router;
