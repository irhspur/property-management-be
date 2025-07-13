const pool = require("../config/database");

const getDistrictsByProvinceId = async (req, res) => {
  try {
    const { province_id } = req.query;
    const districts = await pool.query(
      "SELECT * FROM district WHERE province_id = $1",
      [province_id]
    );
    if (districts.rows.length === 0) {
      return res.status(404).json({
        status: "NAK",
        message: "No districts found for this province",
      });
    }
    res.json({ status: "AK", data: districts.rows });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error fetching districts" });
  }
};

const getAllDistricts = async (req, res) => {
  try {
    const districts = await pool.query("SELECT * FROM district");
    res.json({ status: "AK", data: districts.rows });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error fetching districts" });
  }
};

const getDistrictById = async (req, res) => {
  try {
    const { id } = req.params;
    const district = await pool.query("SELECT * FROM district WHERE id = $1", [
      id,
    ]);
    if (district.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "District not found" });
    }
    res.json({ status: "AK", data: district.rows[0] });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error fetching district" });
  }
};

const createDistrict = async (req, res) => {
  try {
    const { name, province_id } = req.body;
    const district = await pool.query(
      "SELECT * FROM district WHERE lower(name) = lower($1) AND province_id = $2",
      [name, province_id]
    );
    if (district.rows.length > 0) {
      return res
        .status(400)
        .json({ status: "NAK", message: "District already exists" });
    }
    const newDistrict = await pool.query(
      "INSERT INTO district (name, province_id) VALUES (INITCAP($1), $2) RETURNING *",
      [name, province_id]
    );
    res.json({ status: "AK", data: newDistrict.rows[0] });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error creating district" });
  }
};

const updateDistrict = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, province_id } = req.body;
    const district = await pool.query("SELECT * FROM district WHERE id = $1", [
      id,
    ]);
    if (district.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "District not found" });
    }
    const existingDistrict = await pool.query(
      "SELECT * FROM district WHERE lower(name) = lower($1) AND province_id = $2 AND id != $3",
      [name, province_id, id]
    );
    if (existingDistrict.rows.length > 0) {
      return res
        .status(400)
        .json({ status: "NAK", message: "District already exists" });
    }
    const updatedDistrict = await pool.query(
      "UPDATE district SET name = INITCAP($1), province_id = $2 WHERE id = $3 RETURNING *",
      [name, province_id, id]
    );
    res.json({ status: "AK", data: updatedDistrict.rows[0] });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error updating district" });
  }
};

const deleteDistrict = async (req, res) => {
  try {
    const { id } = req.params;
    const district = await pool.query("SELECT * FROM district WHERE id = $1", [
      id,
    ]);
    if (district.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "District not found" });
    }
    await pool.query("DELETE FROM district WHERE id = $1", [id]);
    res.json({ status: "AK", message: "District deleted successfully" });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error deleting district" });
  }
};

const getDistrictsByProvinceName = async (req, res) => {
  try {
    const { province_name } = req.params;
    const districts = await pool.query(
      "SELECT * FROM district WHERE province_id IN (SELECT id FROM province WHERE name = $1)",
      [province_name]
    );
    if (districts.rows.length === 0) {
      return res.status(404).json({
        status: "NAK",
        message: "No districts found for this province",
      });
    }
    res.json({ status: "AK", data: districts.rows });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error fetching districts" });
  }
};

module.exports = {
  getAllDistricts,
  getDistrictById,
  createDistrict,
  updateDistrict,
  deleteDistrict,
  getDistrictsByProvinceId,
  getDistrictsByProvinceName,
};
