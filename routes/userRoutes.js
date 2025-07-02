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
  getUserDetails,
  getUserDetailsById,
  createUserDetails,
  updateUserDetails,
  deleteUserDetails,
  getUserDetailsByMobileNumber,
} = require("../controllers/userController");
const {
  getAddressByUserId,
  createAddress,
  updateAddress,
  deleteAddress,
} = require("../controllers/addressController");
const {
  createFile,
  getFilesByUserID,
  getFiles,
  getFilesByMobileNumber,
  updateFile,
  deleteFile,
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
  getPropertyFilesByUserID,
  getPropertyFiles,
  getPropertyFilesByMobileNumber,
  updatePropertyFile,
  deletePropertyFile,
} = require("../controllers/propertyFileController");

//User Details Routes
router.get("/details", authorize(["admin", "property_owner"]), getUserDetails);
router.get(
  "/details/:id",
  authorize(["admin", "property_owner", "tenant"]),
  getUserDetailsById
);
router.post(
  "/details",
  authorize(["admin", "property_owner"]),
  userValidationRules,
  validate,
  createUserDetails
);
router.put(
  "/details/:id",
  authorize(["admin", "property_owner"]),
  userValidationRules,
  validate,
  updateUserDetails
);
router.delete(
  "/details/:id",
  authorize(["admin", "property_owner"]),
  deleteUserDetails
);
router.get(
  "/details",
  authorize(["admin", "property_owner"]),
  getUserDetailsByMobileNumber
);

//Address Routes
router.get(
  "/address/:id",
  authorize(["admin", "property_owner", "tenant"]),
  getAddressByUserId
);
router.post(
  "/address",
  authorize(["admin", "property_owner"]),
  addressValidationRules,
  validate,
  createAddress
);
router.put(
  "/address/:id",
  authorize(["admin", "property_owner"]),
  addressValidationRules,
  validate,
  updateAddress
);
router.delete(
  "/address/:id",
  authorize(["admin", "property_owner"]),
  deleteAddress
);

//File Routes
router.post(
  "/file",
  authorize(["admin", "property_owner"]),
  preloadUserCategory,
  upload.array("files", 10),
  createFile
);
router.get(
  "/file/:user_id",
  authorize(["admin", "property_owner", "tenant"]),
  getFilesByUserID
);
router.get("/files", authorize(["admin"]), getFiles);
router.get(
  "/files/:mobile_number",
  authorize(["admin", "property_owner"]),
  getFilesByMobileNumber
);
router.put(
  "/file/:id",
  authorize(["admin", "property_owner"]),
  preloadUserCategory,
  upload.array("files", 10),
  updateFile
);
router.delete("/file/:id", authorize(["admin", "property_owner"]), deleteFile);

// Property Routes
router.post(
  "/property",
  authorize(["admin", "property_owner"]),
  propertyValidationRules,
  validate,
  createProperty
);
router.get(
  "/property/:user_id",
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
  "/property-file",
  authorize(["admin", "property_owner"]),
  preloadUserCategory,
  propertyUpload.array("files", 10),
  createPropertyFile
);
router.get(
  "/property-file/:user_id",
  authorize(["admin", "property_owner"]),
  getPropertyFilesByUserID
);
router.get(
  "/property-file",
  authorize(["admin", "property_owner"]),
  getPropertyFiles
);
router.get(
  "/property-file/:mobile_number",
  authorize(["admin", "property_owner"]),
  getPropertyFilesByMobileNumber
);
router.put(
  "/property-file/:id",
  authorize(["admin", "property_owner"]),
  preloadUserCategory,
  propertyUpload.array("files", 10),
  updatePropertyFile
);
router.delete(
  "/property-file/:id",
  authorize(["admin", "property_owner"]),
  deletePropertyFile
);

module.exports = router;
