const tenantService = require("../services/tenantService");

const respond = (res, error) =>
  res.status(error.statusCode || 500).json({ status: "NAK", message: error.message });

const createTenant = async (req, res) => {
  try {
    const data = await tenantService.createTenant(req.user.id, req.body);
    res.json({ status: "AK", data, message: "Tenant created successfully" });
  } catch (error) {
    console.error(error.message);
    respond(res, error);
  }
};

const getTenantsByPropertyOwnerId = async (req, res) => {
  try {
    const tenants = await tenantService.getTenantsByOwner(req.user.id);
    if (tenants.length === 0) {
      return res.status(404).json({ status: "NAK", message: "No tenants found for this property owner" });
    }
    res.json({ status: "AK", data: tenants });
  } catch (error) {
    console.error(error.message);
    respond(res, error);
  }
};

const getTenant = async (req, res) => {
  try {
    const tenant = await tenantService.getTenant(req.user.id, req.params.tenantId);
    res.json({ status: "AK", data: tenant });
  } catch (error) {
    console.error(error.message);
    respond(res, error);
  }
};

const updateTenantDetails = async (req, res) => {
  try {
    const details = await tenantService.updateDetails(req.user.id, req.params.tenantId, req.body);
    res.json({ status: "AK", data: details, message: "Tenant details updated successfully" });
  } catch (error) {
    console.error(error.message);
    respond(res, error);
  }
};

const updateTenantAddress = async (req, res) => {
  try {
    const address = await tenantService.updateAddress(req.user.id, req.params.tenantId, req.body);
    res.json({ status: "AK", data: address, message: "Address updated successfully" });
  } catch (error) {
    console.error(error.message);
    respond(res, error);
  }
};

const uploadFilesForTenant = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ status: "NAK", message: "No files uploaded" });
    }
    if (req.files.length > 1) {
      return res.status(400).json({ status: "NAK", message: "Only one file allowed per category. Upload one file at a time." });
    }
    const doc = await tenantService.uploadFile(
      req.user.id,
      req.params.tenantId,
      req.files[0],
      req.body.file_category_id
    );
    res.json({ status: "AK", data: doc, message: "Document uploaded successfully" });
  } catch (error) {
    console.error(error.message);
    respond(res, error);
  }
};

const getTenantFiles = async (req, res) => {
  try {
    const files = await tenantService.getFiles(req.user.id, req.params.tenantId);
    if (files.length === 0) {
      return res.status(404).json({ status: "NAK", message: "No files found" });
    }
    res.json({ status: "AK", data: files });
  } catch (error) {
    console.error(error.message);
    respond(res, error);
  }
};

const getFileById = async (req, res) => {
  try {
    const file = await tenantService.getFile(req.user.id, req.params.tenantId, req.params.fileId);
    res.json({ status: "AK", data: file });
  } catch (error) {
    console.error(error.message);
    respond(res, error);
  }
};

const updateTenantFile = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ status: "NAK", message: "No file provided for update." });
    }
    const updated = await tenantService.updateFile(
      req.user.id,
      req.params.tenantId,
      req.params.fileId,
      req.files[0],
      req.body.file_category_id
    );
    res.json({ status: "AK", data: updated, message: "File updated successfully" });
  } catch (error) {
    console.error(error.message);
    respond(res, error);
  }
};

const deleteTenantFile = async (req, res) => {
  try {
    await tenantService.deleteFile(req.user.id, req.params.tenantId, req.params.fileId);
    res.json({ status: "AK", message: "File deleted successfully" });
  } catch (error) {
    console.error(error.message);
    respond(res, error);
  }
};

const deleteTenant = async (req, res) => {
  try {
    await tenantService.deleteTenant(req.user.id, req.params.tenantId);
    res.json({ status: "AK", message: "Tenant records and files deleted successfully" });
  } catch (error) {
    console.error(error.message);
    respond(res, error);
  }
};

module.exports = {
  createTenant,
  getTenantsByPropertyOwnerId,
  getTenant,
  updateTenantDetails,
  updateTenantAddress,
  uploadFilesForTenant,
  getTenantFiles,
  getFileById,
  updateTenantFile,
  deleteTenantFile,
  deleteTenant,
};
