const pool = require("../config/database");
const linkTenantToOwner = require("../services/linkTenantToOwner");
const { UserDetailsSchema, AddressSchema, pickFields } = require("../schemas");
const path = require("path");
const fs = require("fs");

const createTenant = async (req, res) => {
  try {
    const property_owner_id = req.user.id;
    const { email, password, user_type_id } = req.body;

    await pool.query("BEGIN");
    const existingUser = await pool.query(
      "SELECT * FROM users WHERE email = $1 AND user_type_id = $2",
      [email, user_type_id]
    );
    if (existingUser.rows.length > 0) {
      return res
        .status(400)
        .json({ status: "NAK", message: "User already exists" });
    }
    const newTenant = await pool.query(
      `
            INSERT INTO users (email, password, user_type_id)
            VALUES ($1, $2, $3)
            RETURNING *`,
      [email, password, user_type_id]
    );
    const tenantId = newTenant.rows[0].user_id;

    const d = pickFields(req.body, UserDetailsSchema);

    const existingUserDetails = await pool.query(
      "SELECT * FROM user_details WHERE mobile_number = $1",
      [d.mobile_number]
    );
    if (existingUserDetails.rows.length > 0) {
      return res
        .status(400)
        .json({ status: "NAK", message: "Mobile Number already exists" });
    }

    const newTenantDetails = await pool.query(
      `   
        INSERT INTO user_details (
                user_id,
                first_name, 
                middle_name, 
                last_name, 
                gender_id, 
                dob, 
                country_id, 
                birth_district_id, 
                father_full_name, 
                nin_number, 
                mobile_number, 
                citizenship_number, 
                citizenship_issue_district_id, 
                citizenship_issue_date, 
                bank_account_number, 
                bank_name
            ) 
            VALUES (
                $1,
                INITCAP($2), 
                INITCAP($3), 
                INITCAP($4), 
                $5, 
                $6, 
                $7, 
                $8, 
                INITCAP($9), 
                $10, 
                $11, 
                $12, 
                $13, 
                $14, 
                $15, 
                INITCAP($16)
            ) RETURNING *
            `,
      [
        tenantId,
        d.first_name,
        d.middle_name,
        d.last_name,
        d.gender_id,
        d.dob,
        d.country_id,
        d.birth_district_id,
        d.father_full_name,
        d.nin_number,
        d.mobile_number,
        d.citizenship_number,
        d.citizenship_issue_district_id,
        d.citizenship_issue_date,
        d.bank_account_number,
        d.bank_name,
      ]
    );

    const a = pickFields(req.body, AddressSchema, { address_country_id: 'country_id' });

    const existingAddress = await pool.query(
      ` 
      SELECT * 
      FROM address 
      WHERE 
      user_id = $1 AND 
      country_id = $2 AND 
      province_id = $3 AND 
      district_id = $4 AND 
      municipality_id = $5 `,
      [tenantId, a.country_id, a.province_id, a.district_id, a.municipality_id]
    );
    if (existingAddress.rows.length > 0) {
      return res.status(400).json({
        status: "NAK",
        message: "Address already exists for this user",
      });
    }

    const newTenantAddress = await pool.query(
      `
            INSERT INTO address (
                user_id, 
                country_id, 
                province_id, 
                district_id, 
                municipality_id, 
                ward_number, 
                street_name, 
                house_number, 
                contact_number_1, 
                contact_number_2, 
                contact_address
            ) 
            VALUES ($1, $2, $3, $4, $5, $6, INITCAP($7), INITCAP($8), $9, $10, INITCAP($11)) RETURNING *
            `,
      [
        tenantId,
        a.country_id,
        a.province_id,
        a.district_id,
        a.municipality_id,
        a.ward_number,
        a.street_name,
        a.house_number,
        a.contact_number_1,
        a.contact_number_2,
        a.contact_address,
      ]
    );
    await linkTenantToOwner(property_owner_id, tenantId);

    await pool.query("COMMIT");
    res.json({
      status: "AK",
      data: {
        tenant: newTenant.rows[0],
        tenantDetails: newTenantDetails.rows[0],
        tenantAddress: newTenantAddress.rows[0],
      },
      message: "Tenant created successfully",
    });
  } catch (error) {
    await pool.query("ROLLBACK");
    console.error(error.message);
    res.json({ status: "NAK", message: "Error creating tenant" });
  }
};

const getTenantsByPropertyOwnerId = async (req, res) => {
  try {
    const property_owner_id = req.user.id;
    const tenants = await pool.query(
      `
      SELECT 
        u.user_id AS tenant_id,
        ud.first_name,
        ud.middle_name,
        ud.last_name,
        u.email,
        ud.gender_id,
        g.name AS gender,
        ud.dob,
        ud.country_id AS birth_country_id,
        c.name AS country,
        ud.birth_district_id,
        d.name AS birth_district,
        ud.father_full_name,
        ud.nin_number,
        ud.mobile_number,
        ud.citizenship_number,
        ud.citizenship_issue_district_id,
        d2.name AS citizenship_issue_district,
        ud.citizenship_issue_date,
        ud.bank_account_number,
        ud.bank_name,
        a.country_id AS address_country_id,
        c1.name AS address_country,
        a.province_id,
        p.name AS province,
        a.district_id AS address_district_id,
        d3.name AS address_district,
        a.municipality_id,
        m.name AS municipality,
        a.ward_number,
        a.street_name,
        a.house_number,
        a.contact_number_1,
        a.contact_number_2,
        a.contact_address,
        ut.name AS user_type,
        ud1.first_name AS associated_property_owner,
        u.is_verified,
        u.is_active,
        u.created_at,
        ot.created_at AS linked_at
      FROM owner_tenant ot
      JOIN users u ON u.user_id = ot.tenant_id
      LEFT JOIN user_details ud ON ud.user_id = u.user_id
      LEFT JOIN user_type ut ON u.user_type_id = ut.id
      LEFT JOIN gender g ON ud.gender_id = g.id
      LEFT JOIN country c ON ud.country_id = c.id
      LEFT JOIN district d ON ud.birth_district_id = d.id
      LEFT JOIN district d2 ON ud.citizenship_issue_district_id = d2.id
      LEFT JOIN LATERAL (
        SELECT * FROM address WHERE user_id = u.user_id ORDER BY created_at DESC LIMIT 1
      ) a ON true
      LEFT JOIN country c1 ON a.country_id = c1.id
      LEFT JOIN province p ON a.province_id = p.id
      LEFT JOIN district d3 ON a.district_id = d3.id
      LEFT JOIN municipality m ON a.municipality_id = m.id
      LEFT JOIN LATERAL (
        SELECT first_name FROM user_details WHERE user_id = ot.property_owner_id ORDER BY created_at DESC LIMIT 1
      ) ud1 ON true
      WHERE ot.property_owner_id = $1
      ORDER BY ot.created_at DESC
      `,
      [property_owner_id]
    );
    if (tenants.rows.length === 0) {
      return res.status(404).json({
        status: "NAK",
        message: "No tenants found for this property owner",
      });
    }
    res.json({ status: "AK", data: tenants.rows });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error fetching tenants" });
  }
};

const getTenant = async (req, res) => {
  try {
    const { tenantId } = req.params;
    const property_owner_id = req.user.id;
    const tenants = await pool.query(
      `
      SELECT 
        u.user_id,
        ud.first_name,
        ud.middle_name,
        ud.last_name,
        u.email,
        ud.gender_id,
        g.name AS gender,
        ud.dob,
        ud.country_id AS birth_country_id,
        c.name AS country,
        ud.birth_district_id,
        d.name AS birth_district,
        ud.father_full_name,
        ud.nin_number,
        ud.mobile_number,
        ud.citizenship_number,
        ud.citizenship_issue_district_id,
        d2.name AS citizenship_issue_district,
        ud.citizenship_issue_date,
        ud.bank_account_number,
        ud.bank_name,
        a.country_id AS address_country_id,
        c1.name AS address_country,
        a.province_id,
        p.name AS province,
        a.district_id AS address_district_id,
        d3.name AS address_district,
        a.municipality_id,
        m.name AS municipality,
        a.ward_number,
        a.street_name,
        a.house_number,
        a.contact_number_1,
        a.contact_number_2,
        a.contact_address,
        ut.name AS user_type,
        ud1.first_name AS associated_property_owner,
        u.is_verified,
        u.is_active,
        u.created_at
      FROM users u
      JOIN user_details ud ON u.user_id = ud.user_id
      JOIN user_type ut ON u.user_type_id = ut.id
      LEFT JOIN gender g ON ud.gender_id = g.id
      LEFT JOIN country c ON ud.country_id = c.id
      LEFT JOIN district d ON ud.birth_district_id = d.id
      LEFT JOIN district d2 ON ud.citizenship_issue_district_id = d2.id
      LEFT JOIN LATERAL (
        SELECT * FROM address WHERE user_id = u.user_id ORDER BY created_at DESC LIMIT 1
      ) a ON true
      LEFT JOIN country c1 ON a.country_id = c1.id
      LEFT JOIN province p ON a.province_id = p.id
      LEFT JOIN district d3 ON a.district_id = d3.id
      LEFT JOIN municipality m ON a.municipality_id = m.id
      JOIN owner_tenant ot ON u.user_id = ot.tenant_id
      LEFT JOIN user_details ud1 ON ot.property_owner_id = ud1.user_id
      WHERE ot.property_owner_id = $1 AND ot.tenant_id = $2
      `,
      [property_owner_id, tenantId]
    );
    if (tenants.rows.length === 0) {
      return res.status(404).json({
        status: "NAK",
        message: "No tenant found.",
      });
    }
    res.json({ status: "AK", data: tenants.rows[0] });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error fetching tenants" });
  }
};

const updateTenantDetails = async (req, res) => {
  try {
    const property_owner_id = req.user.id;
    const { tenantId } = req.params;
    const link = await pool.query(
      "SELECT 1 FROM owner_tenant WHERE property_owner_id = $1 AND tenant_id = $2",
      [property_owner_id, tenantId]
    );
    if (link.rows.length === 0) {
      return res.status(403).json({
        status: "NAK",
        message: "You are not allowed to update this tenant's details",
      });
    }

    const d = pickFields(req.body, UserDetailsSchema);
    const tenantDetails = await pool.query(
      "SELECT * FROM user_details WHERE user_id = $1",
      [tenantId]
    );
    if (tenantDetails.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "Tenant details not found" });
    }
    const existing = tenantDetails.rows[0];
    if (existing.mobile_number !== d.mobile_number) {
      return res.status(400).json({
        status: "NAK",
        message: "You are not allowed to update mobile number",
      });
    }
    const details = await pool.query(
      `
                  UPDATE user_details 
                  SET 
                  first_name = INITCAP($1), 
                  middle_name = INITCAP($2),
                  last_name =  INITCAP($3),
                  gender_id = $4,
                  dob = $5,
                  country_id = $6,
                  birth_district_id = $7,
                  father_full_name = INITCAP($8),
                  nin_number = $9,
                  mobile_number = $10,
                  citizenship_number = $11,
                  citizenship_issue_district_id = $12,
                  citizenship_issue_date = $13,
                  bank_account_number = $14,
                  bank_name = INITCAP($15),
                  updated_at = NOW()
                  WHERE user_id = $16 RETURNING *
                  `,
      [
        d.first_name,
        d.middle_name,
        d.last_name,
        d.gender_id,
        d.dob,
        d.country_id,
        d.birth_district_id,
        d.father_full_name,
        d.nin_number,
        existing.mobile_number,
        d.citizenship_number,
        d.citizenship_issue_district_id,
        d.citizenship_issue_date,
        d.bank_account_number,
        d.bank_name,
        tenantId,
      ]
    );
    res.json({
      status: "AK",
      data: details.rows[0],
      message: "Tenant details updated successfully",
    });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error updating tenant details" });
  }
};

const updateTenantAddress = async (req, res) => {
  try {
    const property_owner_id = req.user.id;
    const { tenantId } = req.params;
    const link = await pool.query(
      "SELECT 1 FROM owner_tenant WHERE property_owner_id = $1 AND tenant_id = $2",
      [property_owner_id, tenantId]
    );
    if (link.rows.length === 0) {
      return res.status(403).json({
        status: "NAK",
        message: "You are not allowed to update this tenant's address",
      });
    }
    const a = pickFields(req.body, AddressSchema);
    const address = await pool.query(
      "SELECT * FROM address WHERE user_id = $1",
      [tenantId]
    );
    if (address.rows.length === 0) {
      return res
        .status(404)
        .json({ status: "NAK", message: "Address not found" });
    }
    const updatedAddress = await pool.query(
      `
                UPDATE address 
                SET 
                    country_id = $1, 
                    province_id = $2, 
                    district_id = $3, 
                    municipality_id = $4, 
                    ward_number = $5, 
                    street_name = INITCAP($6), 
                    house_number = INITCAP($7), 
                    contact_number_1 = $8, 
                    contact_number_2 = $9, 
                    contact_address = INITCAP($10),
                    updated_at = NOW()
                WHERE user_id = $11 RETURNING *
                `,
      [
        a.country_id,
        a.province_id,
        a.district_id,
        a.municipality_id,
        a.ward_number,
        a.street_name,
        a.house_number,
        a.contact_number_1,
        a.contact_number_2,
        a.contact_address,
        tenantId,
      ]
    );
    res.json({
      status: "AK",
      data: updatedAddress.rows[0],
      message: "Address updated successfully",
    });
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error updating address" });
  }
};

const uploadFilesForTenant = async (req, res) => {
  try {
    const property_owner_id = req.user.id;
    const { tenantId } = req.params;
    const link = await pool.query(
      "SELECT 1 FROM owner_tenant WHERE property_owner_id = $1 AND tenant_id = $2",
      [property_owner_id, tenantId]
    );
    if (link.rows.length === 0) {
      return res.status(403).json({
        status: "NAK",
        message: "You are not allowed to upload files for this tenant",
      });
    }
    if (!req.files || req.files.length === 0) {
      return res
        .status(400)
        .json({ status: "NAK", message: "No files uploaded" });
    }
    const { file_category_id } = req.body;

    if (!file_category_id) {
      return res
        .status(400)
        .json({ status: "NAK", message: "File category ID is required" });
    }

    const existingFile = await pool.query(
      "SELECT * FROM files WHERE user_id = $1 AND file_category_id = $2",
      [tenantId, file_category_id]
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
      const ext = path.extname(file.originalname);

      const categoryRes = await pool.query(
        `SELECT name FROM file_categories WHERE id = $1`,
        [file_category_id]
      );
      const newTenantDetails = await pool.query(
        `SELECT first_name, mobile_number FROM user_details WHERE user_id = $1`,
        [tenantId]
      );
      const categoryName = categoryRes.rows[0]?.name || "uncategorized";
      const tenantFirstName = newTenantDetails.rows[0].first_name || "tenant";
      const tenantMobile = newTenantDetails.rows[0].mobile_number || "unknown";
      const newFilename = `${tenantFirstName}_${categoryName}_${Date.now()}${ext}`;

      const uploadDir = path.join("uploads", tenantMobile);

      const newPath = path.join(uploadDir, newFilename);

      /*
      const oldPath = file.path;
      const newPath = path.join(path.dirname(file.path), newFilename);
      // Rename the file
      fs.renameSync(oldPath, newPath);
      */

      const tenantDocument = await pool.query(
        `
              INSERT INTO files (user_id, file_category_id, original_name, mimetype, file_size, file_name, file_path)
              VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *
            `,
        [
          tenantId,
          file_category_id,
          file.originalname,
          file.mimetype,
          file.size,
          newFilename,
          newPath,
        ]
      );
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      fs.writeFileSync(newPath, file.buffer);
      await pool.query("COMMIT");
      res.json({
        status: "AK",
        data: tenantDocument.rows[0],
        message: "Document uploaded successfully",
      });
    } catch (transactionError) {
      await pool.query("ROLLBACK");
      console.error(transactionError.message);
      res.status(500).json({ status: "NAK", message: "Error uploading file" });
    }
  } catch (error) {
    console.error(error.message);
    res.json({ status: "NAK", message: "Error creating tenant documents" });
  }
};

const getTenantFiles = async (req, res) => {
  try {
    const { tenantId } = req.params;
    const property_owner_id = req.user.id;
    const link = await pool.query(
      "SELECT 1 FROM owner_tenant WHERE property_owner_id = $1 AND tenant_id = $2",
      [property_owner_id, tenantId]
    );
    if (link.rows.length === 0) {
      return res.status(403).json({
        status: "NAK",
        message: "You are not allowed to view this tenant's files",
      });
    }
    let query = `SELECT f.*, fc.name AS file_category_name
        FROM files f
        JOIN file_categories fc ON f.file_category_id = fc.id WHERE f.user_id = $1`;
    const params = [tenantId];
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

//Get a file by fileId, tenantId, and property_owner_id

const getFileById = async (req, res) => {
  try {
    const { fileId, tenantId } = req.params;

    const property_owner_id = req.user.id;
    const link = await pool.query(
      "SELECT 1 FROM owner_tenant WHERE property_owner_id = $1 AND tenant_id = $2",
      [property_owner_id, tenantId]
    );
    if (link.rows.length === 0) {
      return res.status(403).json({
        status: "NAK",
        message: "You are not allowed to view this tenant's file",
      });
    }
    const file = await pool.query("SELECT * FROM files WHERE file_id = $1", [
      fileId,
    ]);
    if (file.rows.length === 0) {
      return res.status(404).json({
        status: "NAK",
        message: "File not found",
      });
    }
    res.json({ status: "AK", data: file.rows[0] });
  } catch (error) {
    console.error(error.message);
    res.status(500).json({ status: "NAK", message: "Error fetching file" });
  }
};

const updateTenantFile = async (req, res) => {
  try {
    const { fileId, tenantId } = req.params;
    const property_owner_id = req.user.id;
    const { mobile_number, file_category_id } = req.body;

    if (!req.files) {
      return res
        .status(400)
        .json({ status: "NAK", message: "No file provided for update." });
    }

    const link = await pool.query(
      "SELECT 1 FROM owner_tenant WHERE property_owner_id = $1 AND tenant_id = $2",
      [property_owner_id, tenantId]
    );
    if (link.rows.length === 0) {
      fs.unlinkSync(req.files[0].path);
      return res.status(403).json({
        status: "NAK",
        message: "You are not allowed to view this tenant's file",
      });
    }

    let query = `
        SELECT f.*
        FROM files f
        JOIN user_details ud ON f.user_id = ud.user_id
        WHERE f.file_id = $1`;
    const params = [fileId];
    console.log("Params:", params);
    let paramIndex = 2;

    if (mobile_number) {
      query += ` AND ud.mobile_number = $${paramIndex}`;
      params.push(mobile_number);
      paramIndex++;
    }

    if (file_category_id) {
      query += ` AND f.file_category_id = $${paramIndex}`;
      params.push(file_category_id);
      paramIndex++;
    }

    if (tenantId) {
      query += ` AND f.user_id = $${paramIndex}`;
      params.push(tenantId);
    }
    const result = await pool.query(query, params);

    if (result.rows.length === 0) {
      //fs.unlinkSync(req.files[0].path); // Clean up temp file
      return res.status(404).json({
        status: "NAK",
        message: "Existing file not found",
      });
    }

    console.log(result.rows);
    const oldFilePath = result.rows[0].file_path;

    // Start a database transaction
    try {
      await pool.query("BEGIN");

      const categoryRes = await pool.query(
        `SELECT name FROM file_categories WHERE id = $1`,
        [file_category_id]
      );

      const newTenantDetails = await pool.query(
        `SELECT first_name, mobile_number FROM user_details WHERE user_id = $1`,
        [tenantId]
      );

      const file = req.files[0];
      const ext = path.extname(file.originalname);
      const categoryName = categoryRes.rows[0]?.name || "uncategorized";
      const tenantFirstName = newTenantDetails.rows[0].first_name || "tenant";
      const tenantMobile = newTenantDetails.rows[0].mobile_number || "unknown";
      const newFilename = `${tenantFirstName}_${categoryName}_${Date.now()}${ext}`;

      const uploadDir = path.join("uploads", tenantMobile);

      const newPath = path.join(uploadDir, newFilename);

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
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
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

const deleteTenantFile = async (req, res) => {
  try {
    const { fileId, tenantId } = req.params;
    const { mobile_number, file_category_id } = req.body;
    const property_owner_id = req.user.id;

    // Verify ownership
    const link = await pool.query(
      "SELECT 1 FROM owner_tenant WHERE property_owner_id = $1 AND tenant_id = $2",
      [property_owner_id, tenantId]
    );
    if (link.rows.length === 0) {
      return res.status(403).json({
        status: "NAK",
        message: "You are not allowed to delete this tenant",
      });
    }

    let query = `
      SELECT f.*
      FROM files f
      JOIN user_details ud ON f.user_id = ud.user_id
      WHERE f.file_id = $1`;
    const params = [fileId];

    let paramIndex = 2;

    if (mobile_number) {
      query += ` AND ud.mobile_number = $${paramIndex}`;
      params.push(mobile_number);
      paramIndex++;
    }

    if (file_category_id) {
      query += ` AND f.file_category_id = $${paramIndex}`;
      params.push(file_category_id);
      paramIndex++;
    }

    if (tenantId) {
      query += ` AND f.user_id = $${paramIndex}`;
      params.push(tenantId);
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
      const parentDir = path.dirname(oldFilePath);
      const remainingFiles = fs.readdirSync(parentDir);
      if (remainingFiles.length === 0) {
        fs.rmdirSync(parentDir);
      }
      await pool.query("DELETE FROM files WHERE file_id = $1", [fileId]);
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

const deleteTenant = async (req, res) => {
  try {
    const { tenantId } = req.params;
    const property_owner_id = req.user.id;

    // Verify ownership
    const link = await pool.query(
      "SELECT 1 FROM owner_tenant WHERE property_owner_id = $1 AND tenant_id = $2",
      [property_owner_id, tenantId]
    );
    if (link.rows.length === 0) {
      return res.status(403).json({
        status: "NAK",
        message: "You are not allowed to delete this tenant",
      });
    }

    // Fetch tenant info
    const tenant = await pool.query(
      `SELECT u.user_id, ud.mobile_number
         FROM users u
         JOIN user_details ud ON u.user_id = ud.user_id
         WHERE u.user_id = $1`,
      [tenantId]
    );

    if (tenant.rows.length === 0) {
      return res.status(404).json({
        status: "NAK",
        message: "Tenant not found",
      });
    }

    const mobileNumber = tenant.rows[0].mobile_number;
    const tenantDir = `uploads/${mobileNumber}`;

    // Delete tenant from database (cascades to other related tables)
    await pool.query("DELETE FROM users WHERE user_id = $1", [tenantId]);

    // Delete tenant directory and its contents (if it exists)
    if (fs.existsSync(tenantDir)) {
      fs.rmSync(tenantDir, { recursive: true, force: true }); // removes all files/folders inside
    }

    res.json({
      status: "AK",
      message: "Tenant records and files deleted successfully",
    });
  } catch (error) {
    console.error("Error deleting tenant:", error.message);
    res.status(500).json({ status: "NAK", message: "Error deleting tenant" });
  }
};

module.exports = {
  createTenant,
  getTenantsByPropertyOwnerId,
  getTenant,
  updateTenantDetails,
  updateTenantAddress,
  uploadFilesForTenant,
  getTenantFiles,
  getFileById,
  updateTenantFile,
  deleteTenantFile,
  deleteTenant,
};
