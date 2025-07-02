const pool = require("../config/database");

const getAllProvinces = async (req, res) => {
  try {
    const provinces = await pool.query("SELECT * FROM province");
    res.json({ status: "AK", data: provinces.rows });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error fetching provinces" });
  }
};

const getProvinceById = async (req, res) => {
  try {
    const { id } = req.params;
    const province = await pool.query("SELECT * FROM province WHERE id = $1", [
      id,
    ]);
    if (province.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "Province not found" });
    }
    res.json({ status: "AK", data: province.rows[0] });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error fetching province" });
  }
};

const createProvince = async (req, res) => {
  try {
    const { name, country_id } = req.body;
    const newProvince = await pool.query(
      "INSERT INTO province (name, country_id) VALUES (INITCAP($1), $2) RETURNING *",
      [name, country_id]
    );
    res.json({ status: "AK", data: newProvince.rows[0] });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error creating province" });
  }
};

const updateProvince = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, country_id } = req.body;
    const province = await pool.query("SELECT * FROM province WHERE id = $1", [
      id,
    ]);
    if (province.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "Province not found" });
    }
    const updatedProvince = await pool.query(
      "UPDATE province SET name = INITCAP($1), country_id = $2 WHERE id = $3 RETURNING *",
      [name, country_id, id]
    );
    res.json({ status: "AK", data: updatedProvince.rows[0] });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error updating province" });
  }
};

const deleteProvince = async (req, res) => {
  try {
    const { id } = req.params;
    const province = await pool.query("SELECT * FROM province WHERE id = $1", [
      id,
    ]);
    if (province.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "Province not found" });
    }
    await pool.query("DELETE FROM province WHERE id = $1", [id]);
    res.json({ status: "AK", message: "Province deleted successfully" });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error deleting province" });
  }
};

const getProvincesByCountryId = async (req, res) => {
  try {
    const { country_id } = req.params;
    const provinces = await pool.query(
      "SELECT * FROM province WHERE country_id = $1",
      [country_id]
    );
    if (provinces.rows.length === 0) {
      return res.status(404).json({
        status: "NAK",
        message: "No provinces found for this country",
      });
    }
    res.json({ status: "AK", data: provinces.rows });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error fetching provinces" });
  }
};

const getProvincesByCountryName = async (req, res) => {
  try {
    const { country_name } = req.body;
    const provinces = await pool.query(
      "SELECT * FROM province WHERE country_id IN (SELECT id FROM country WHERE name = $1)",
      [country_name]
    );
    if (provinces.rows.length === 0) {
      return res.status(404).json({
        status: "NAK",
        message: "No provinces found for this country",
      });
    }
    res.json({ status: "AK", data: provinces.rows });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error fetching provinces" });
  }
};

module.exports = {
  getAllProvinces,
  getProvinceById,
  createProvince,
  updateProvince,
  deleteProvince,
  getProvincesByCountryId,
  getProvincesByCountryName,
};
