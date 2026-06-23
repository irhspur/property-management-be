const propertyService = require("../services/propertyService");

const respond = (res, error) =>
  res.status(error.statusCode || 500).json({ status: "NAK", message: error.message });

const createProperty = async (req, res) => {
  try {
    const property = await propertyService.createProperty(req.user.id, req.body);
    res.json({ status: "AK", message: "Property created successfully", data: property });
  } catch (error) {
    console.error(error.message);
    respond(res, error);
  }
};

const getPropertiesByUserID = async (req, res) => {
  try {
    const properties = await propertyService.getProperties(req.user.id);
    if (properties.length === 0) {
      return res.status(404).json({ status: "NAK", message: "No properties found for this user" });
    }
    res.json({ status: "AK", data: properties });
  } catch (error) {
    console.error(error.message);
    respond(res, error);
  }
};

const getPropertyById = async (req, res) => {
  try {
    const property = await propertyService.getById(req.params.id);
    res.json({ status: "AK", data: property });
  } catch (error) {
    console.error(error.message);
    respond(res, error);
  }
};

const getPropertyByMobileNumber = async (req, res) => {
  try {
    const properties = await propertyService.getByMobileNumber(req.body.mobile_number);
    if (properties.length === 0) {
      return res.status(404).json({ status: "NAK", message: "No properties found for this mobile number" });
    }
    res.json({ status: "AK", data: properties });
  } catch (error) {
    console.error(error.message);
    respond(res, error);
  }
};

const updateProperty = async (req, res) => {
  try {
    const property = await propertyService.updateProperty(req.params.id, req.user.id, req.body);
    res.json({ status: "AK", message: "Property updated successfully", data: property });
  } catch (error) {
    console.error(error.message);
    respond(res, error);
  }
};

const deleteProperty = async (req, res) => {
  try {
    const deleted = await propertyService.deleteProperty(req.params.id, req.user.id);
    res.json({ status: "AK", message: "Property deleted successfully", data: deleted });
  } catch (error) {
    console.error(error.message);
    respond(res, error);
  }
};

module.exports = {
  createProperty,
  getPropertiesByUserID,
  getPropertyById,
  getPropertyByMobileNumber,
  updateProperty,
  deleteProperty,
};
