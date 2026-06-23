const userService = require("../services/userService");

const respond = (res, error) =>
  res.status(error.statusCode || 500).json({ status: "NAK", message: error.message });

const createUser = async (req, res) => {
  try {
    const data = await userService.upsertProfile(req.user.id, req.body);
    res.json({ status: "AK", data, message: "User profile saved successfully" });
  } catch (error) {
    console.error(error.message);
    respond(res, error);
  }
};

const getUserByUserId = async (req, res) => {
  try {
    const user = await userService.getUser(req.user.id);
    res.json({ status: "AK", data: user });
  } catch (error) {
    console.error(error.message);
    respond(res, error);
  }
};

const getUserProfile = async (req, res) => {
  try {
    const profile = await userService.getUserProfile(req.user.id);
    res.json({ status: "AK", data: profile });
  } catch (error) {
    console.error(error.message);
    respond(res, error);
  }
};

const getAddress = async (req, res) => {
  try {
    const address = await userService.getAddress(req.user.id);
    res.json({ status: "AK", data: address });
  } catch (error) {
    console.error(error.message);
    respond(res, error);
  }
};

const updateUserDetails = async (req, res) => {
  try {
    const details = await userService.updateDetails(req.user.id, req.body);
    res.json({ status: "AK", data: details });
  } catch (error) {
    console.error(error.message);
    respond(res, error);
  }
};

const updateAddress = async (req, res) => {
  try {
    const address = await userService.updateAddress(req.user.id, req.body);
    res.json({ status: "AK", data: address, message: "Address updated successfully" });
  } catch (error) {
    console.error(error.message);
    respond(res, error);
  }
};

const deleteUser = async (req, res) => {
  try {
    await userService.deleteUser(req.user.id);
    res.json({ status: "AK", message: "User deleted successfully" });
  } catch (error) {
    console.error(error.message);
    respond(res, error);
  }
};

const getUserDetailsByMobileNumber = async (req, res) => {
  try {
    const details = await userService.getByMobileNumber(req.query.mobile_number);
    res.json({ status: "AK", data: details });
  } catch (error) {
    console.error(error.message);
    respond(res, error);
  }
};

module.exports = {
  createUser,
  getUserByUserId,
  getUserProfile,
  getAddress,
  updateUserDetails,
  updateAddress,
  deleteUser,
  getUserDetailsByMobileNumber,
};
