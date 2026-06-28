const express = require("express");
const router = express.Router();
const authorize = require("../middleware/authorization");
const {
  userValidationRules,
  addressValidationRules,
  propertyValidationRules,
} = require("../middleware/validations");
const validate = require("../middleware/validate");
const preloadUserCategory = require("../middleware/uploadMiddleware");
const { upload, propertyUpload } = require("../config/multer");
const {
  getUserByUserId,
  getUserProfile,
  getAddress,
  createUser,
  updateUserDetails,
  updateAddress,
  deleteUser,
  getUserDetailsByMobileNumber,
} = require("../controllers/userController");
const {
  createFile,
  getFilesByUserID,
  getFile,
  updateFile,
  deleteFile,
  getViewUrl,
} = require("../controllers/fileController");
const {
  createProperty,
  getPropertiesByUserID,
  getPropertyById,
  getPropertyByMobileNumber,
  updateProperty,
  deleteProperty,
} = require("../controllers/propertyController");
const {
  createPropertyFile,
  getPropertyFilesByFileId,
  getPropertyFiles,
  updatePropertyFile,
  deletePropertyFile,
} = require("../controllers/propertyFileController");

//User Details and address Routes

router.get(
  "/",
  authorize(["admin", "property_owner", "tenant"]),
  getUserByUserId
);
router.get(
  "/profile",
  authorize(["admin", "property_owner", "tenant"]),
  getUserProfile
);
router.get(
  "/address",
  authorize(["admin", "property_owner", "tenant"]),
  getAddress
);
router.post(
  "/",
  authorize(["admin", "property_owner"]),
  userValidationRules,
  validate,
  createUser
);
router.put(
  "/details",
  authorize(["admin", "property_owner"]),
  userValidationRules,
  validate,
  updateUserDetails
);
router.put(
  "/address",
  authorize(["admin", "property_owner"]),
  addressValidationRules,
  validate,
  updateAddress
);
router.delete("/", authorize(["admin", "property_owner"]), deleteUser);
router.get(
  "/details",
  authorize(["admin", "property_owner"]),
  getUserDetailsByMobileNumber
);

//File Routes
router.post(
  "/file",
  authorize(["admin", "property_owner"]),
  preloadUserCategory,
  propertyUpload.array("files", 10),
  createFile
);
router.get(
  "/files",
  authorize(["admin", "property_owner", "tenant"]),
  getFilesByUserID
);
router.get(
  "/file/:fileId",
  authorize(["admin", "property_owner", "tenant"]),
  getFile
);
router.get(
  "/file/:fileId/view-url",
  authorize(["admin", "property_owner", "tenant"]),
  getViewUrl
);
router.put(
  "/file/:fileId",
  authorize(["admin", "property_owner"]),
  preloadUserCategory,
  propertyUpload.array("files", 10),
  updateFile
);
router.delete(
  "/file/:fileId",
  authorize(["admin", "property_owner"]),
  deleteFile
);

// Property Routes
router.post(
  "/property",
  authorize(["admin", "property_owner"]),
  propertyValidationRules,
  validate,
  createProperty
);
router.get(
  "/properties",
  authorize(["admin", "property_owner"]),
  getPropertiesByUserID
);
router.get(
  "/property/:id",
  authorize(["admin", "property_owner"]),
  getPropertyById
);
router.get(
  "/property",
  authorize(["admin", "property_owner"]),
  getPropertyByMobileNumber
);
router.post(
  "/property",
  authorize(["admin", "property_owner"]),
  propertyValidationRules,
  validate,
  createProperty
);
router.put(
  "/property/:id",
  authorize(["admin", "property_owner"]),
  propertyValidationRules,
  validate,
  updateProperty
);
router.delete(
  "/property/:id",
  authorize(["admin", "property_owner"]),
  deleteProperty
);

// Property File Routes
router.post(
  "/property-file/:property_id",
  authorize(["admin", "property_owner"]),
  preloadUserCategory,
  propertyUpload.array("files", 10),
  createPropertyFile
);

router.get(
  "/property-files",
  authorize(["admin", "property_owner"]),
  getPropertyFiles
);
router.get(
  "/property-file/:fileId",
  authorize(["admin", "property_owner"]),
  getPropertyFilesByFileId
);
router.put(
  "/property-file/:fileId",
  authorize(["admin", "property_owner"]),
  preloadUserCategory,
  propertyUpload.array("files", 10),
  updatePropertyFile
);
router.delete(
  "/property-file/:fileId",
  authorize(["admin", "property_owner"]),
  deletePropertyFile
);

module.exports = router;
