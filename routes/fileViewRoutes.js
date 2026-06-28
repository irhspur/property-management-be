const express = require("express");
const router = express.Router();
const { serveFile } = require("../controllers/fileController");

router.get("/:token", serveFile);

module.exports = router;
