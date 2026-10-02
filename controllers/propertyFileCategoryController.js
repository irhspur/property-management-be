const pool = require("../config/database");
const { codeError, reservedCodeConflict } = require("../config/categoryCodes");

const getPropertyFileCategories = async (req, res) => {
  try {
    const propertyFileCategories = await pool.query(
      "SELECT * FROM property_file_categories"
    );
    res.json({ status: "AK", data: propertyFileCategories.rows });
  } catch (error) {
    console.error(error.message);
    res.json({
      status: "NAK",
      message: "Error fetching property file categories",
    });
  }
};

const getPropertyFileCategoryById = async (req, res) => {
  try {
    const { id } = req.params;
    const propertyFileCategory = await pool.query(
      "SELECT * FROM property_file_categories WHERE id = $1",
      [id]
    );
    if (propertyFileCategory.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "Property file category not found" });
    }
    res.json({ status: "AK", data: propertyFileCategory.rows[0] });
  } catch (error) {
    console.error(error.message);
    res.json({
      status: "NAK",
      message: "Error fetching property file category",
    });
  }
};

const createPropertyFileCategory = async (req, res) => {
  try {
    const { id, name, code } = req.body;
    const existingPropertyFileCategory = await pool.query(
      "SELECT * FROM property_file_categories WHERE lower(name) = lower($1)",
      [name]
    );
    if (existingPropertyFileCategory.rows.length > 0) {
      return res.status(400).json({
        status: "NAK",
        message: "Property file category already exists.",
      });
    }
    const codeTaken = await pool.query("SELECT 1 FROM property_file_categories WHERE code = $1", [code]);
    if (codeTaken.rows.length > 0) return codeError(res, "code already exists");
    const newPropertyFileCategory = await pool.query(
      "INSERT INTO property_file_categories (id, name, code) VALUES ($1, INITCAP($2), $3) RETURNING *",
      [id, name, code]
    );
    res.json({ status: "AK", data: newPropertyFileCategory.rows[0] });
  } catch (error) {
    console.error(error.message);
    if (error.constraint === "property_file_categories_code_key") return codeError(res, "code already exists");
    res.json({
      status: "NAK",
      message: "Error creating property file category",
    });
  }
};

const updatePropertyFileCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.body;
    const propertyFileCategory = await pool.query(
      "SELECT * FROM property_file_categories WHERE id = $1",
      [id]
    );
    if (propertyFileCategory.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "Property file category not found" });
    }
    const { code } = req.body;
    if (code !== undefined && code !== propertyFileCategory.rows[0].code) {
      return codeError(res, "code cannot be changed");
    }
    const existingPropertyFileCategory = await pool.query(
      "SELECT * FROM property_file_categories WHERE lower(name) = lower($1) AND id != $2",
      [name, id]
    );
    if (existingPropertyFileCategory.rows.length > 0) {
      return res.status(400).json({
        status: "NAK",
        message: "Property file category with this name already exists.",
      });
    }

    const updatedPropertyFileCategory = await pool.query(
      "UPDATE property_file_categories SET name = INITCAP($1), updated_at = NOW() WHERE id = $2 RETURNING *",
      [name, id]
    );
    res.json({ status: "AK", data: updatedPropertyFileCategory.rows[0] });
  } catch (error) {
    console.error(error.message);
    res.json({
      status: "NAK",
      message: "Error updating property file category",
    });
  }
};

const deletePropertyFileCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const propertyFileCategory = await pool.query(
      "SELECT * FROM property_file_categories WHERE id = $1",
      [id]
    );
    if (propertyFileCategory.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "Property file category not found" });
    }
    const conflict = reservedCodeConflict("property_file_categories", propertyFileCategory.rows[0].code);
    if (conflict) return res.status(409).json({ status: "NAK", message: conflict });
    await pool.query("DELETE FROM property_file_categories WHERE id = $1", [
      id,
    ]);
    res.json({
      status: "AK",
      message: "Property file category deleted successfully",
    });
  } catch (error) {
    console.error(error.message);
    res.json({
      status: "NAK",
      message: "Error deleting property file category",
    });
  }
};

module.exports = {
  getPropertyFileCategories,
  getPropertyFileCategoryById,
  createPropertyFileCategory,
  updatePropertyFileCategory,
  deletePropertyFileCategory,
};
