const pool = require("../config/database");
const fs = require("fs");

const createPropertyFile = async (req, res) => {
  try {
    if (!req.files || req.files.length === 0) {
      return res
        .status(400)
        .json({ status: "NAK", message: "No files uploaded" });
    }
    const { property_file_category_id } = req.body;
    if (!property_file_category_id) {
      return res.status(400).json({
        status: "NAK",
        message: "Property file category ID is required",
      });
    }
    const userId = req.user.id;

    const existingFile = await pool.query(
      "SELECT * FROM files WHERE user_id = $1 AND property_file_category_id = $2",
      [userId, property_file_category_id]
    );
    if (existingFile.rows.length > 0) {
      return res.status(400).json({
        status: "NAK",
        message:
          "File already exists for this category. Please Update or replace it.",
        existingFileId: existingFile.rows[0].id,
      });
    }
    if (req.files.length > 1) {
      return res.status(400).json({
        status: "NAK",
        message:
          "Only one file allowed per category. Upload one file at a time.",
      });
    }
    const file = req.files[0];
    const {
      original_name,
      mimetype,
      file_size,
      file_name,
      path: filePath,
    } = file;
    const result = await pool.query(
      `
            INSERT INTO files (user_id, property_file_category_id, original_name, mime_type, file_size, file_name, file_path)
            VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
          `,
      [
        userID,
        property_file_category_id,
        original_name,
        mimetype,
        file_size,
        file_name,
        filePath,
      ]
    );
    res.json({
      status: "AK",
      message: "File uploaded successfully",
      data: result.rows[0],
    });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ status: "NAK", message: "Error uploading file" });
  }
};
const getPropertyFilesByUserID = async (req, res) => {
  try {
    const userId = req.user.id;
    const { property_file_category_id } = req.query;
    let query = `SELECT f.*, pfc.name AS file_category_name
        FROM
        files f
        JOIN property_file_categories pfc ON f.property_file_category_id = pfc.id
        WHERE f.user_id = $1`;
    const params = [userId];
    if (property_file_category_id) {
      query += " AND f.property_file_category_id = $2";
      params.push(property_file_category_id);
    }
    query += " ORDER BY f.upload_date DESC";
    const result = await pool.query(query, params);
    if (result.rows.length === 0) {
      return res.status(404).json({ status: "NAK", message: "No files found" });
    }
    res.json({ status: "AK", data: result.rows });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ status: "NAK", message: "Error fetching files" });
  }
};

const getPropertyFiles = async (req, res) => {
  try {
    const { property_file_category_id } = req.query;
    let query = `SELECT f.*, pfc.name AS file_category_name
        FROM files f
        JOIN property_file_categories pfc ON f.property_file_category_id = pfc.id`;
    const params = [];
    if (property_file_category_id) {
      query += " WHERE f.property_file_category_id = $1";
      params.push(property_file_category_id);
    }
    query += " ORDER BY f.upload_date DESC";
    const result = await pool.query(query, params);
    if (result.rows.length === 0) {
      return res.status(404).json({ status: "NAK", message: "No files found" });
    }
    res.json({ status: "AK", data: result.rows });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ status: "NAK", message: "Error fetching files" });
  }
};

const getPropertyFilesByMobileNumber = async (req, res) => {
  try {
    const { mobile_number } = req.params;
    const { property_file_category_id } = req.query;
    let query = `SELECT f.*, pfc.name AS file_category_name
        FROM files f
        JOIN user_details ud ON f.user_id = ud.user_id
        JOIN property_file_categories pfc ON f.property_file_category_id = pfc.id
        WHERE ud.mobile_number = $1`;
    const params = [mobile_number];
    if (property_file_category_id) {
      query += " AND f.property_file_category_id = $2";
      params.push(property_file_category_id);
    }
    query += " ORDER BY f.upload_date DESC";
    const result = await pool.query(query, params);
    if (result.rows.length === 0) {
      return res.status(404).json({ status: "NAK", message: "No files found" });
    }
    res.json({ status: "AK", data: result.rows });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ status: "NAK", message: "Error fetching files" });
  }
};

const updatePropertyFile = async (req, res) => {
  try {
    const { fileId } = req.params;
    const { userId } = req.user.id;
    const { mobile_number, property_file_category_id } = req.body;

    if (!req.files) {
      return res
        .status(400)
        .json({ status: "NAK", message: "No file provided for update." });
    }

    let query = `SELECT f.* FROM files f JOIN user_details ud ON f.user_id = ud.user_id WHERE f.file_id = $1`;
    const params = [fileId];
    if (mobile_number) {
      query += " AND ud.mobile_number = $2";
      params.push(mobile_number);
    }
    if (property_file_category_id) {
      query += " AND f.property_file_category_id = $3";
      params.push(property_file_category_id);
    }
    if (userId) {
      query += " AND f.user_id = $4";
      params.push(userId);
    }
    const result = await pool.query(query, params);
    const oldFilePath = result.rows[0].file_path;

    // Start a database transaction
    try {
      await pool.query("BEGIN");
      if (oldFilePath && fs.existsSync(oldFilePath)) {
        fs.unlinkSync(oldFilePath);
      }
      const file = req.files[0];
      const {
        original_name,
        mimetype,
        file_size,
        file_name,
        path: filePath,
      } = file;
      const updatedFile = await pool.query(
        `
              UPDATE files 
              SET 
                original_name = $1, 
                mimetype = $2, 
                file_size = $3, 
                file_name = $4, 
                file_path = $5,
                upload_date = NOW()
              WHERE id = $6 RETURNING *
            `,
        [original_name, mimetype, file_size, file_name, filePath, fileId]
      );
      await pool.query("COMMIT");
      res.json({
        status: "AK",
        message: "File updated successfully",
        data: updatedFile.rows[0],
      });
    } catch (transactionError) {
      await pool.query("ROLLBACK");
      console.error(transactionError.message);
      res.status(500).json({ status: "NAK", message: "Error updating file" });
    }
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ status: "NAK", message: "Error updating file" });
  }
};
const deletePropertyFile = async (req, res) => {
  try {
    const { fileId } = req.params;
    const { userId } = req.user.id;
    const { mobile_number, property_file_category_id } = req.body;

    let query = `SELECT f.* FROM files f JOIN user_details ud ON f.user_id = ud.user_id WHERE f.file_id = $1`;
    const params = [fileId];
    if (mobile_number) {
      query += " AND ud.mobile_number = $2";
      params.push(mobile_number);
    }
    if (property_file_category_id) {
      query += " AND f.property_file_category_id = $3";
      params.push(property_file_category_id);
    }
    if (userId) {
      query += " AND f.user_id = $4";
      params.push(userId);
    }
    const result = await pool.query(query, params);
    if (result.rows.length === 0) {
      return res.status(404).json({ status: "NAK", message: "File not found" });
    }
    try {
      await pool.query("BEGIN");
      const oldFilePath = result.rows[0].file_path;
      if (oldFilePath && fs.existsSync(oldFilePath)) {
        fs.unlinkSync(oldFilePath);
      }
      await pool.query("DELETE FROM files WHERE id = $1", [fileId]);
      await pool.query("COMMIT");
      res.json({ status: "AK", message: "File deleted successfully" });
    } catch (transactionError) {
      await pool.query("ROLLBACK");
      console.error(transactionError.message);
      res.status(500).json({ status: "NAK", message: "Error deleting file" });
    }
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ status: "NAK", message: "Error deleting file" });
  }
};

module.exports = {
  createPropertyFile,
  getPropertyFilesByUserID,
  getPropertyFiles,
  getPropertyFilesByMobileNumber,
  updatePropertyFile,
  deletePropertyFile,
};
