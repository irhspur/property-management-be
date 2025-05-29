const express = require("express");
const router = express.Router();
const {getAllUsersDetails, getUserDetailsById, createUserDetails, updateUserDetails, deleteUserDetails} = require("../controllers/userController");
router.get("/details", getAllUsersDetails);
router.get("/details/:id", getUserDetailsById);
router.post("/details",  createUserDetails);
router.put("/details/:id", updateUserDetails);
router.delete("/details/:id", deleteUserDetails);
module.exports = router;