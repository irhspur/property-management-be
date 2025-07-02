const pool = require("../config/database");

const getAllGenders = async (req, res) => {
  try {
    const gender = await pool.query("SELECT * FROM gender");
    res.json({ status: "AK", data: gender.rows });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error fetching genders" });
  }
};
const createGender = async (req, res) => {
  try {
    const { name } = req.body;
    const gender = await pool.query(
      "SELECT * FROM gender WHERE lower(name) = lower($1)",
      [name]
    );
    if (gender.rows.length > 0) {
      return res
        .status(400)
        .json({ status: "NAK", message: "Gender already exists" });
    }
    const newGender = await pool.query(
      "INSERT INTO gender (name) VALUES (INITCAP($1)) RETURNING *",
      [name]
    );
    res.json({ status: "AK", data: newGender.rows[0] });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error creating gender" });
  }
};

const updateGender = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const gender = await pool.query("SELECT * FROM gender WHERE id = $1", [id]);
    if (gender.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "Gender not found" });
    }
    const updatedGender = await pool.query(
      "UPDATE gender SET name = (INITCAP($1)) RETURNING *",
      [name]
    );
    res.json({ status: "AK", data: updatedGender.rows[0] });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error updating gender" });
  }
};

const deleteGender = async (req, res) => {
  try {
    const { id } = req.params;
    const gender = await pool.query("SELECT * FROM gender WHERE id = $1", [id]);
    if (gender.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "Gender not found" });
    }
    await pool.query("DELETE FROM gender WHERE id = $1", [id]);
    res.json({ status: "AK", message: "gender deleted successfully" });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error deleting gender" });
  }
};
const getGenderById = async (req, res) => {
  try {
    const { id } = req.params;
    const gender = await pool.query("SELECT * FROM gender WHERE id = $1", [id]);
    if (gender.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "gender not found" });
    }
    res.json({ status: "AK", data: gender.rows[0] });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error fetching gender" });
  }
};

module.exports = {
  getAllGenders,
  createGender,
  updateGender,
  deleteGender,
  getGenderById,
};
