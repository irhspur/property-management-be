const fs = require("fs");
const path = require("path");
const userModel = require("../models/user");
const userDetailsModel = require("../models/userDetails");
const addressModel = require("../models/address");
const ownerTenantModel = require("../models/ownerTenant");
const fileModel = require("../models/file");
const pool = require("../config/database");
const { withTransaction } = require("../utils/transaction");
const { pickFields, UserDetailsSchema, AddressSchema } = require("../schemas");

const err = (message, statusCode = 500) => Object.assign(new Error(message), { statusCode });

const assertLinked = async (ownerId, tenantId) => {
  const linked = await ownerTenantModel.findLink(ownerId, tenantId);
  if (!linked) throw err("You are not allowed to perform this action on this tenant", 403);
};

const createTenant = async (ownerId, body) => {
  const { email, password, user_type_id } = body;
  const d = pickFields(body, UserDetailsSchema);
  const a = pickFields(body, AddressSchema, { address_country_id: "country_id" });

  return withTransaction(async (client) => {
    const existing = await userModel.findByEmail(email);
    if (existing) throw err("User already exists", 400);

    const mobileExists = await userDetailsModel.findByMobileNumber(d.mobile_number, client);
    if (mobileExists) throw err("Mobile Number already exists", 400);

    const tenant = await userModel.create({ email, password, user_type_id }, client);
    const tenantId = tenant.user_id;

    const details = await userDetailsModel.insert(tenantId, d, client);
    const address = await addressModel.insert(tenantId, a, client);

    await ownerTenantModel.assertUserIsTenant(tenantId, client);
    await ownerTenantModel.link(ownerId, tenantId, client);

    return { tenant, tenantDetails: details, tenantAddress: address };
  });
};

const getTenantsByOwner = async (ownerId) => {
  return ownerTenantModel.findTenantsByOwner(ownerId);
};

const getTenant = async (ownerId, tenantId) => {
  const tenant = await ownerTenantModel.findTenantByOwner(ownerId, tenantId);
  if (!tenant) throw err("No tenant found.", 404);
  return tenant;
};

const updateDetails = async (ownerId, tenantId, body) => {
  await assertLinked(ownerId, tenantId);
  const d = pickFields(body, UserDetailsSchema);
  const existing = await userDetailsModel.findByUserId(tenantId);
  if (!existing) throw err("Tenant details not found", 404);
  if (existing.mobile_number !== d.mobile_number) throw err("You are not allowed to update mobile number", 400);
  return userDetailsModel.update(tenantId, d);
};

const updateAddress = async (ownerId, tenantId, body) => {
  await assertLinked(ownerId, tenantId);
  const a = pickFields(body, AddressSchema);
  const existing = await addressModel.findByUserId(tenantId);
  if (!existing) throw err("Address not found", 404);
  return addressModel.update(tenantId, a);
};

const uploadFile = async (ownerId, tenantId, file, fileCategoryId) => {
  await assertLinked(ownerId, tenantId);
  if (!file) throw err("No file uploaded", 400);
  if (!fileCategoryId) throw err("File category ID is required", 400);

  const duplicate = await fileModel.findByUserAndCategory(tenantId, fileCategoryId);
  if (duplicate) throw err("File already exists for this category. Please Update or replace it.", 400);

  return withTransaction(async (client) => {
    const { rows: catRows } = await client.query("SELECT name FROM file_categories WHERE id = $1", [fileCategoryId]);
    const tenantInfo = await userDetailsModel.findFirstNameAndMobile(tenantId, client);

    const categoryName = catRows[0]?.name || "uncategorized";
    const tenantFirstName = tenantInfo?.first_name || "tenant";
    const tenantMobile = tenantInfo?.mobile_number || "unknown";
    const ext = path.extname(file.originalname);
    const newFilename = `${tenantFirstName}_${categoryName}_${Date.now()}${ext}`;
    const uploadDir = path.join("uploads", tenantMobile);
    const newPath = path.join(uploadDir, newFilename);

    const record = await fileModel.create({
      user_id: tenantId,
      file_category_id: fileCategoryId,
      original_name: file.originalname,
      mimetype: file.mimetype,
      file_size: file.size,
      file_name: newFilename,
      file_path: newPath,
    }, client);

    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    fs.writeFileSync(newPath, file.buffer);
    return record;
  });
};

const getFiles = async (ownerId, tenantId) => {
  await assertLinked(ownerId, tenantId);
  return fileModel.findTenantFiles(tenantId);
};

const getFile = async (ownerId, tenantId, fileId) => {
  await assertLinked(ownerId, tenantId);
  const file = await fileModel.findTenantFileById(fileId, tenantId);
  if (!file) throw err("File not found", 404);
  return file;
};

const updateFile = async (ownerId, tenantId, fileId, file, fileCategoryId) => {
  await assertLinked(ownerId, tenantId);
  if (!file) throw err("No file provided for update.", 400);

  const existing = await fileModel.findTenantFileByIdWithFilters(fileId, tenantId, { file_category_id: fileCategoryId });
  if (!existing) throw err("Existing file not found", 404);

  return withTransaction(async (client) => {
    const { rows: catRows } = await client.query("SELECT name FROM file_categories WHERE id = $1", [fileCategoryId]);
    const tenantInfo = await userDetailsModel.findFirstNameAndMobile(tenantId, client);

    const categoryName = catRows[0]?.name || "uncategorized";
    const tenantFirstName = tenantInfo?.first_name || "tenant";
    const tenantMobile = tenantInfo?.mobile_number || "unknown";
    const ext = path.extname(file.originalname);
    const newFilename = `${tenantFirstName}_${categoryName}_${Date.now()}${ext}`;
    const uploadDir = path.join("uploads", tenantMobile);
    const newPath = path.join(uploadDir, newFilename);

    const updated = await fileModel.update(fileId, {
      original_name: file.originalname,
      mimetype: file.mimetype,
      file_size: file.size,
      file_name: newFilename,
      file_path: newPath,
    }, client);

    if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
    if (fs.existsSync(existing.file_path)) fs.unlinkSync(existing.file_path);
    fs.writeFileSync(newPath, file.buffer);
    return updated;
  });
};

const deleteFile = async (ownerId, tenantId, fileId) => {
  await assertLinked(ownerId, tenantId);

  const existing = await fileModel.findTenantFileById(fileId, tenantId);
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

const deleteTenant = async (ownerId, tenantId) => {
  await assertLinked(ownerId, tenantId);

  const row = await userModel.findMobileById(tenantId);
  if (!row) throw err("Tenant not found", 404);

  await userModel.deleteById(tenantId);

  const tenantDir = `uploads/${row.mobile_number}`;
  if (fs.existsSync(tenantDir)) fs.rmSync(tenantDir, { recursive: true, force: true });
};

module.exports = {
  createTenant,
  getTenantsByOwner,
  getTenant,
  updateDetails,
  updateAddress,
  uploadFile,
  getFiles,
  getFile,
  updateFile,
  deleteFile,
  deleteTenant,
};
