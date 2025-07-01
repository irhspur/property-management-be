const express = require("express");
const router = express.Router();
const { userTypeValidationRules } = require("../middleware/validations");
const validate = require("../middleware/validate");
const {
  getAllUserTypes,
  getUserTypeById,
  createUserType,
  updateUserType,
  deleteUserType,
  getUserTypeByName,
} = require("../controllers/userTypeController");
router.get(
  "/",
  authorize(["admin", "property_owner", "tenant"]),
  getAllUserTypes
);
router.get(
  "/:id",
  authorize(["admin", "property_owner", "tenant"]),
  getUserTypeById
);
router.post(
  "/",
  authorize(["admin"]),
  userTypeValidationRules,
  validate,
  createUserType
);
router.put(
  "/:id",
  authorize(["admin"]),
  userTypeValidationRules,
  validate,
  updateUserType
);
router.delete("/:id", authorize(["admin"]), deleteUserType);
router.get(
  "/:name",
  authorize(["admin", "property_owner", "tenant"]),
  getUserTypeByName
);
module.exports = router;
