const pool = require("../config/database");

const linkTenantToOwner = async (property_owner_id, tenant_id) => {
  const check = await pool.query(
    `SELECT 1 FROM users WHERE user_id = $1 AND user_type_id = 3`,
    [tenant_id]
  );
  if (check.rowCount === 0) {
    throw new Error("Not a valid tenant user");
  }

  await pool.query(
    `INSERT INTO owner_tenant (property_owner_id, tenant_id)
       VALUES ($1, $2)
       ON CONFLICT DO NOTHING`,
    [property_owner_id, tenant_id]
  );
};

module.exports = linkTenantToOwner;
