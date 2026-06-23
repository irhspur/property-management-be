const fs = require("fs");
const path = require("path");
const fileModel = require("../models/file");
const propertyModel = require("../models/property");
const { withTransaction } = require("../utils/transaction");

const err = (message, statusCode = 500) => Object.assign(new Error(message), { statusCode });

const sanitizeName = (name) => name.replace(/[<>:"/\\|?*]+/g, "_").trim();

const createFile = async (userId, propertyId, userData, file, propertyFileCategoryId) => {
  if (!file) throw err("No file uploaded", 400);
  if (!propertyFileCategoryId) throw err("Property file category ID is required", 400);

  const duplicate = await fileModel.findByUserAndPropertyCategory(userId, propertyFileCategoryId, propertyId);
  if (duplicate) throw err("File already exists for this category. Please Update or replace it.", 400);

  return withTransaction(async (client) => {
    const { rows: propRows } = await client.query(
      "SELECT property_name FROM properties WHERE property_id = $1",
      [propertyId]
    );
    const { rows: catRows } = await client.query(
      "SELECT name FROM property_file_categories WHERE id = $1",
      [propertyFileCategoryId]
    );

    const propertyName = propRows[0]?.property_name || "unknown_property";
    const categoryName = catRows[0]?.name || "uncategorized";
    const mobileNumber = userData.mobileNumber || "unknown_user";
    const dir = path.join("uploads", sanitizeName(mobileNumber), sanitizeName(propertyName));
    const ext = path.extname(file.originalname);
    const newFilename = `${userData.firstName}_${sanitizeName(categoryName)}_${Date.now()}${ext}`;
    const newPath = path.join(dir, newFilename);

    const record = await fileModel.createPropertyFile({
      user_id: userId,
      property_id: propertyId,
      property_file_category_id: propertyFileCategoryId,
      original_name: file.originalname,
      mimetype: file.mimetype,
      file_size: file.size,
      file_name: newFilename,
      file_path: newPath,
    }, client);

    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(newPath, file.buffer);
    return record;
  });
};

const getFiles = async (userId, filters = {}) => {
  return fileModel.findPropertyFiles(userId, filters);
};

const getFileById = async (userId, fileId, filters = {}) => {
  return fileModel.findPropertyFileById(fileId, userId, filters);
};

const updateFile = async (userId, fileId, userData, file, propertyFileCategoryId) => {
  if (!file) throw err("No file provided for update.", 400);

  const existing = await fileModel.findPropertyFileByIdForUpdate(fileId, userId, {
    property_file_category_id: propertyFileCategoryId,
  });
  if (!existing) throw err("File not found", 404);

  return withTransaction(async (client) => {
    const { rows: propRows } = await client.query(
      "SELECT property_name FROM properties WHERE property_id = $1",
      [existing.property_id]
    );
    const { rows: catRows } = await client.query(
      "SELECT name FROM property_file_categories WHERE id = $1",
      [propertyFileCategoryId]
    );

    const propertyName = propRows[0]?.property_name || "unknown_property";
    const categoryName = catRows[0]?.name || "uncategorized";
    const mobileNumber = userData.mobileNumber || "unknown_user";
    const dir = path.join("uploads", sanitizeName(mobileNumber), sanitizeName(propertyName));
    const ext = path.extname(file.originalname);
    const newFilename = `${userData.firstName}_${sanitizeName(categoryName)}_${Date.now()}${ext}`;
    const newPath = path.join(dir, newFilename);

    const updated = await fileModel.update(fileId, {
      original_name: file.originalname,
      mimetype: file.mimetype,
      file_size: file.size,
      file_name: newFilename,
      file_path: newPath,
    }, client);

    fs.mkdirSync(dir, { recursive: true });
    if (fs.existsSync(existing.file_path)) fs.unlinkSync(existing.file_path);
    fs.writeFileSync(newPath, file.buffer);
    return updated;
  });
};

const deleteFile = async (userId, fileId, filters = {}) => {
  const existing = await fileModel.findPropertyFileByIdForUpdate(fileId, userId, filters);
  if (!existing) throw err("File not found", 404);

  await withTransaction(async (client) => {
    await fileModel.deleteById(fileId, client);
    if (existing.file_path && fs.existsSync(existing.file_path)) {
      fs.unlinkSync(existing.file_path);
      const parentDir = path.dirname(existing.file_path);
      if (fs.readdirSync(parentDir).length === 0) fs.rmdirSync(parentDir);
    }
  });
};

module.exports = { createFile, getFiles, getFileById, updateFile, deleteFile };
