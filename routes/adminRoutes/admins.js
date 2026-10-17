const express = require("express");
const router = express.Router();

const {
  getAdmins,
  inviteAdmin,
  resendAdminInvite,
} = require("../../controllers/adminController/admins");
const { adminInviteValidationRules } = require("../../middleware/validations");
const validate = require("../../middleware/validate");
const authorize = require("../../middleware/authorization");

router.get("/", authorize(["admin"]), getAdmins);
router.post("/", authorize(["admin"]), adminInviteValidationRules, validate, inviteAdmin);
router.post("/:userId/invite", authorize(["admin"]), resendAdminInvite);

module.exports = router;
