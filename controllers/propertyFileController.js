const propertyFileService = require("../services/propertyFileService");

const respond = (res, error) =>
  res.status(error.statusCode || 500).json({ status: "NAK", message: error.message });

const createPropertyFile = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ status: "NAK", message: "No files uploaded" });
    }
    if (req.files.length > 1) {
      return res.status(400).json({ status: "NAK", message: "Only one file allowed per category. Upload one file at a time." });
    }
    const record = await propertyFileService.createFile(
      req.user.id,
      req.params.property_id,
      req.userData,
      req.files[0],
      req.body.property_file_category_id
    );
    res.json({ status: "AK", message: "File uploaded successfully", data: record });
  } catch (error) {
    console.error(error.message);
    respond(res, error);
  }
};

const getPropertyFilesByFileId = async (req, res) => {
  try {
    const { property_file_category_id } = req.query;
    const files = await propertyFileService.getFileById(req.user.id, req.params.fileId, { property_file_category_id });
    if (files.length === 0) {
      return res.status(404).json({ status: "NAK", message: "No files found" });
    }
    res.json({ status: "AK", data: files });
  } catch (error) {
    console.error(error.message);
    respond(res, error);
  }
};

const getPropertyFiles = async (req, res) => {
  try {
    const { property_file_category_id, mobile_number, property_id } = req.query;
    const files = await propertyFileService.getFiles(req.user.id, { property_file_category_id, mobile_number, property_id });
    if (files.length === 0) {
      return res.status(404).json({ status: "NAK", message: "No files found" });
    }
    res.json({ status: "AK", data: files });
  } catch (error) {
    console.error(error.message);
    respond(res, error);
  }
};

const updatePropertyFile = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ status: "NAK", message: "No file provided for update." });
    }
    const updated = await propertyFileService.updateFile(
      req.user.id,
      req.params.fileId,
      req.userData,
      req.files[0],
      req.body.property_file_category_id
    );
    res.json({ status: "AK", message: "File updated successfully", data: updated });
  } catch (error) {
    console.error(error.message);
    respond(res, error);
  }
};

const deletePropertyFile = async (req, res) => {
  try {
    const { mobile_number, property_file_category_id, property_id } = req.query;
    await propertyFileService.deleteFile(req.user.id, req.params.fileId, { mobile_number, property_file_category_id, property_id });
    res.json({ status: "AK", message: "File deleted successfully" });
  } catch (error) {
    console.error(error.message);
    respond(res, error);
  }
};

module.exports = {
  createPropertyFile,
  getPropertyFilesByFileId,
  getPropertyFiles,
  updatePropertyFile,
  deletePropertyFile,
};
