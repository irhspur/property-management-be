const pool = require("../config/database");

const createPaymentPurpose = async (req, res) => {
  try {
    const { id, payment_purpose } = req.body;
    const existing = await pool.query(
      "SELECT * FROM payment_purpose WHERE lower(payment_purpose) = lower($1)",
      [payment_purpose]
    );
    if (existing.rows.length > 0) {
      return res
        .status(400)
        .json({ status: "NAK", message: "Payment purpose already exists" });
    }
    const created = await pool.query(
      "INSERT INTO payment_purpose (id, payment_purpose) VALUES ($1, INITCAP($2)) RETURNING *",
      [id, payment_purpose]
    );
    res.json({
      status: "AK",
      message: "Payment purpose created successfully",
      data: created.rows[0],
    });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error creating payment purpose" });
  }
};

const getPaymentPurposes = async (req, res) => {
  try {
    const purposes = await pool.query("SELECT * FROM payment_purpose");
    res.json({ status: "AK", data: purposes.rows });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error fetching payment purposes" });
  }
};

const getPaymentPurposeById = async (req, res) => {
  try {
    const { id } = req.params;
    const purpose = await pool.query(
      "SELECT * FROM payment_purpose WHERE id = $1",
      [id]
    );
    if (purpose.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "Payment purpose not found" });
    }
    res.json({ status: "AK", data: purpose.rows[0] });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error fetching payment purpose" });
  }
};

const updatePaymentPurpose = async (req, res) => {
  try {
    const { id } = req.query;
    const { payment_purpose } = req.body;
    const purpose = await pool.query(
      "SELECT * FROM payment_purpose WHERE id = $1",
      [id]
    );
    if (purpose.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "Payment purpose not found" });
    }
    const existing = await pool.query(
      "SELECT * FROM payment_purpose WHERE lower(payment_purpose) = lower($1) AND id != $2",
      [payment_purpose, id]
    );
    if (existing.rows.length > 0) {
      return res
        .status(400)
        .json({ status: "NAK", message: "Payment purpose already exists" });
    }
    const updated = await pool.query(
      "UPDATE payment_purpose SET payment_purpose = INITCAP($1), updated_at = NOW() WHERE id = $2 RETURNING *",
      [payment_purpose, id]
    );
    res.json({ status: "AK", data: updated.rows[0] });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error updating payment purpose" });
  }
};

const deletePaymentPurpose = async (req, res) => {
  try {
    const { id } = req.params;
    const purpose = await pool.query(
      "SELECT * FROM payment_purpose WHERE id = $1",
      [id]
    );
    if (purpose.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "Payment purpose not found" });
    }
    await pool.query("DELETE FROM payment_purpose WHERE id = $1", [id]);
    res.json({ status: "AK", message: "Payment purpose deleted successfully" });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error deleting payment purpose" });
  }
};

module.exports = {
  createPaymentPurpose,
  getPaymentPurposes,
  getPaymentPurposeById,
  updatePaymentPurpose,
  deletePaymentPurpose,
};
