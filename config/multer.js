const multer = require("multer");
const path = require("path");
const fs = require("fs");

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const { mobileNumber } = req.userData;
    const dir = path.join("uploads", mobileNumber);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  /*filename: (req, file, cb) => {
    const { firstName } = req.userData;
    const fileCategoryName = req.userData?.fileCategoryName || "uncategorized";
    const ext = path.extname(file.originalname);
    const timestamp = Date.now();
    const filename = `${firstName}_${fileCategoryName}_${timestamp}${ext}`;
    cb(null, filename);
  },*/
  filename: (req, file, cb) => {
    const timestamp = Date.now();
    const ext = path.extname(file.originalname);
    const tempFilename = `temp_${timestamp}${ext}`;
    cb(null, tempFilename);
  },
});
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "application/pdf"];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(
        new Error(
          "Invalid file type. Only JPEG, PNG, and PDF files are allowed."
        )
      );
    }
    cb(null, true);
  },
});

const propertyStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    const { mobileNumber } = req.userData;
    const dir = path.join("uploads", mobileNumber);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  /*filename: (req, file, cb) => {
    const { firstName, propertyFileCategoryName } = req.userData;
    const ext = path.extname(file.originalname);
    const timestamp = Date.now();
    const filename = `${firstName}_${propertyFileCategoryName}_${timestamp}${ext}`;
    cb(null, filename);
  },*/
});

const propertyUpload = multer({
  storage: propertyStorage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10 MB
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "application/pdf"];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(
        new Error(
          "Invalid file type. Only JPEG, PNG, and PDF files are allowed."
        )
      );
    }
    cb(null, true);
  },
});

module.exports = { upload, propertyUpload };
