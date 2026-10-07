const pool = require("../config/database");
const { codeError, reservedCodeConflict } = require("../config/categoryCodes");

const getAgreementFileCategories = async (req, res) => {
  try {
    const agreementFileCategories = await pool.query(
      "SELECT * FROM agreement_file_categories"
    );
    res.json({ status: "AK", data: agreementFileCategories.rows });
  } catch (error) {
    console.error(error.message);
    res.json({
      status: "NAK",
      message: "Error fetching agreement file categories",
    });
  }
};

const getAgreementFileCategoryById = async (req, res) => {
  try {
    const { id } = req.params;
    const agreementFileCategory = await pool.query(
      "SELECT * FROM agreement_file_categories WHERE id = $1",
      [id]
    );
    if (agreementFileCategory.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "Agreement file category not found" });
    }
    res.json({ status: "AK", data: agreementFileCategory.rows[0] });
  } catch (error) {
    console.error(error.message);
    res.json({
      status: "NAK",
      message: "Error fetching agreement file category",
    });
  }
};

const createAgreementFileCategory = async (req, res) => {
  try {
    const { id, name, code } = req.body;
    const existingAgreementFileCategory = await pool.query(
      "SELECT * FROM agreement_file_categories WHERE lower(name) = lower($1)",
      [name]
    );
    if (existingAgreementFileCategory.rows.length > 0) {
      return res.status(400).json({
        status: "NAK",
        message: "Agreement file category already exists.",
      });
    }
    const codeTaken = await pool.query("SELECT 1 FROM agreement_file_categories WHERE code = $1", [code]);
    if (codeTaken.rows.length > 0) return codeError(res, "code already exists");
    const newAgreementFileCategory = await pool.query(
      "INSERT INTO agreement_file_categories (id, name, code) VALUES ($1, INITCAP($2), $3) RETURNING *",
      [id, name, code]
    );
    res.json({ status: "AK", data: newAgreementFileCategory.rows[0] });
  } catch (error) {
    console.error(error.message);
    if (error.constraint === "agreement_file_categories_code_key") return codeError(res, "code already exists");
    res.json({
      status: "NAK",
      message: "Error creating agreement file category",
    });
  }
};

const updateAgreementFileCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const agreementFileCategory = await pool.query(
      "SELECT * FROM agreement_file_categories WHERE id = $1",
      [id]
    );
    if (agreementFileCategory.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "Agreement file category not found" });
    }
    const { code } = req.body;
    if (code !== undefined && code !== agreementFileCategory.rows[0].code) {
      return codeError(res, "code cannot be changed");
    }
    const existingAgreementFileCategory = await pool.query(
      "SELECT * FROM agreement_file_categories WHERE lower(name) = lower($1) AND id != $2",
      [name, id]
    );
    if (existingAgreementFileCategory.rows.length > 0) {
      return res.status(400).json({
        status: "NAK",
        message: "Agreement file category with this name already exists.",
      });
    }

    const updatedAgreementFileCategory = await pool.query(
      "UPDATE agreement_file_categories SET name = INITCAP($1), updated_at = NOW() WHERE id = $2 RETURNING *",
      [name, id]
    );
    res.json({ status: "AK", data: updatedAgreementFileCategory.rows[0] });
  } catch (error) {
    console.error(error.message);
    res.json({
      status: "NAK",
      message: "Error updating agreement file category",
    });
  }
};

const deleteAgreementFileCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const agreementFileCategory = await pool.query(
      "SELECT * FROM agreement_file_categories WHERE id = $1",
      [id]
    );
    if (agreementFileCategory.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "Agreement file category not found" });
    }
    const conflict = reservedCodeConflict("agreement_file_categories", agreementFileCategory.rows[0].code);
    if (conflict) return res.status(409).json({ status: "NAK", message: conflict });
    await pool.query("DELETE FROM agreement_file_categories WHERE id = $1", [
      id,
    ]);
    res.json({
      status: "AK",
      message: "Agreement file category deleted successfully",
    });
  } catch (error) {
    console.error(error.message);
    res.json({
      status: "NAK",
      message: "Error deleting agreement file category",
    });
  }
};

module.exports = {
  getAgreementFileCategories,
  getAgreementFileCategoryById,
  createAgreementFileCategory,
  updateAgreementFileCategory,
  deleteAgreementFileCategory,
};
