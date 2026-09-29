const express = require("express");
const router = express.Router();
const authorize = require("../middleware/authorization");

const { getDashboard, getActivity } = require("../controllers/dashboardController");

// Portfolio Overview — property owners only; every figure is scoped to the
// caller's own portfolio, so there is no admin view here.
router.get("/dashboard", authorize(["property_owner"]), getDashboard);
router.get("/activity", authorize(["property_owner"]), getActivity);

module.exports = router;
