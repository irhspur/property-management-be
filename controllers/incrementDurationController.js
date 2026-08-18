const pool = require("../config/database");

const createIncrementDuration = async (req, res) => {
  try {
    const { id, increment_duration_in_years } = req.body;
    const existing = await pool.query(
      "SELECT * FROM increment_duration WHERE increment_duration_in_years = $1",
      [increment_duration_in_years]
    );
    if (existing.rows.length > 0) {
      return res
        .status(400)
        .json({ status: "NAK", message: "Increment duration already exists" });
    }
    const created = await pool.query(
      "INSERT INTO increment_duration (id, increment_duration_in_years) VALUES ($1, $2) RETURNING *",
      [id, increment_duration_in_years]
    );
    res.json({
      status: "AK",
      message: "Increment duration created successfully",
      data: created.rows[0],
    });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error creating increment duration" });
  }
};

const getIncrementDurations = async (req, res) => {
  try {
    const durations = await pool.query("SELECT * FROM increment_duration");
    res.json({ status: "AK", data: durations.rows });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error fetching increment durations" });
  }
};

const getIncrementDurationById = async (req, res) => {
  try {
    const { id } = req.params;
    const duration = await pool.query(
      "SELECT * FROM increment_duration WHERE id = $1",
      [id]
    );
    if (duration.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "Increment duration not found" });
    }
    res.json({ status: "AK", data: duration.rows[0] });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error fetching increment duration" });
  }
};

const updateIncrementDuration = async (req, res) => {
  try {
    const { id } = req.query;
    const { increment_duration_in_years } = req.body;
    const duration = await pool.query(
      "SELECT * FROM increment_duration WHERE id = $1",
      [id]
    );
    if (duration.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "Increment duration not found" });
    }
    const existing = await pool.query(
      "SELECT * FROM increment_duration WHERE increment_duration_in_years = $1 AND id != $2",
      [increment_duration_in_years, id]
    );
    if (existing.rows.length > 0) {
      return res
        .status(400)
        .json({ status: "NAK", message: "Increment duration already exists" });
    }
    const updated = await pool.query(
      "UPDATE increment_duration SET increment_duration_in_years = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
      [increment_duration_in_years, id]
    );
    res.json({ status: "AK", data: updated.rows[0] });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error updating increment duration" });
  }
};

const deleteIncrementDuration = async (req, res) => {
  try {
    const { id } = req.params;
    const duration = await pool.query(
      "SELECT * FROM increment_duration WHERE id = $1",
      [id]
    );
    if (duration.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "Increment duration not found" });
    }
    await pool.query("DELETE FROM increment_duration WHERE id = $1", [id]);
    res.json({ status: "AK", message: "Increment duration deleted successfully" });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error deleting increment duration" });
  }
};

module.exports = {
  createIncrementDuration,
  getIncrementDurations,
  getIncrementDurationById,
  updateIncrementDuration,
  deleteIncrementDuration,
};
