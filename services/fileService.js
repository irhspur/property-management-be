const fs = require("fs");
const path = require("path");
const fileModel = require("../models/file");
const userDetailsModel = require("../models/userDetails");
const { withTransaction } = require("../utils/transaction");

const err = (message, statusCode = 500) => Object.assign(new Error(message), { statusCode });

const createFile = async (userId, userData, file, fileCategoryId) => {
  if (!file) throw err("No file uploaded", 400);
  if (!fileCategoryId) throw err("File category ID is required", 400);

  const duplicate = await fileModel.findByUserAndCategory(userId, fileCategoryId);
  if (duplicate) throw err("File already exists for this category. Please Update or replace it.", 400);

  return withTransaction(async (client) => {
    const { rows: catRows } = await client.query("SELECT name FROM file_categories WHERE id = $1", [fileCategoryId]);
    const categoryName = catRows[0]?.name || "uncategorized";
    const mobileNumber = userData.mobileNumber || "unknown_user";
    const dir = path.join("uploads", mobileNumber);
    const ext = path.extname(file.originalname);
    const newFilename = `${userData.firstName}_${categoryName}_${Date.now()}${ext}`;
    const newPath = path.join(dir, newFilename);

    const record = await fileModel.create({
      user_id: userId,
      file_category_id: fileCategoryId,
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
  return fileModel.findByUserWithCategory(userId, filters);
};

const getFile = async (userId, fileId) => {
  const file = await fileModel.findByIdWithOwnerCheck(fileId, userId);
  if (!file) throw err("File not found", 404);
  return file;
};

const updateFile = async (userId, userData, fileId, file, fileCategoryId) => {
  if (!file) throw err("No file provided for update.", 400);

  const existing = await fileModel.findByIdWithOwnerCheck(fileId, userId, { file_category_id: fileCategoryId });
  if (!existing) throw err("File not found", 404);

  return withTransaction(async (client) => {
    const { rows: catRows } = await client.query("SELECT name FROM file_categories WHERE id = $1", [fileCategoryId]);
    const categoryName = catRows[0]?.name || "uncategorized";
    const mobileNumber = userData.mobileNumber || "unknown_user";
    const dir = path.join("uploads", mobileNumber);
    const ext = path.extname(file.originalname);
    const newFilename = `${userData.firstName}_${categoryName}_${Date.now()}${ext}`;
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
  const existing = await fileModel.findByIdWithOwnerCheck(fileId, userId, filters);
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

module.exports = { createFile, getFiles, getFile, updateFile, deleteFile };
