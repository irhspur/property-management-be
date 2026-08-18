const pool = require("../config/database");

const createAgreementDuration = async (req, res) => {
  try {
    const { id, duration_in_years } = req.body;
    const existing = await pool.query(
      "SELECT * FROM agreement_duration WHERE duration_in_years = $1",
      [duration_in_years]
    );
    if (existing.rows.length > 0) {
      return res
        .status(400)
        .json({ status: "NAK", message: "Agreement duration already exists" });
    }
    const created = await pool.query(
      "INSERT INTO agreement_duration (id, duration_in_years) VALUES ($1, $2) RETURNING *",
      [id, duration_in_years]
    );
    res.json({
      status: "AK",
      message: "Agreement duration created successfully",
      data: created.rows[0],
    });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error creating agreement duration" });
  }
};

const getAgreementDurations = async (req, res) => {
  try {
    const durations = await pool.query("SELECT * FROM agreement_duration");
    res.json({ status: "AK", data: durations.rows });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error fetching agreement durations" });
  }
};

const getAgreementDurationById = async (req, res) => {
  try {
    const { id } = req.params;
    const duration = await pool.query(
      "SELECT * FROM agreement_duration WHERE id = $1",
      [id]
    );
    if (duration.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "Agreement duration not found" });
    }
    res.json({ status: "AK", data: duration.rows[0] });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error fetching agreement duration" });
  }
};

const updateAgreementDuration = async (req, res) => {
  try {
    const { id } = req.query;
    const { duration_in_years } = req.body;
    const duration = await pool.query(
      "SELECT * FROM agreement_duration WHERE id = $1",
      [id]
    );
    if (duration.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "Agreement duration not found" });
    }
    const existing = await pool.query(
      "SELECT * FROM agreement_duration WHERE duration_in_years = $1 AND id != $2",
      [duration_in_years, id]
    );
    if (existing.rows.length > 0) {
      return res
        .status(400)
        .json({ status: "NAK", message: "Agreement duration already exists" });
    }
    const updated = await pool.query(
      "UPDATE agreement_duration SET duration_in_years = $1, updated_at = NOW() WHERE id = $2 RETURNING *",
      [duration_in_years, id]
    );
    res.json({ status: "AK", data: updated.rows[0] });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error updating agreement duration" });
  }
};

const deleteAgreementDuration = async (req, res) => {
  try {
    const { id } = req.params;
    const duration = await pool.query(
      "SELECT * FROM agreement_duration WHERE id = $1",
      [id]
    );
    if (duration.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "Agreement duration not found" });
    }
    await pool.query("DELETE FROM agreement_duration WHERE id = $1", [id]);
    res.json({ status: "AK", message: "Agreement duration deleted successfully" });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error deleting agreement duration" });
  }
};

module.exports = {
  createAgreementDuration,
  getAgreementDurations,
  getAgreementDurationById,
  updateAgreementDuration,
  deleteAgreementDuration,
};
