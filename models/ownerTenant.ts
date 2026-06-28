import pool from '../config/database';
import { DbClient } from '../types';

export const findLink = async (ownerId: number, tenantId: number, client: DbClient = pool): Promise<boolean> => {
  const { rows } = await client.query(
    'SELECT 1 FROM owner_tenant WHERE property_owner_id = $1 AND tenant_id = $2',
    [ownerId, tenantId]
  );
  return rows.length > 0;
};

export const assertUserIsTenant = async (tenantId: number, client: DbClient = pool): Promise<void> => {
  const result = await client.query(
    'SELECT 1 FROM users WHERE user_id = $1 AND user_type_id = 3',
    [tenantId]
  );
  if ((result.rowCount ?? 0) === 0) throw new Error('Not a valid tenant user');
};

export const link = async (ownerId: number, tenantId: number, client: DbClient = pool): Promise<void> => {
  await client.query(
    `INSERT INTO owner_tenant (property_owner_id, tenant_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [ownerId, tenantId]
  );
};

export const findTenantsByOwner = async (ownerId: number): Promise<Record<string, any>[]> => {
  const { rows } = await pool.query(
    `SELECT
      u.user_id AS tenant_id,
      ud.first_name, ud.middle_name, ud.last_name,
      u.email,
      ud.gender_id, g.name AS gender,
      ud.dob,
      ud.country_id AS birth_country_id, bc.name AS birth_country,
      ud.birth_district_id, bd.name AS birth_district,
      ud.birth_province_id, bp.name AS birth_province,
      ud.father_full_name, ud.nin_number, ud.mobile_number,
      ud.citizenship_number,
      ud.citizenship_issue_district_id, cd.name AS citizenship_issue_district,
      ud.citizenship_issue_date,
      ud.bank_account_number, ud.bank_name,
      a.country_id AS address_country_id, ac.name AS address_country,
      a.province_id, ap.name AS province,
      a.district_id AS address_district_id, ad.name AS address_district,
      a.municipality_id, m.name AS municipality,
      a.ward_number, a.street_name, a.house_number,
      a.contact_number_1, a.contact_number_2, a.contact_address,
      ut.name AS user_type,
      ud1.first_name AS associated_property_owner,
      u.is_verified, u.is_active, u.created_at, ot.created_at AS linked_at
    FROM owner_tenant ot
    JOIN users u ON u.user_id = ot.tenant_id
    LEFT JOIN user_details ud ON ud.user_id = u.user_id
    LEFT JOIN user_type ut ON u.user_type_id = ut.id
    LEFT JOIN gender g ON ud.gender_id = g.id
    LEFT JOIN country bc ON ud.country_id = bc.id
    LEFT JOIN district bd ON ud.birth_district_id = bd.id
    LEFT JOIN province bp ON ud.birth_province_id = bp.id
    LEFT JOIN district cd ON ud.citizenship_issue_district_id = cd.id
    LEFT JOIN LATERAL (
      SELECT * FROM address WHERE user_id = u.user_id ORDER BY created_at DESC LIMIT 1
    ) a ON true
    LEFT JOIN country ac ON a.country_id = ac.id
    LEFT JOIN province ap ON a.province_id = ap.id
    LEFT JOIN district ad ON a.district_id = ad.id
    LEFT JOIN municipality m ON a.municipality_id = m.id
    LEFT JOIN LATERAL (
      SELECT first_name FROM user_details WHERE user_id = ot.property_owner_id ORDER BY created_at DESC LIMIT 1
    ) ud1 ON true
    WHERE ot.property_owner_id = $1
    ORDER BY ot.created_at DESC`,
    [ownerId]
  );
  return rows;
};

export const findTenantByOwner = async (ownerId: number, tenantId: number): Promise<Record<string, any> | null> => {
  const { rows } = await pool.query(
    `SELECT
      u.user_id,
      ud.first_name, ud.middle_name, ud.last_name,
      u.email,
      ud.gender_id, g.name AS gender,
      ud.dob,
      ud.country_id AS birth_country_id, c.name AS country,
      ud.birth_district_id, d.name AS birth_district,
      ud.father_full_name, ud.nin_number, ud.mobile_number,
      ud.citizenship_number,
      ud.citizenship_issue_district_id, d2.name AS citizenship_issue_district,
      ud.citizenship_issue_date,
      ud.bank_account_number, ud.bank_name,
      a.country_id AS address_country_id, c1.name AS address_country,
      a.province_id, p.name AS province,
      a.district_id AS address_district_id, d3.name AS address_district,
      a.municipality_id, m.name AS municipality,
      a.ward_number, a.street_name, a.house_number,
      a.contact_number_1, a.contact_number_2, a.contact_address,
      ut.name AS user_type,
      ud1.first_name AS associated_property_owner,
      u.is_verified, u.is_active, u.created_at
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
    WHERE ot.property_owner_id = $1 AND ot.tenant_id = $2`,
    [ownerId, tenantId]
  );
  return rows[0] || null;
};
