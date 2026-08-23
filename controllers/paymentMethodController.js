const pool = require("../config/database");

const createPaymentMethod = async (req, res) => {
  try {
    const { id, payment_method } = req.body;
    const existing = await pool.query(
      "SELECT * FROM payment_method WHERE lower(payment_method) = lower($1)",
      [payment_method]
    );
    if (existing.rows.length > 0) {
      return res
        .status(400)
        .json({ status: "NAK", message: "Payment method already exists" });
    }
    const created = await pool.query(
      "INSERT INTO payment_method (id, payment_method) VALUES ($1, INITCAP($2)) RETURNING *",
      [id, payment_method]
    );
    res.json({
      status: "AK",
      message: "Payment method created successfully",
      data: created.rows[0],
    });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error creating payment method" });
  }
};

const getPaymentMethods = async (req, res) => {
  try {
    const methods = await pool.query("SELECT * FROM payment_method");
    res.json({ status: "AK", data: methods.rows });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error fetching payment methods" });
  }
};

const getPaymentMethodById = async (req, res) => {
  try {
    const { id } = req.params;
    const method = await pool.query(
      "SELECT * FROM payment_method WHERE id = $1",
      [id]
    );
    if (method.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "Payment method not found" });
    }
    res.json({ status: "AK", data: method.rows[0] });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error fetching payment method" });
  }
};

const updatePaymentMethod = async (req, res) => {
  try {
    const { id } = req.query;
    const { payment_method } = req.body;
    const method = await pool.query(
      "SELECT * FROM payment_method WHERE id = $1",
      [id]
    );
    if (method.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "Payment method not found" });
    }
    const existing = await pool.query(
      "SELECT * FROM payment_method WHERE lower(payment_method) = lower($1) AND id != $2",
      [payment_method, id]
    );
    if (existing.rows.length > 0) {
      return res
        .status(400)
        .json({ status: "NAK", message: "Payment method already exists" });
    }
    const updated = await pool.query(
      "UPDATE payment_method SET payment_method = INITCAP($1), updated_at = NOW() WHERE id = $2 RETURNING *",
      [payment_method, id]
    );
    res.json({ status: "AK", data: updated.rows[0] });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error updating payment method" });
  }
};

const deletePaymentMethod = async (req, res) => {
  try {
    const { id } = req.params;
    const method = await pool.query(
      "SELECT * FROM payment_method WHERE id = $1",
      [id]
    );
    if (method.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "Payment method not found" });
    }
    await pool.query("DELETE FROM payment_method WHERE id = $1", [id]);
    res.json({ status: "AK", message: "Payment method deleted successfully" });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error deleting payment method" });
  }
};

module.exports = {
  createPaymentMethod,
  getPaymentMethods,
  getPaymentMethodById,
  updatePaymentMethod,
  deletePaymentMethod,
};
