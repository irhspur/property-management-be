const pool = require("../config/database");

const createPropertyType = async (req, res) => {
  try {
    const { name } = req.body;
    const existingPropertyType = await pool.query(
      "SELECT * FROM property_types WHERE lower(name) = lower($1)",
      [name]
    );
    if (existingPropertyType.rows.length > 0) {
      return res
        .status(400)
        .json({ status: "NAK", message: "Property type already exists" });
    }
    const newPropertyType = await pool.query(
      "INSERT INTO property_types (name) VALUES (INITCAP($1)) RETURNING *",
      [name]
    );
    res.json({
      status: "AK",
      message: "Property type created successfully",
      data: newPropertyType.rows[0],
    });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error creating property type" });
  }
};

const getPropertyTypes = async (req, res) => {
  try {
    const propertyTypes = await pool.query("SELECT * FROM property_types");
    res.json({ status: "AK", data: propertyTypes.rows });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error fetching property types" });
  }
};
const getPropertyTypeById = async (req, res) => {
  try {
    const { id } = req.params;
    const propertyType = await pool.query(
      "SELECT * FROM property_types WHERE id = $1",
      [id]
    );
    if (propertyType.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "Property type not found" });
    }
    res.json({ status: "AK", data: propertyType.rows[0] });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error fetching property type" });
  }
};
const updatePropertyType = async (req, res) => {
  try {
    const { id } = req.query;
    const { name } = req.body;
    const propertyType = await pool.query(
      "SELECT * FROM property_types WHERE id = $1",
      [id]
    );
    if (propertyType.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "Property type not found" });
    }
    const existingPropertyType = await pool.query(
      "SELECT * FROM property_types WHERE lower(name) = lower($1) AND id != $2",
      [name, id]
    );
    if (existingPropertyType.rows.length > 0) {
      return res
        .status(400)
        .json({ status: "NAK", message: "Property type already exists" });
    }
    const updatedPropertyType = await pool.query(
      "UPDATE property_types SET name = INITCAP($1), updated_at = NOW() WHERE id = $2 RETURNING *",
      [name, id]
    );
    res.json({ status: "AK", data: updatedPropertyType.rows[0] });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error updating property type" });
  }
};

const deletePropertyType = async (req, res) => {
  try {
    const { id } = req.params;
    const propertyType = await pool.query(
      "SELECT * FROM property_types WHERE id = $1",
      [id]
    );
    if (propertyType.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "Property type not found" });
    }
    await pool.query("DELETE FROM property_types WHERE id = $1", [id]);
    res.json({ status: "AK", message: "Property type deleted successfully" });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error deleting property type" });
  }
};

module.exports = {
  createPropertyType,
  getPropertyTypes,
  getPropertyTypeById,
  updatePropertyType,
  deletePropertyType,
};
