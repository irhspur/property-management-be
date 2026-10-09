import pool from "../config/database";
import { DbClient } from "../types";
import { sqlBusinessDate } from "../utils/businessDate";

export const findLinkedTenant = async (
  ownerId: string,
  tenantId: string,
  client: DbClient = pool,
): Promise<Record<string, any> | null> => {
  const { rows } = await client.query(
    `SELECT ot.tenant_id, ud.first_name, ud.last_name, ud.mobile_number
     FROM owner_tenant ot
     LEFT JOIN user_details ud ON ud.user_id = ot.tenant_id
     WHERE ot.property_owner_id = $1 AND ot.tenant_id = $2`,
    [ownerId, tenantId],
  );
  return rows[0] || null;
};

export const assertUserIsTenant = async (
  tenantId: string,
  client: DbClient = pool,
): Promise<void> => {
  const result = await client.query(
    "SELECT 1 FROM users WHERE user_id = $1 AND user_type_id = 3",
    [tenantId],
  );
  if ((result.rowCount ?? 0) === 0) throw new Error("Not a valid tenant user");
};

export const link = async (
  ownerId: string,
  tenantId: string,
  client: DbClient = pool,
): Promise<void> => {
  await client.query(
    `INSERT INTO owner_tenant (property_owner_id, tenant_id) VALUES ($1, $2) ON CONFLICT DO NOTHING`,
    [ownerId, tenantId],
  );
};

// The Agreement a tenant row summarises (My Tenants spec): the active one if
// any, else the most recently ended. Only Agreements on the owner's own
// Properties count. A tenant has at most one active Agreement
// (agreements_one_active_per_tenant), so the active branch never has to choose.
// `expiring` is the dashboard's ending_within_30_days rule: active and
// end_date on or before $2, including dates already passed. Needs the owner as
// $1 and that boundary date as $2.
const TENANCY_JOIN = `LEFT JOIN LATERAL (
      SELECT ag.agreement_id, ag.property_id, pp.property_name,
             pm.name AS municipality, pd.name AS district,
             to_char(ag.start_date, 'YYYY-MM-DD') AS start_date,
             to_char(ag.end_date, 'YYYY-MM-DD') AS end_date,
             CASE
               WHEN ag.status <> 'active' THEN 'ended'
               WHEN ag.end_date <= $2::date THEN 'expiring'
               ELSE 'active'
             END AS status
      FROM agreements ag
      JOIN properties pp ON pp.property_id = ag.property_id
      LEFT JOIN municipality pm ON pm.id = pp.municipality_id
      LEFT JOIN district pd ON pd.id = pp.district_id
      WHERE ag.tenant_id = ot.tenant_id AND pp.user_id = $1
      ORDER BY (ag.status = 'active') DESC,
               COALESCE(ag.end_date::timestamp, ag.updated_at) DESC
      LIMIT 1
    ) t ON true`;

const TENANCY_COLUMN = `CASE WHEN t.agreement_id IS NULL THEN NULL ELSE json_build_object(
        'status', t.status,
        'agreement_id', t.agreement_id,
        'property_id', t.property_id,
        'property_name', t.property_name,
        'municipality', t.municipality,
        'district', t.district,
        'start_date', t.start_date,
        'end_date', t.end_date
      ) END AS tenancy`;

export type TenancyStatus = 'active' | 'expiring' | 'ended' | 'none';

export interface TenantListFilters {
  q?: string;
  status?: TenancyStatus;
}

const escapeLike = (v: string): string => v.replace(/[\\%_]/g, (c) => `\\${c}`);

// WHERE clause over the list's aliases (ot, u, ud, t). Params continue after
// the owner ($1) and the expiring boundary ($2).
const buildTenantFilter = (f: TenantListFilters): { clause: string; params: unknown[] } => {
  const conds = ['ot.property_owner_id = $1'];
  const params: unknown[] = [];
  if (f.q) {
    params.push(`%${escapeLike(f.q)}%`);
    const p = `$${params.length + 2}`;
    conds.push(`(
      concat_ws(' ', ud.first_name, ud.last_name) ILIKE ${p}
      OR concat_ws(' ', ud.first_name, ud.middle_name, ud.last_name) ILIKE ${p}
      OR u.email ILIKE ${p}
      OR ud.mobile_number ILIKE ${p}
      OR t.property_name ILIKE ${p}
    )`);
  }
  if (f.status === 'none') {
    conds.push('t.agreement_id IS NULL');
  } else if (f.status) {
    params.push(f.status);
    conds.push(`t.status = $${params.length + 2}`);
  }
  return { clause: `WHERE ${conds.join(' AND ')}`, params };
};

const TENANT_LIST_SELECT = `SELECT
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
      u.is_verified, u.is_active, u.created_at, ot.created_at AS linked_at,
      u.profile_photo_path,
      ${TENANCY_COLUMN}
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
    ${TENANCY_JOIN}`;

const TENANT_LIST_ORDER = 'ORDER BY ot.created_at DESC, ot.tenant_id';

// Without a page, the full matching list (the original response). `expiringOnOrBefore`
// is the Kathmandu date 30 days out.
export const findTenantsByOwner = async (
  ownerId: string,
  expiringOnOrBefore: string,
  f: TenantListFilters = {},
): Promise<Record<string, any>[]> => {
  const { clause, params } = buildTenantFilter(f);
  const { rows } = await pool.query(
    `${TENANT_LIST_SELECT}\n    ${clause}\n    ${TENANT_LIST_ORDER}`,
    [ownerId, expiringOnOrBefore, ...params],
  );
  return rows;
};

export const findTenantsPageByOwner = async (
  ownerId: string,
  expiringOnOrBefore: string,
  f: TenantListFilters,
  limit: number,
  offset: number,
): Promise<{ rows: Record<string, any>[]; total: number }> => {
  const { clause, params } = buildTenantFilter(f);
  const base = [ownerId, expiringOnOrBefore, ...params];
  const countResult = await pool.query<{ total: number }>(
    `SELECT COUNT(*)::int AS total
    FROM owner_tenant ot
    JOIN users u ON u.user_id = ot.tenant_id
    LEFT JOIN user_details ud ON ud.user_id = u.user_id
    ${TENANCY_JOIN}
    ${clause}`,
    base,
  );
  const { rows } = await pool.query(
    `${TENANT_LIST_SELECT}\n    ${clause}\n    ${TENANT_LIST_ORDER}
    LIMIT $${base.length + 1} OFFSET $${base.length + 2}`,
    [...base, limit, offset],
  );
  return { rows, total: countResult.rows[0].total };
};

export const findTenantByOwner = async (
  ownerId: string,
  tenantId: string,
  expiringOnOrBefore: string,
): Promise<Record<string, any> | null> => {
  const { rows } = await pool.query(
    `SELECT
      u.user_id,
      ud.first_name, ud.middle_name, ud.last_name,
      u.email,
      ud.gender_id, g.name AS gender,
      ud.dob,
      ud.country_id AS birth_country_id, c.name AS birth_country,
      ud.birth_district_id, d.name AS birth_district,
      ud.birth_province_id, p.name AS birth_province,
      ud.father_full_name, ud.nin_number, ud.mobile_number,
      ud.citizenship_number,
      ud.citizenship_issue_district_id, d2.name AS citizenship_issue_district,
      ud.citizenship_issue_date,
      ud.bank_account_number, ud.bank_name,
      a.country_id AS country_id, c1.name AS country,
      a.province_id, p1.name AS province,
      a.district_id AS district_id, d3.name AS district,
      a.municipality_id, m.name AS municipality,
      a.ward_number, a.street_name, a.house_number,
      a.contact_number_1, a.contact_number_2, a.contact_address,
      ut.name AS user_type,
      ud1.first_name AS associated_property_owner,
      u.is_verified, u.is_active, u.created_at,
      u.profile_photo_path,
      ${TENANCY_COLUMN}
    FROM users u
    JOIN user_details ud ON u.user_id = ud.user_id
    JOIN user_type ut ON u.user_type_id = ut.id
    LEFT JOIN gender g ON ud.gender_id = g.id
    LEFT JOIN country c ON ud.country_id = c.id
    LEFT JOIN district d ON ud.birth_district_id = d.id
    LEFT JOIN province p ON ud.birth_province_id = p.id
    LEFT JOIN district d2 ON ud.citizenship_issue_district_id = d2.id
    LEFT JOIN LATERAL (
      SELECT * FROM address WHERE user_id = u.user_id ORDER BY created_at DESC LIMIT 1
    ) a ON true
    LEFT JOIN country c1 ON a.country_id = c1.id
    LEFT JOIN province p1 ON a.province_id = p1.id
    LEFT JOIN district d3 ON a.district_id = d3.id
    LEFT JOIN municipality m ON a.municipality_id = m.id
    JOIN owner_tenant ot ON u.user_id = ot.tenant_id
    LEFT JOIN user_details ud1 ON ot.property_owner_id = ud1.user_id
    ${TENANCY_JOIN}
    WHERE ot.property_owner_id = $1 AND ot.tenant_id = $3`,
    [ownerId, expiringOnOrBefore, tenantId],
  );
  return rows[0] || null;
};

// Dashboard tenants.added_this_month: Ownership Links created in the period
// (Kathmandu date), with or without an Agreement — not the change in active
// tenants.
export const countLinkedInPeriod = async (
  ownerId: string,
  from: string,
  to: string,
): Promise<number> => {
  const { rows } = await pool.query<{ added: number }>(
    `SELECT COUNT(*)::int AS added
    FROM owner_tenant
    WHERE property_owner_id = $1
      AND ${sqlBusinessDate("created_at")} BETWEEN $2::date AND $3::date`,
    [ownerId, from, to],
  );
  return rows[0].added;
};
