const express = require("express");
const router = express.Router();
const authorize = require("../middleware/authorization");
const {
  registerValidationRules,
  userValidationRules,
  addressValidationRules,
} = require("../middleware/validations");
const validate = require("../middleware/validate");
const preloadUserCategory = require("../middleware/uploadMiddleware");
const { upload, propertyUpload } = require("../config/multer");

const {
  createTenant,
  uploadFilesForTenant,
  getTenantsByPropertyOwnerId,
  getTenant,
  updateTenantDetails,
  updateTenantAddress,
  getTenantFiles,
  getFileById,
  getTenantFileViewUrl,
  updateTenantFile,
  deleteTenantFile,
  deleteTenant,
} = require("../controllers/tenantController");

// Tenant Routes
router.post(
  "/tenant",
  authorize(["admin", "property_owner"]),
  registerValidationRules,
  userValidationRules,
  addressValidationRules,
  validate,
  createTenant
);

router.get(
  "/tenants",
  authorize(["admin", "property_owner"]),
  getTenantsByPropertyOwnerId
);

router.get(
  "/tenant/:tenantId",
  authorize(["admin", "property_owner"]),
  getTenant
);

router.put(
  "/tenantDetails/:tenantId",
  authorize(["admin", "property_owner"]),
  userValidationRules,
  validate,
  updateTenantDetails
);

router.put(
  "/tenantAddress/:tenantId",
  authorize(["admin", "property_owner"]),
  addressValidationRules,
  validate,
  updateTenantAddress
);

router.post(
  "/tenant/:tenantId/upload-files",
  authorize(["admin", "property_owner"]),
  preloadUserCategory,
  propertyUpload.array("files", 10),
  uploadFilesForTenant
);

router.get(
  "/tenant/:tenantId/files",
  authorize(["admin", "property_owner"]),
  getTenantFiles
);

router.get(
  "/tenant/:tenantId/file/:fileId",
  authorize(["admin", "property_owner"]),
  getFileById
);

router.get(
  "/tenant/:tenantId/file/:fileId/view-url",
  authorize(["admin", "property_owner"]),
  getTenantFileViewUrl
);

router.put(
  "/tenant/:tenantId/file/:fileId",
  authorize(["admin", "property_owner"]),
  preloadUserCategory,
  propertyUpload.array("files", 10),
  updateTenantFile
);

router.delete(
  "/tenant/:tenantId/file/:fileId",
  authorize(["admin", "property_owner"]),
  deleteTenantFile
);
router.delete(
  "/tenant/:tenantId",
  authorize(["admin", "property_owner"]),
  deleteTenant
);

module.exports = router;
