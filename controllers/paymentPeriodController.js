const pool = require("../config/database");

const createPaymentPeriod = async (req, res) => {
  try {
    const { id, payment_period } = req.body;
    const existing = await pool.query(
      "SELECT * FROM payment_period WHERE lower(payment_period) = lower($1)",
      [payment_period]
    );
    if (existing.rows.length > 0) {
      return res
        .status(400)
        .json({ status: "NAK", message: "Payment period already exists" });
    }
    const created = await pool.query(
      "INSERT INTO payment_period (id, payment_period) VALUES ($1, INITCAP($2)) RETURNING *",
      [id, payment_period]
    );
    res.json({
      status: "AK",
      message: "Payment period created successfully",
      data: created.rows[0],
    });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error creating payment period" });
  }
};

const getPaymentPeriods = async (req, res) => {
  try {
    const periods = await pool.query("SELECT * FROM payment_period");
    res.json({ status: "AK", data: periods.rows });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error fetching payment periods" });
  }
};

const getPaymentPeriodById = async (req, res) => {
  try {
    const { id } = req.params;
    const period = await pool.query(
      "SELECT * FROM payment_period WHERE id = $1",
      [id]
    );
    if (period.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "Payment period not found" });
    }
    res.json({ status: "AK", data: period.rows[0] });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error fetching payment period" });
  }
};

const updatePaymentPeriod = async (req, res) => {
  try {
    const { id } = req.query;
    const { payment_period } = req.body;
    const period = await pool.query(
      "SELECT * FROM payment_period WHERE id = $1",
      [id]
    );
    if (period.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "Payment period not found" });
    }
    const existing = await pool.query(
      "SELECT * FROM payment_period WHERE lower(payment_period) = lower($1) AND id != $2",
      [payment_period, id]
    );
    if (existing.rows.length > 0) {
      return res
        .status(400)
        .json({ status: "NAK", message: "Payment period already exists" });
    }
    const updated = await pool.query(
      "UPDATE payment_period SET payment_period = INITCAP($1), updated_at = NOW() WHERE id = $2 RETURNING *",
      [payment_period, id]
    );
    res.json({ status: "AK", data: updated.rows[0] });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error updating payment period" });
  }
};

const deletePaymentPeriod = async (req, res) => {
  try {
    const { id } = req.params;
    const period = await pool.query(
      "SELECT * FROM payment_period WHERE id = $1",
      [id]
    );
    if (period.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "Payment period not found" });
    }
    await pool.query("DELETE FROM payment_period WHERE id = $1", [id]);
    res.json({ status: "AK", message: "Payment period deleted successfully" });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error deleting payment period" });
  }
};

module.exports = {
  createPaymentPeriod,
  getPaymentPeriods,
  getPaymentPeriodById,
  updatePaymentPeriod,
  deletePaymentPeriod,
};
