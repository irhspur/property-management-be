const express = require("express");
const router = express.Router();

const {
  getPropertyOwners,
  getPropertyOwnersDocuments,
} = require("../../controllers/adminController/propertyOwner");

const {
  getOwnerReviews,
  getOwnerReview,
  reviewOwner,
  confirmOwnerEmail,
  getOwnerDocumentViewUrl,
} = require("../../controllers/adminController/identityReview");
const { identityReviewValidationRules } = require("../../middleware/validations");
const validate = require("../../middleware/validate");
const authorize = require("../../middleware/authorization");

router.get("/", authorize(["admin"]), getPropertyOwners);
router.get("/documents", authorize(["admin"]), getPropertyOwnersDocuments);

// Identity Review
router.get("/identity-reviews", authorize(["admin"]), getOwnerReviews);
router.get("/:userId/identity-review", authorize(["admin"]), getOwnerReview);
router.put("/:userId/identity-review", authorize(["admin"]), identityReviewValidationRules, validate, reviewOwner);
router.post("/:userId/confirm-email", authorize(["admin"]), confirmOwnerEmail);
router.get("/:userId/file/:fileId/view-url", authorize(["admin"]), getOwnerDocumentViewUrl);

module.exports = router;
