const pool = require("../config/database");

const getAllCountries = async (req, res) => {
  try {
    const countries = await pool.query("SELECT * FROM country");
    res.json({ status: "AK", data: countries.rows });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error fetching countries" });
  }
};

const getCountryById = async (req, res) => {
  try {
    const { id } = req.params;
    const country = await pool.query("SELECT * FROM country WHERE id = $1", [
      id,
    ]);
    if (country.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "Country not found" });
    }
    res.json({ status: "AK", data: country.rows[0] });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error fetching country" });
  }
};

const createCountry = async (req, res) => {
  try {
    const { iso, name, nicename, iso3, numcode, phonecode } = req.body;
    const country = await pool.query(
      `SELECT * FROM country 
      WHERE 
      lower(iso) = lower($1) OR 
      lower(name) = lower($2) OR 
      lower(nicename) = lower($3) OR 
      lower(iso3) = lower($4) OR 
      numcode = $5 OR 
      phonecode = $6`,
      [iso, name, nicename, iso3, numcode, phonecode]
    );
    if (country.rows.length > 0) {
      return res.status(400).json({
        status: "NAK",
        message:
          "Duplicate iso/name/nicename/iso3/numcode/phonecode. Country already exists",
      });
    }
    const newCountry = await pool.query(
      `INSERT INTO country (
      iso, name, nicename, iso3, numcode, phonecode
      ) VALUES (
       UPPER($1), UPPER($2), (INITCAP($3)), UPPER($4), $5, $6) RETURNING *`,
      [iso, name, nicename, iso3, numcode, phonecode]
    );
    res.json({
      status: "AK",
      message: "Country created successfully",
      data: newCountry.rows[0],
    });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error creating country" });
  }
};

const updateCountry = async (req, res) => {
  try {
    const { id } = req.params;
    const { iso, name, nicename, iso3, numcode, phonecode } = req.body;
    const country = await pool.query(
      "SELECT * FROM country WHERE lower(iso) = lower($1) OR lower(name) = lower($2) OR lower(nicename) = lower($3) OR lower(iso3) = lower($4) OR numcode = $5 OR phonecode = $6 OR id = $7",
      [iso, name, nicename, iso3, numcode, phonecode, id]
    );
    if (country.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "Country not found" });
    }
    const updatedCountry = await pool.query(
      "UPDATE country SET iso = UPPER($1), name = UPPER($2), nicename = (INITCAP($3)), iso3 = UPPER($4), numcode = $5, phonecode = $6, updated_at = NOW() WHERE id = $7 RETURNING *",
      [iso, name, nicename, iso3, numcode, phonecode, id]
    );
    res.json({ status: "AK", data: updatedCountry.rows[0] });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error updating country" });
  }
};

const deleteCountry = async (req, res) => {
  try {
    const { id } = req.params;
    const country = await pool.query("SELECT * FROM country WHERE id = $1", [
      id,
    ]);
    if (country.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "Country not found" });
    }
    await pool.query("DELETE FROM country WHERE id = $1", [id]);
    res.json({ status: "AK", message: "Country deleted successfully" });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error deleting country" });
  }
};

module.exports = {
  getAllCountries,
  getCountryById,
  createCountry,
  updateCountry,
  deleteCountry,
};
