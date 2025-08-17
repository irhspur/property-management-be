const pool = require("../config/database");
const fs = require("fs");
const path = require("path");

const createPropertyFile = async (req, res) => {
  try {
    const { property_id } = req.params;
    const { property_file_category_id } = req.body;
    const userId = req.user.id;
    if (!req.files || req.files.length === 0) {
      return res
        .status(400)
        .json({ status: "NAK", message: "No files uploaded" });
    }

    if (!property_file_category_id) {
      return res.status(400).json({
        status: "NAK",
        message: "Property file category ID is required",
      });
    }

    const existingFile = await pool.query(
      "SELECT 1 FROM files WHERE user_id = $1 AND property_file_category_id = $2 AND property_id = $3",
      [userId, property_file_category_id, property_id]
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
    try {
      await pool.query("BEGIN");

      const file = req.files[0];

      const property_name = await pool.query(
        "SELECT property_name FROM properties WHERE property_id = $1",
        [property_id]
      );
      const propertyName =
        property_name.rows[0]?.property_name || "unknown_property";
      const mobileNumber = req.userData.mobileNumber || "unknown_user";

      const sanitizeName = (name) => {
        return name
          .replace(/[<>:"/\\|?*]+/g, "_") // replace slashes/backslashes with underscore
          .trim();
      };

      const dir = path.join(
        "uploads",
        sanitizeName(mobileNumber),
        sanitizeName(propertyName)
      );

      const ext = path.extname(file.originalname);
      const categoryRes = await pool.query(
        `SELECT name FROM property_file_categories WHERE id = $1`,
        [property_file_category_id]
      );
      const categoryName = categoryRes.rows[0]?.name || "uncategorized";

      const newFilename = `${req.userData.firstName}_${sanitizeName(
        categoryName
      )}_${Date.now()}${ext}`;

      const newPath = path.join(dir, newFilename);

      const result = await pool.query(
        `
            INSERT INTO files (user_id, property_id, property_file_category_id, original_name, mimetype, file_size, file_name, file_path)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *
          `,
        [
          userId,
          property_id,
          property_file_category_id,
          file.originalname,
          file.mimetype,
          file.size,
          newFilename,
          newPath,
        ]
      );

      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(newPath, file.buffer);

      res.json({
        status: "AK",
        message: "File uploaded successfully",
        data: result.rows[0],
      });
      await pool.query("COMMIT");
    } catch (transactionError) {
      await pool.query("ROLLBACK");
      console.error(transactionError.message);
      return res
        .status(500)
        .json({ status: "NAK", message: "Error uploading file" });
    }
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ status: "NAK", message: "Error uploading file" });
  }
};
const getPropertyFilesByFileId = async (req, res) => {
  try {
    const userId = req.user.id;
    const { fileId } = req.params;
    const { property_file_category_id } = req.query;
    let query = `SELECT f.*, pfc.name AS property_file_category_name
        FROM
        files f
        JOIN property_file_categories pfc ON f.property_file_category_id = pfc.id
        WHERE f.file_id = $1`;
    const params = [fileId];
    let paramIndex = 2;
    if (userId) {
      query += `AND f.user_id = $${paramIndex}`;
      params.push(userId);
      paramIndex++;
    }
    if (property_file_category_id) {
      query += `AND f.property_file_category_id = $${paramIndex}`;
      params.push(property_file_category_id);
      paramIndex++;
    }
    //query += " ORDER BY f.upload_date DESC";
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
    const userId = req.user.id;
    const { property_file_category_id, mobile_number, property_id } = req.query;
    let query = `SELECT f.*, pfc.name AS property_file_category_name
        FROM files f
        JOIN user_details ud ON f.user_id = ud.user_id
        JOIN property_file_categories pfc ON f.property_file_category_id = pfc.id
        WHERE f.user_id = $1`;
    const params = [userId];
    let paramIndex = 2;
    if (property_file_category_id) {
      query += ` AND f.property_file_category_id = $${paramIndex}`;
      params.push(property_file_category_id);
      paramIndex++;
    }

    if (mobile_number) {
      query += `AND ud.mobile_number = $${paramIndex}`;
      params.push(mobile_number);
      paramIndex++;
    }
    if (property_id) {
      query += `AND f.property_id = $${paramIndex}`;
      params.push(property_id);
      paramIndex++;
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
    const userId = req.user.id;
    const { mobile_number, property_file_category_id } = req.body;

    if (!req.files) {
      return res
        .status(400)
        .json({ status: "NAK", message: "No file provided for update." });
    }

    let query = `SELECT f.* FROM files f JOIN user_details ud ON f.user_id = ud.user_id WHERE f.file_id = $1`;
    const params = [fileId];
    let paramIndex = 2;
    if (mobile_number) {
      query += ` AND ud.mobile_number = $${paramIndex}`;
      params.push(mobile_number);
      paramIndex++;
    }
    if (property_file_category_id) {
      query += `AND f.property_file_category_id = $${paramIndex}`;
      params.push(property_file_category_id);
      paramIndex++;
    }
    if (userId) {
      query += `AND f.user_id = $${paramIndex}`;
      params.push(userId);
    }
    const result = await pool.query(query, params);
    console.log(result.rows);
    if (result.rows.length === 0) {
      return res.status(404).json({ status: "NAK", message: "File not found" });
    }
    const oldFilePath = result.rows[0]?.file_path;

    // Start a database transaction
    try {
      await pool.query("BEGIN");
      const file = req.files[0];

      const property_name = await pool.query(
        "SELECT property_name FROM properties WHERE property_id = $1",
        [result.rows[0].property_id]
      );
      const propertyName =
        property_name.rows[0]?.property_name || "unknown_property";
      const mobileNumber = req.userData.mobileNumber || "unknown_user";

      const sanitizeName = (name) => {
        return name
          .replace(/[<>:"/\\|?*]+/g, "_") // replace slashes/backslashes with underscore
          .trim();
      };

      const dir = path.join(
        "uploads",
        sanitizeName(mobileNumber),
        sanitizeName(propertyName)
      );

      const ext = path.extname(file.originalname);
      const categoryRes = await pool.query(
        `SELECT name FROM property_file_categories WHERE id = $1`,
        [property_file_category_id]
      );
      const categoryName = categoryRes.rows[0]?.name || "uncategorized";

      const newFilename = `${req.userData.firstName}_${sanitizeName(
        categoryName
      )}_${Date.now()}${ext}`;

      const newPath = path.join(dir, newFilename);

      const updatedFile = await pool.query(
        `
              UPDATE files 
              SET 
                original_name = $1, 
                mimetype = $2, 
                file_size = $3, 
                file_name = $4, 
                file_path = $5,
                upload_date = NOW(),
                updated_at = NOW()
              WHERE file_id = $6 RETURNING *
            `,
        [
          file.originalname,
          file.mimetype,
          file.size,
          newFilename,
          newPath,
          fileId,
        ]
      );

      fs.mkdirSync(dir, { recursive: true });

      if (fs.existsSync(oldFilePath)) {
        fs.unlinkSync(oldFilePath);
      }

      fs.writeFileSync(newPath, file.buffer);

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
    const userId = req.user.id;
    const { mobile_number, property_file_category_id, property_id } = req.query;

    let query = `SELECT f.* FROM files f 
    JOIN user_details ud ON f.user_id = ud.user_id 
    WHERE f.file_id = $1`;
    const params = [fileId];

    let paramIndex = 2;

    if (mobile_number) {
      query += ` AND ud.mobile_number = $${paramIndex}`;
      params.push(mobile_number);
      paramIndex++;
    }
    if (property_file_category_id) {
      query += ` AND f.property_file_category_id = $${paramIndex}`;
      params.push(property_file_category_id);
      paramIndex++;
    }
    if (userId) {
      query += ` AND f.user_id = $${paramIndex}`;
      params.push(userId);
      paramIndex++;
    }
    if (property_id) {
      query += ` AND f.property_id = $${paramIndex}`;
      params.push(property_id);
      paramIndex++;
    }
    const result = await pool.query(query, params);
    if (result.rows.length === 0) {
      return res.status(404).json({ status: "NAK", message: "File not found" });
    }
    const oldFilePath = result.rows[0].file_path;
    try {
      await pool.query("BEGIN");
      await pool.query("DELETE FROM files WHERE file_id = $1", [fileId]);
      if (oldFilePath && fs.existsSync(oldFilePath)) {
        fs.unlinkSync(oldFilePath);

        const parentDir = path.dirname(oldFilePath);
        const remainingFiles = fs.readdirSync(parentDir);
        if (remainingFiles.length === 0) {
          fs.rmdirSync(parentDir);
        }
      }
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
  getPropertyFilesByFileId,
  getPropertyFiles,
  updatePropertyFile,
  deletePropertyFile,
};
