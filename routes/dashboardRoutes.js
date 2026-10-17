const express = require("express");
const router = express.Router();
const authorize = require("../middleware/authorization");

const { getDashboard, getActivity } = require("../controllers/dashboardController");

// Portfolio Overview — every figure is scoped to the caller's own portfolio.
// Admins use the owner portal and see their own (empty) one (ADR-0009).
router.get("/dashboard", authorize(["admin", "property_owner"]), getDashboard);
router.get("/activity", authorize(["admin", "property_owner"]), getActivity);

module.exports = router;
