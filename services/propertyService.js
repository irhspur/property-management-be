const fs = require("fs");
const propertyModel = require("../models/property");
const userModel = require("../models/user");
const { withTransaction } = require("../utils/transaction");
const { pickFields, PropertySchema } = require("../schemas");

const err = (message, statusCode = 500) => Object.assign(new Error(message), { statusCode });

const createProperty = async (userId, body) => {
  const f = pickFields(body, PropertySchema);
  const exists = await propertyModel.findByUserAndName(userId, f.property_name);
  if (exists) throw err("Property with this name already exists for this user", 400);
  return propertyModel.create(userId, f);
};

const getProperties = async (userId) => {
  return propertyModel.findByUserId(userId);
};

const getById = async (id) => {
  const property = await propertyModel.findById(id);
  if (!property) throw err("Property not found", 404);
  return property;
};

const getByMobileNumber = async (mobile) => {
  return propertyModel.findByMobileNumber(mobile);
};

const updateProperty = async (id, userId, body) => {
  const f = pickFields(body, PropertySchema);
  const updated = await propertyModel.update(id, userId, f);
  if (!updated) throw err("Property not found", 404);
  return updated;
};

const deleteProperty = async (id, userId) => {
  const vacancy = await propertyModel.checkVacancy(id, userId);
  if (!vacancy) throw err("Property not found or unauthorized", 404);
  if (!vacancy.is_vacant) throw err("Property is not vacant", 400);

  const user = await userModel.findMobileById(userId);
  if (!user) throw err("User not found", 404);

  const propertyName = await propertyModel.findNameById(id);
  if (!propertyName) throw err("Property not found", 404);

  const propertyDir = `uploads/${user.mobile_number}/${propertyName}`;

  return withTransaction(async (client) => {
    const deleted = await propertyModel.deleteById(id, userId, client);
    if (!deleted) throw err("Property not found or unauthorized", 404);
    if (fs.existsSync(propertyDir)) fs.rmdirSync(propertyDir, { recursive: true, force: true });
    return deleted;
  });
};

module.exports = { createProperty, getProperties, getById, getByMobileNumber, updateProperty, deleteProperty };
