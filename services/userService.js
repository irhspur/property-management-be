const fs = require("fs");
const userModel = require("../models/user");
const userDetailsModel = require("../models/userDetails");
const addressModel = require("../models/address");
const { withTransaction } = require("../utils/transaction");
const { pickFields, UserDetailsSchema, AddressSchema } = require("../schemas");

const err = (message, statusCode = 500) => Object.assign(new Error(message), { statusCode });

const upsertProfile = async (userId, body) => {
  const d = pickFields(body, UserDetailsSchema, { birth_country_id: "country_id" });
  const a = pickFields(body, AddressSchema, { address_country_id: "country_id" });

  return withTransaction(async (client) => {
    const details = await userDetailsModel.upsert(userId, d, client);
    const address = await addressModel.upsert(userId, a, client);
    return { userDetails: details, address };
  });
};

const getUser = async (userId) => {
  const user = await userModel.findSummaryById(userId);
  if (!user) throw err("No user found.", 404);
  return user;
};

const getUserProfile = async (userId) => {
  const profile = await userModel.findProfileById(userId);
  if (!profile) throw err("No user found.", 404);
  return profile;
};

const getAddress = async (userId) => {
  const address = await addressModel.findWithJoinsByUserId(userId);
  if (!address) throw err("No address found.", 404);
  return address;
};

const updateDetails = async (userId, body) => {
  const d = pickFields(body, UserDetailsSchema);
  const existing = await userDetailsModel.findByUserId(userId);
  if (!existing) throw err("User details not found", 404);
  if (existing.mobile_number !== d.mobile_number) throw err("You are not allowed to update mobile number", 400);
  return userDetailsModel.update(userId, d);
};

const updateAddress = async (userId, body) => {
  const a = pickFields(body, AddressSchema);
  const existing = await addressModel.findByUserId(userId);
  if (!existing) throw err("Address not found", 404);
  return addressModel.update(userId, a);
};

const deleteUser = async (userId) => {
  const row = await userModel.findMobileById(userId);
  if (!row) throw err("User not found", 404);

  await userModel.deleteById(userId);

  const userDir = `uploads/${row.mobile_number}`;
  if (fs.existsSync(userDir)) fs.rmdirSync(userDir, { recursive: true, force: true });
};

const getByMobileNumber = async (mobile) => {
  const details = await userDetailsModel.findByMobileNumber(mobile);
  if (!details) throw err("User details not found", 404);
  return details;
};

module.exports = { upsertProfile, getUser, getUserProfile, getAddress, updateDetails, updateAddress, deleteUser, getByMobileNumber };
