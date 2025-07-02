const pool = require("../config/database");

const getAllCountries = async (req, res) => {
  try {
    const countries = await pool.query("SELECT * FROM country");
    res.json({ status: "AK", data: countries.rows });
  } catch (error) {
    console.error(err.message);
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
    console.error(err.message);
    res.json({ status: "NAK", message: "Error fetching country" });
  }
};

const createCountry = async (req, res) => {
  try {
    const { code, iso, name, nicename, iso3, numcode, phonecode } = req.body;
    const country = await pool.query(
      `SELECT * FROM country 
      WHERE 
      lower(code) = lower($1) OR 
      lower(iso) = lower($2) OR 
      lower(name) = lower($3) OR 
      lower(nicename) = lower($4) OR 
      lower(iso3) = lower($5) OR 
      lower(numcode) = lower($6) OR 
      lower(phonecode) = lower($7)`,
      [code, iso, name, nicename, iso3, numcode, phonecode]
    );
    if (country.rows.length > 0) {
      return res.status(400).json({
        status: "NAK",
        message:
          "Duplicate code/iso/name/nicename/iso3/numcode/phonecode. Country already exists",
      });
    }
    const newCountry = await pool.query(
      `INSERT INTO country (
      code, iso, name, nicename, iso3, numcode, phonecode
      ) VALUES (
       UPPER($1), UPPER($2), UPPER($3), (INITCAP($4)), UPPER($5), $6, $7) RETURNING *`,
      [code, iso, name, nicename, iso3, numcode, phonecode]
    );
    res.json({ status: "AK", data: newCountry.rows[0] });
  } catch (error) {
    console.error(err.message);
    res.json({ status: "NAK", message: "Error creating country" });
  }
};

const updateCountry = async (req, res) => {
  try {
    const { id } = req.params;
    const { code, iso, name, nicename, iso3, numcode, phonecode } = req.body;
    const country = await pool.query(
      "SELECT * FROM country WHERE lower(code) = lower($1) OR lower(iso) = lower($2) OR lower(name) = lower($3) OR lower(nicename) = lower($4) OR lower(iso3) = lower($5) OR lower(numcode) = lower($6) OR lower(phonecode) = lower($7) OR id = $8",
      [code, iso, name, nicename, iso3, numcode, phonecode, id]
    );
    if (country.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "Country not found" });
    }
    const updatedCountry = await pool.query(
      "UPDATE country SET code = UPPER($1), iso = UPPER($2), name = UPPER($3), nicename = (INITCAP($4)), iso3 = UPPER($5), numcode = $6, phonecode = $7 WHERE id = $8 RETURNING *",
      [code, iso, name, nicename, iso3, numcode, phonecode, id]
    );
    res.json({ status: "AK", data: updatedCountry.rows[0] });
  } catch (error) {
    console.error(err.message);
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
    console.error(err.message);
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
