const pool = require("../config/database");
const path = require("path");
const fs = require("fs");

const createProperty = async (req, res) => {
  try {
    const {
      country_id,
      province_id,
      district_id,
      municipality_id,
      ward_number,
      street_name,
      house_number,
      property_type_id,
      property_name,
      property_description,
      property_value,
    } = req.body;

    const userId = req.user.id;
    // Check if the user already has a property with the same name
    const existingProperty = await pool.query(
      `SELECT * FROM properties WHERE user_id = $1 AND property_name = INITCAP($2)`,
      [userId, property_name]
    );
    if (existingProperty.rows.length > 0) {
      return res.status(400).json({
        status: "NAK",
        message: "Property with this name already exists for this user",
      });
    }
    const newProperty = await pool.query(
      `INSERT INTO properties (user_id, country_id, province_id, district_id, municipality_id, ward_number, street_name, house_number, property_type_id, property_name, property_description, property_value)
             VALUES ($1, $2, $3, $4, $5, $6, INITCAP($7), $8, $9, INITCAP($10), $11, $12) RETURNING *`,
      [
        userId,
        country_id,
        province_id,
        district_id,
        municipality_id,
        ward_number,
        street_name,
        house_number,
        property_type_id,
        property_name,
        property_description,
        property_value,
      ]
    );
    res.json({
      status: "AK",
      message: "Property created successfully",
      data: newProperty.rows[0],
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ status: "NAK", message: "Error creating property" });
  }
};

const getPropertiesByUserID = async (req, res) => {
  try {
    const userId = req.user.id;
    const properties = await pool.query(
      `SELECT
      p.property_id,
      p.user_id,
      p.property_type_id,
      pt.name AS property_type,
      p.country_id,
      c.name AS country,
      p.province_id,
      pr.name AS province,
      p.district_id,
      d.name AS district,
      p.municipality_id,
      m.name AS municipality,
      p.ward_number,
      p.street_name,
      p.house_number,
      p.property_name,
      p.property_description,
      p.property_value,
      p.is_vacant,
      p.created_at,
      p.updated_at
      FROM properties p
      JOIN property_types pt ON p.property_type_id = pt.id
      JOIN country c ON p.country_id = c.id
      JOIN province pr ON p.province_id = pr.id
      JOIN district d ON p.district_id = d.id
      JOIN municipality m ON p.municipality_id = m.id
      WHERE p.user_id = $1`,
      [userId]
    );
    if (properties.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "No properties found for this user" });
    }
    res.json({
      status: "AK",
      data: properties.rows,
    });
  } catch (error) {
    console.error(error.message);
    res
      .status(500)
      .json({ status: "NAK", message: "Error fetching properties" });
  }
};

const getPropertyById = async (req, res) => {
  try {
    const { id } = req.params;
    const property = await pool.query(
      `SELECT
      p.property_id,
      p.user_id,
      p.property_type_id,
      pt.name AS property_type,
      p.country_id,
      c.name AS country,
      p.province_id,
      pr.name AS province,
      p.district_id,
      d.name AS district,
      p.municipality_id,
      m.name AS municipality,
      p.ward_number,
      p.street_name,
      p.house_number,
      p.property_name,
      p.property_description,
      p.property_value,
      p.is_vacant,
      p.created_at,
      p.updated_at
      FROM properties p
      JOIN property_types pt ON p.property_type_id = pt.id
      JOIN country c ON p.country_id = c.id
      JOIN province pr ON p.province_id = pr.id
      JOIN district d ON p.district_id = d.id
      JOIN municipality m ON p.municipality_id = m.id
      WHERE p.property_id = $1`,
      [id]
    );
    if (property.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "Property not found" });
    }
    res.json({
      status: "AK",
      data: property.rows[0],
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ status: "NAK", message: "Error fetching property" });
  }
};

const getPropertyByMobileNumber = async (req, res) => {
  try {
    const { mobile_number } = req.body;
    const property = await pool.query(
      `SELECT p.*, ud.mobile_number, ud.first_name, ud.last_name FROM properties p
             JOIN user_details ud ON p.user_id = ud.user_id
             WHERE ud.mobile_number = $1`,
      [mobile_number]
    );
    if (property.rows.length === 0) {
      return res.status(404).json({
        status: "NAK",
        message: "No properties found for this mobile number",
      });
    }
    res.json({
      status: "AK",
      data: property.rows,
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({
      status: "NAK",
      message: "Error fetching properties by mobile number",
    });
  }
};
const updateProperty = async (req, res) => {
  try {
    const userId = req.user.id;
    const { id } = req.params;
    const {
      country_id,
      province_id,
      district_id,
      municipality_id,
      ward_number,
      street_name,
      house_number,
      property_type_id,
      property_name,
      property_description,
      property_value,
      is_vacant,
    } = req.body;

    const updatedProperty = await pool.query(
      `UPDATE properties
             SET country_id = $1, province_id = $2, district_id = $3, municipality_id = $4, ward_number = $5, street_name = INITCAP($6), house_number = $7, property_type_id = $8, property_name = INITCAP($9), property_description = $10, property_value = $11, updated_at = NOW(), is_vacant = $12
             WHERE property_id = $13 AND user_id = $14 RETURNING *`,
      [
        country_id,
        province_id,
        district_id,
        municipality_id,
        ward_number,
        street_name,
        house_number,
        property_type_id,
        property_name,
        property_description,
        property_value,
        is_vacant,
        id,
        userId,
      ]
    );
    if (updatedProperty.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "Property not found" });
    }
    res.json({
      status: "AK",
      message: "Property updated successfully",
      data: updatedProperty.rows[0],
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ status: "NAK", message: "Error updating property" });
  }
};
const deleteProperty = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    // Check if property is vacant before deletion
    const propertyCheck = await pool.query(
      `SELECT is_vacant FROM properties WHERE property_id = $1 AND user_id = $2`,
      [id, userId]
    );
    if (propertyCheck.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "Property not found or unauthorized" });
    }
    if (!propertyCheck.rows[0].is_vacant) {
      return res
        .status(400)
        .json({ status: "NAK", message: "Property is not vacant" });
    }
    const user = await pool.query(
      `SELECT u.user_id, ud.mobile_number
         FROM users u
         JOIN user_details ud ON u.user_id = ud.user_id
         WHERE u.user_id = $1`,
      [userId]
    );
    if (user.rows.length === 0) {
      return res.status(404).json({ status: "NAK", message: "User not found" });
    }
    const mobileNumber = user.rows[0].mobile_number;

    const propertyName = await pool.query(
      `SELECT property_name FROM properties WHERE property_id = $1`,
      [id]
    );

    if (propertyName.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "Property not found" });
    }
    const propertyNameValue = propertyName.rows[0].property_name;

    const propertyDir = `uploads/${mobileNumber}/${propertyNameValue}`;

    try {
      await pool.query("BEGIN");
      const deletedProperty = await pool.query(
        `DELETE FROM properties WHERE property_id = $1 AND user_id = $2 RETURNING *`,
        [id, userId]
      );
      if (deletedProperty.rows.length === 0) {
        return res.status(404).json({
          status: "NAK",
          message: "Property not found or unauthorized",
        });
      }
      if (fs.existsSync(propertyDir)) {
        fs.rmdirSync(propertyDir, { recursive: true, force: true });
      }
      await pool.query("COMMIT");
      res.json({
        status: "AK",
        message: "Property deleted successfully",
        data: deletedProperty.rows[0],
      });
    } catch (transactionError) {
      await pool.query("ROLLBACK");
      console.error(transactionError.message);
      return res
        .status(500)
        .json({ status: "NAK", message: "Error deleting property" });
    }
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ status: "NAK", message: "Error deleting property" });
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
