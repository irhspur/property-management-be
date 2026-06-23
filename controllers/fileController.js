const fileService = require("../services/fileService");

const respond = (res, error) =>
  res.status(error.statusCode || 500).json({ status: "NAK", message: error.message });

const createFile = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ status: "NAK", message: "No files uploaded" });
    }
    if (req.files.length > 1) {
      return res.status(400).json({ status: "NAK", message: "Only one file allowed per category. Upload one file at a time." });
    }
    const record = await fileService.createFile(
      req.user.id,
      req.userData,
      req.files[0],
      req.body.file_category_id
    );
    res.json({ status: "AK", message: "File uploaded successfully", data: record });
  } catch (error) {
    console.error(error.message);
    respond(res, error);
  }
};

const getFilesByUserID = async (req, res) => {
  try {
    const { file_category_id, mobile_number } = req.query;
    const files = await fileService.getFiles(req.user.id, { file_category_id, mobile_number });
    if (files.length === 0) {
      return res.status(404).json({ status: "NAK", message: "No files found" });
    }
    res.json({ status: "AK", data: files });
  } catch (error) {
    console.error(error.message);
    respond(res, error);
  }
};

const getFile = async (req, res) => {
  try {
    const file = await fileService.getFile(req.user.id, req.params.fileId);
    res.json({ status: "AK", data: file });
  } catch (error) {
    console.error(error.message);
    respond(res, error);
  }
};

const updateFile = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ status: "NAK", message: "No file provided for update." });
    }
    const updated = await fileService.updateFile(
      req.user.id,
      req.userData,
      req.params.fileId,
      req.files[0],
      req.body.file_category_id
    );
    res.json({ status: "AK", message: "File updated successfully", data: updated });
  } catch (error) {
    console.error(error.message);
    respond(res, error);
  }
};

const deleteFile = async (req, res) => {
  try {
    const { mobile_number, file_category_id } = req.query;
    await fileService.deleteFile(req.user.id, req.params.fileId, { mobile_number, file_category_id });
    res.json({ status: "AK", message: "File deleted successfully" });
  } catch (error) {
    console.error(error.message);
    respond(res, error);
  }
};

module.exports = { createFile, getFilesByUserID, getFile, updateFile, deleteFile };
