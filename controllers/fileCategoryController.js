const pool = require("../config/database");

const getFileCategories = async (req, res) => {
  try {
    const fileCategories = await pool.query("SELECT * FROM file_categories");
    res.json({ status: "AK", data: fileCategories.rows });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error fetching file categories" });
  }
};

const getFileCategoryById = async (req, res) => {
  try {
    const { id } = req.params;
    const fileCategory = await pool.query(
      "SELECT * FROM file_categories WHERE id = $1",
      [id]
    );
    if (fileCategory.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "File category not found" });
    }
    res.json({ status: "AK", data: fileCategory.rows[0] });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error fetching file category" });
  }
};

const createFileCategory = async (req, res) => {
  try {
    const { name } = req.body;
    const existingFileCategory = await pool.query(
      "SELECT * FROM file_categories WHERE lower(name) = lower($1)",
      [name]
    );
    if (existingFileCategory.rows.length > 0) {
      return res.status(400).json({
        status: "NAK",
        message: "File category already exists.",
      });
    }
    const newFileCategory = await pool.query(
      "INSERT INTO file_categories (name) VALUES (INITCAP($1)) RETURNING *",
      [name]
    );
    res.json({ status: "AK", data: newFileCategory.rows[0] });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error creating file category" });
  }
};

const updateFileCategory = async (req, res) => {
  try {
    const { id } = req.query;
    const { name } = req.body;
    const fileCategory = await pool.query(
      "SELECT * FROM file_categories WHERE id = $1",
      [id]
    );
    if (fileCategory.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "File category not found" });
    }
    const existingFileCategory = await pool.query(
      "SELECT * FROM file_categories WHERE lower(name) = lower($1) AND id != $2",
      [name, id]
    );
    if (existingFileCategory.rows.length > 0) {
      return res.status(400).json({
        status: "NAK",
        message: "File category already exists.",
      });
    }
    const updatedFileCategory = await pool.query(
      "UPDATE file_categories SET name = INITCAP($1), updated_at = NOW() WHERE id = $2 RETURNING *",
      [name, id]
    );
    res.json({ status: "AK", data: updatedFileCategory.rows[0] });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error updating file category" });
  }
};

const deleteFileCategory = async (req, res) => {
  try {
    const { id } = req.params;
    const fileCategory = await pool.query(
      "SELECT * FROM file_categories WHERE id = $1",
      [id]
    );
    if (fileCategory.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "File category not found" });
    }
    await pool.query("DELETE FROM file_categories WHERE id = $1", [id]);
    res.json({ status: "AK", message: "File category deleted successfully" });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error deleting file category" });
  }
};

module.exports = {
  getFileCategories,
  getFileCategoryById,
  createFileCategory,
  updateFileCategory,
  deleteFileCategory,
};
