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

/*const propertyUpload = multer({
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
});*/

const propertyUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB per file
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/png", "application/pdf"];
    if (!allowedTypes.includes(file.mimetype)) {
      return cb(new Error("Only JPEG, PNG, and PDF files are allowed."));
    }
    cb(null, true);
  },
});

// Profile photos: shown on every list row, so smaller than Documents and
// images only. Memory storage; tenantService writes the buffer.
const PHOTO_MAX_BYTES = 2 * 1024 * 1024;
const photoMulter = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: PHOTO_MAX_BYTES, files: 1 },
  fileFilter: (req, file, cb) => {
    if (!["image/jpeg", "image/png"].includes(file.mimetype)) {
      return cb(Object.assign(new Error("photo must be a JPEG or PNG image"), { photoRejected: true }));
    }
    cb(null, true);
  },
});

// Wraps multer so its rejections come back in the 400 validation envelope
// rather than Express's HTML 500 (see "File Uploads" in API_DOCS.md).
const photoUpload = (req, res, next) =>
  photoMulter.single("photo")(req, res, (err) => {
    if (!err) return next();
    let message = "photo upload failed";
    if (err.photoRejected) message = err.message;
    else if (err.code === "LIMIT_FILE_SIZE") message = "photo must be at most 2 MB";
    else if (err.code === "LIMIT_UNEXPECTED_FILE" || err.code === "LIMIT_FILE_COUNT")
      message = "photo must be sent as a single file in the 'photo' field";
    else if (!(err instanceof multer.MulterError)) return next(err);
    return res.status(400).json({ errors: [{ field: "photo", message }] });
  });

// Up to `maxFiles` JPEG/PNG/PDF files in the `files` field, held in memory
// for the service to write, with multer's rejections returned in the 400
// validation envelope, as photoUpload does.
const filesUpload = (maxFiles, maxMb) => {
  const instance = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: maxMb * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (!["image/jpeg", "image/png", "application/pdf"].includes(file.mimetype)) {
        return cb(new Error("Only JPEG, PNG, and PDF files are allowed."));
      }
      cb(null, true);
    },
  });
  return (req, res, next) =>
    instance.array("files", maxFiles)(req, res, (err) => {
      if (!err) return next();
      let message;
      if (err.code === "LIMIT_FILE_SIZE") message = `each file must be at most ${maxMb} MB`;
      else if (err.code === "LIMIT_UNEXPECTED_FILE")
        message = `send at most ${maxFiles} files, in the 'files' field`;
      else if (!(err instanceof multer.MulterError)) message = err.message;
      else return next(err);
      return res.status(400).json({ errors: [{ field: "files", message }] });
    });
};

// Agreement documents.
const documentsUpload = filesUpload(10, 10);

// Payment receipts: a photo or scan of a receipt, cheque or bank slip.
const receiptsUpload = filesUpload(5, 5);

module.exports = { upload, propertyUpload, photoUpload, documentsUpload, receiptsUpload };
