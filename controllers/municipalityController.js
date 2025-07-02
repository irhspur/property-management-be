const pool = require("../config/database");

const getMunicipalities = async (req, res) => {
  try {
    const municipalities = await pool.query("SELECT * FROM municipality");
    res.json({ status: "AK", data: municipalities.rows });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error fetching municipalities" });
  }
};

const getMunicipalityById = async (req, res) => {
  try {
    const { id } = req.params;
    const municipality = await pool.query(
      "SELECT * FROM municipality WHERE id = $1",
      [id]
    );
    if (municipality.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "Municipality not found" });
    }
    res.json({ status: "AK", data: municipality.rows[0] });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error fetching municipality" });
  }
};

const createMunicipality = async (req, res) => {
  try {
    const { name, district_id } = req.body;
    const municipality = await pool.query(
      "SELECT * FROM municipality WHERE name = $1 AND district_id = $2",
      [name, district_id]
    );
    if (municipality.rows.length > 0) {
      return res
        .status(400)
        .json({ status: "NAK", message: "Municipality already exists" });
    }
    const newMunicipality = await pool.query(
      "INSERT INTO municipality (name, district_id) VALUES (INITCAP($1), $2) RETURNING *",
      [name, district_id]
    );
    res.json({ status: "AK", data: newMunicipality.rows[0] });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error creating municipality" });
  }
};

const updateMunicipality = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, district_id } = req.body;
    const municipality = await pool.query(
      "SELECT * FROM municipality WHERE id = $1",
      [id]
    );
    if (municipality.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "Municipality not found" });
    }
    const updatedMunicipality = await pool.query(
      "UPDATE municipality SET name = INITCAP($1), district_id = $2 WHERE id = $3 RETURNING *",
      [name, district_id, id]
    );
    res.json({ status: "AK", data: updatedMunicipality.rows[0] });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error updating municipality" });
  }
};

const deleteMunicipality = async (req, res) => {
  try {
    const { id } = req.params;
    const municipality = await pool.query(
      "SELECT * FROM municipality WHERE id = $1",
      [id]
    );
    if (municipality.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "Municipality not found" });
    }
    await pool.query("DELETE FROM municipality WHERE id = $1", [id]);
    res.json({ status: "AK", message: "Municipality deleted successfully" });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error deleting municipality" });
  }
};

const getMunicipalitiesByDistrictId = async (req, res) => {
  try {
    const { district_id } = req.params;
    const municipalities = await pool.query(
      "SELECT * FROM municipality WHERE district_id = $1",
      [district_id]
    );
    if (municipalities.rows.length === 0) {
      return res.status(404).json({
        status: "NAK",
        message: "No municipalities found for this district",
      });
    }
    res.json({ status: "AK", data: municipalities.rows });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error fetching municipalities" });
  }
};

const getMunicipalitiesByDistrictName = async (req, res) => {
  try {
    const { district_name } = req.params;
    const municipalities = await pool.query(
      "SELECT * FROM municipality WHERE district_id IN (SELECT id FROM district WHERE name = $1)",
      [district_name]
    );
    if (municipalities.rows.length === 0) {
      return res.status(404).json({
        status: "NAK",
        message: "No municipalities found for this district",
      });
    }
    res.json({ status: "AK", data: municipalities.rows });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error fetching municipalities" });
  }
};

module.exports = {
  getMunicipalities,
  getMunicipalityById,
  createMunicipality,
  updateMunicipality,
  deleteMunicipality,
  getMunicipalitiesByDistrictId,
  getMunicipalitiesByDistrictName,
};
