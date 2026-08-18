const pool = require("../config/database");

const createIncrementPercentage = async (req, res) => {
  try {
    const { id, increment_percentage } = req.body;
    const existing = await pool.query(
      "SELECT * FROM increment_percentage WHERE increment_percentage = $1",
      [increment_percentage]
    );
    if (existing.rows.length > 0) {
      return res
        .status(400)
        .json({ status: "NAK", message: "Increment percentage already exists" });
    }
    const created = await pool.query(
      "INSERT INTO increment_percentage (id, increment_percentage) VALUES ($1, $2) RETURNING *",
      [id, increment_percentage]
    );
    res.json({
      status: "AK",
      message: "Increment percentage created successfully",
      data: created.rows[0],
    });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error creating increment percentage" });
  }
};

const getIncrementPercentages = async (req, res) => {
  try {
    const percentages = await pool.query("SELECT * FROM increment_percentage");
    res.json({ status: "AK", data: percentages.rows });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error fetching increment percentages" });
  }
};

const getIncrementPercentageById = async (req, res) => {
  try {
    const { id } = req.params;
    const percentage = await pool.query(
      "SELECT * FROM increment_percentage WHERE id = $1",
      [id]
    );
    if (percentage.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "Increment percentage not found" });
    }
    res.json({ status: "AK", data: percentage.rows[0] });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error fetching increment percentage" });
  }
};

const updateIncrementPercentage = async (req, res) => {
  try {
    const { id } = req.query;
    const { increment_percentage } = req.body;
    const percentage = await pool.query(
      "SELECT * FROM increment_percentage WHERE id = $1",
      [id]
    );
    if (percentage.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "Increment percentage not found" });
    }
    const existing = await pool.query(
      "SELECT * FROM increment_percentage WHERE increment_percentage = $1 AND id != $2",
      [increment_percentage, id]
    );
    if (existing.rows.length > 0) {
      return res
        .status(400)
        .json({ status: "NAK", message: "Increment percentage already exists" });
    }
    const updated = await pool.query(
      "UPDATE increment_percentage SET increment_percentage = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
      [increment_percentage, id]
    );
    res.json({ status: "AK", data: updated.rows[0] });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error updating increment percentage" });
  }
};

const deleteIncrementPercentage = async (req, res) => {
  try {
    const { id } = req.params;
    const percentage = await pool.query(
      "SELECT * FROM increment_percentage WHERE id = $1",
      [id]
    );
    if (percentage.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "Increment percentage not found" });
    }
    await pool.query("DELETE FROM increment_percentage WHERE id = $1", [id]);
    res.json({ status: "AK", message: "Increment percentage deleted successfully" });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error deleting increment percentage" });
  }
};

module.exports = {
  createIncrementPercentage,
  getIncrementPercentages,
  getIncrementPercentageById,
  updateIncrementPercentage,
  deleteIncrementPercentage,
};
