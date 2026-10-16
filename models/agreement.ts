import pool from '../config/database';
import { Agreement, AgreementFields, AgreementRow, DbClient } from '../types';
import { sqlBusinessDate } from '../utils/businessDate';

// BsDate for an AD date column, or NULL when the column is NULL or outside the
// seeded calendar — the same lookup as utils/nepaliCalendar.ts toBs(), done in
// SQL so a list costs one query rather than one per row.
const bsDate = (column: string, alias: string): { select: string; join: string } => ({
  select: `CASE WHEN ${alias}.in_range THEN ${alias}.v END AS ${alias}`,
  join: `LEFT JOIN LATERAL (
  SELECT json_build_object(
           'bs_year', bm.bs_year, 'bs_month', bm.bs_month, 'month_name', bm.month_name,
           'day', (${column} - bm.ad_start_date + 1)
         ) AS v,
         (${column} - bm.ad_start_date + 1) <= bm.days AS in_range
  FROM bs_month bm
  WHERE bm.ad_start_date <= ${column}
  ORDER BY bm.ad_start_date DESC
  LIMIT 1
) ${alias} ON TRUE`,
});

const START_BS = bsDate('a.start_date', 'start_date_bs');
const END_BS = bsDate('a.end_date', 'end_date_bs');

const FULL_COLUMNS = `
  a.agreement_id, a.agreement_reference, a.property_id, a.tenant_id,
  a.start_date, a.end_date, ${START_BS.select}, ${END_BS.select},
  a.rent_amount, a.security_deposit, a.advance_amount,
  a.agreement_duration_id, ad.duration_in_years AS agreement_duration_in_years,
  a.payment_period_id, pp.payment_period,
  a.increment_duration_id, incd.increment_duration_in_years,
  a.increment_percentage_id, ip.increment_percentage,
  a.status, a.ended_at, a.created_at, a.updated_at,
  p.property_name, p.user_id AS property_owner_id,
  ud.first_name AS tenant_first_name, ud.last_name AS tenant_last_name,
  ud.mobile_number AS tenant_mobile_number`;

const FULL_JOINS = `
FROM agreements a
JOIN properties p ON a.property_id = p.property_id
JOIN agreement_duration ad ON a.agreement_duration_id = ad.id
JOIN payment_period pp ON a.payment_period_id = pp.id
LEFT JOIN increment_duration incd ON a.increment_duration_id = incd.id
LEFT JOIN increment_percentage ip ON a.increment_percentage_id = ip.id
LEFT JOIN user_details ud ON a.tenant_id = ud.user_id
${START_BS.join}
${END_BS.join}`;

const FULL_SELECT = `SELECT ${FULL_COLUMNS} ${FULL_JOINS}`;

// FULL_SELECT plus the records the Agreement Details page shows, so it needs
// no follow-up property or tenant fetch. profile_photo_path is swapped for a
// signed URL in the service and never leaves the server.
const DETAIL_SELECT = `SELECT ${FULL_COLUMNS},
  pt.name AS property_type, p.street_name, p.ward_number,
  m.name AS municipality, d.name AS district, pr.name AS province,
  tu.email AS tenant_email, tu.profile_photo_path AS tenant_profile_photo_path,
  od.first_name AS owner_first_name, od.last_name AS owner_last_name,
  NULLIF(concat_ws(' ', cd.first_name, cd.last_name), '') AS created_by_name,
  NULLIF(concat_ws(' ', upd.first_name, upd.last_name), '') AS updated_by_name
${FULL_JOINS}
LEFT JOIN property_types pt ON p.property_type_id = pt.id
LEFT JOIN municipality m ON p.municipality_id = m.id
LEFT JOIN district d ON p.district_id = d.id
LEFT JOIN province pr ON p.province_id = pr.id
LEFT JOIN users tu ON a.tenant_id = tu.user_id
LEFT JOIN user_details od ON p.user_id = od.user_id
LEFT JOIN user_details cd ON a.created_by = cd.user_id
LEFT JOIN user_details upd ON a.updated_by = upd.user_id`;

export const findById = async (id: string): Promise<AgreementRow | null> => {
  const { rows } = await pool.query(`${FULL_SELECT} WHERE a.agreement_id = $1`, [id]);
  return rows[0] || null;
};

export const findDetailById = async (id: string): Promise<AgreementRow | null> => {
  const { rows } = await pool.query(`${DETAIL_SELECT} WHERE a.agreement_id = $1`, [id]);
  return rows[0] || null;
};

export const findActiveByProperty = async (
  propertyId: string,
  client: DbClient = pool
): Promise<Agreement | null> => {
  const { rows } = await client.query<Agreement>(
    `SELECT * FROM agreements WHERE property_id = $1 AND status = 'active'`,
    [propertyId]
  );
  return rows[0] || null;
};

export const findActiveByTenant = async (
  tenantId: string,
  client: DbClient = pool
): Promise<Agreement | null> => {
  const { rows } = await client.query<Agreement>(
    `SELECT * FROM agreements WHERE tenant_id = $1 AND status = 'active'`,
    [tenantId]
  );
  return rows[0] || null;
};

export interface AgreementFilters {
  status?: 'active' | 'ended' | 'expiring';
  // Required with status 'expiring': active and end_date on or before it.
  expiringOnOrBefore?: string;
  endingBefore?: string; // AD 'YYYY-MM-DD', exclusive; agreements with no end_date never match
  propertyId?: string;
  tenantId?: string;
  q?: string;
}

export type AgreementSort = 'newest' | 'ending_soonest';

const escapeLike = (v: string): string => v.replace(/[\\%_]/g, (c) => `\\${c}`);

// "AGR-42", "#AGR-42" or "42" -> "42"; null if q isn't a reference.
const referenceIn = (q: string): string | null => {
  const m = q.trim().match(/^#?(?:agr-?)?(\d{1,18})$/i);
  return m ? m[1] : null;
};

// WHERE clause over the aliases a, p and ud, with params from $1 (the owner).
const buildFilter = (ownerId: string, f: AgreementFilters): { clause: string; params: unknown[] } => {
  const params: unknown[] = [ownerId];
  const conds = ['p.user_id = $1'];
  const add = (value: unknown): string => {
    params.push(value);
    return `$${params.length}`;
  };
  if (f.status === 'expiring') {
    conds.push(`a.status = 'active' AND a.end_date <= ${add(f.expiringOnOrBefore)}::date`);
  } else if (f.status) {
    conds.push(`a.status = ${add(f.status)}`);
  }
  if (f.endingBefore) conds.push(`a.end_date < ${add(f.endingBefore)}`);
  if (f.propertyId) conds.push(`a.property_id = ${add(f.propertyId)}`);
  if (f.tenantId) conds.push(`a.tenant_id = ${add(f.tenantId)}`);
  if (f.q) {
    const like = add(`%${escapeLike(f.q)}%`);
    const matches = [
      `p.property_name ILIKE ${like}`,
      `concat_ws(' ', ud.first_name, ud.last_name) ILIKE ${like}`,
      `ud.mobile_number ILIKE ${like}`,
    ];
    const ref = referenceIn(f.q);
    if (ref) matches.push(`a.agreement_reference = ${add(ref)}::bigint`);
    conds.push(`(${matches.join(' OR ')})`);
  }
  return { clause: `WHERE ${conds.join(' AND ')}`, params };
};

const ORDER_BY: Record<AgreementSort, string> = {
  newest: 'a.created_at DESC, a.agreement_id',
  ending_soonest: 'a.end_date ASC NULLS LAST, a.created_at DESC, a.agreement_id',
};

// List rows add what the agreements table shows under each row.
// tenant_profile_photo_path is swapped for a signed URL in the service.
const LIST_SELECT = `SELECT ${FULL_COLUMNS},
  pt.name AS property_type, m.name AS municipality, d.name AS district,
  tu.profile_photo_path AS tenant_profile_photo_path
${FULL_JOINS}
LEFT JOIN property_types pt ON p.property_type_id = pt.id
LEFT JOIN municipality m ON p.municipality_id = m.id
LEFT JOIN district d ON p.district_id = d.id
LEFT JOIN users tu ON a.tenant_id = tu.user_id`;

export const findByOwner = async (
  ownerId: string,
  f: AgreementFilters = {},
  page: { sort?: AgreementSort; limit?: number; offset?: number } = {}
): Promise<AgreementRow[]> => {
  const { clause, params } = buildFilter(ownerId, f);
  let sql = `${LIST_SELECT} ${clause} ORDER BY ${ORDER_BY[page.sort ?? 'newest']}`;
  if (page.limit !== undefined) {
    params.push(page.limit, page.offset ?? 0);
    sql += ` LIMIT $${params.length - 1} OFFSET $${params.length}`;
  }
  const { rows } = await pool.query(sql, params);
  return rows;
};

// A Tenant's own Agreements, for the tenant portal: active first, then the
// most recently ended. Same row as findByOwner.
export const findByTenant = async (tenantId: string): Promise<AgreementRow[]> => {
  const { rows } = await pool.query(
    `${LIST_SELECT} WHERE a.tenant_id = $1
     ORDER BY (a.status = 'active') DESC, COALESCE(a.ended_at, a.end_date, a.updated_at) DESC, a.agreement_id`,
    [tenantId]
  );
  return rows;
};

export const countByOwner = async (ownerId: string, f: AgreementFilters = {}): Promise<number> => {
  const { clause, params } = buildFilter(ownerId, f);
  const { rows } = await pool.query(
    `SELECT COUNT(*)::int AS total
     FROM agreements a
     JOIN properties p ON a.property_id = p.property_id
     LEFT JOIN user_details ud ON a.tenant_id = ud.user_id
     ${clause}`,
    params
  );
  return rows[0].total;
};

export const findByProperty = async (propertyId: string): Promise<AgreementRow[]> => {
  const { rows } = await pool.query(
    `${FULL_SELECT} WHERE a.property_id = $1 ORDER BY a.created_at DESC`,
    [propertyId]
  );
  return rows;
};

// Dashboard and agreements-list counters. Ending is an explicit action, so an
// active Agreement whose end_date has already passed still counts as
// "ending" — it is the most urgent kind. Matches ?status=expiring.
// added_in_period counts created_at by Kathmandu date.
export const countsByOwner = async (
  ownerId: string,
  endingOnOrBefore: string,
  period: { from: string; to: string }
): Promise<{
  total: number;
  added_in_period: number;
  active: number;
  active_tenants: number;
  ending_soon: number;
  security_deposit_total: number;
}> => {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*)::int AS total,
       COUNT(*) FILTER (WHERE ${sqlBusinessDate('a.created_at')} BETWEEN $3::date AND $4::date)::int AS added_in_period,
       COUNT(*) FILTER (WHERE a.status = 'active')::int AS active,
       COUNT(DISTINCT a.tenant_id) FILTER (WHERE a.status = 'active')::int AS active_tenants,
       COUNT(*) FILTER (WHERE a.status = 'active' AND a.end_date <= $2::date)::int AS ending_soon,
       COALESCE(SUM(a.security_deposit) FILTER (WHERE a.status = 'active'), 0)::float8 AS security_deposit_total
     FROM agreements a
     JOIN properties p ON a.property_id = p.property_id
     WHERE p.user_id = $1`,
    [ownerId, endingOnOrBefore, period.from, period.to]
  );
  return rows[0];
};

export const create = async (
  f: AgreementFields,
  createdBy: string,
  client: DbClient = pool
): Promise<Agreement> => {
  const { rows } = await client.query<Agreement>(
    `INSERT INTO agreements (
      property_id, tenant_id, start_date, end_date,
      rent_amount, security_deposit, advance_amount,
      agreement_duration_id, payment_period_id,
      increment_duration_id, increment_percentage_id,
      created_by, updated_by
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12) RETURNING *`,
    [
      f.property_id, f.tenant_id, f.start_date, f.end_date,
      f.rent_amount, f.security_deposit, f.advance_amount,
      f.agreement_duration_id, f.payment_period_id,
      f.increment_duration_id, f.increment_percentage_id,
      createdBy,
    ]
  );
  return rows[0];
};

export const end = async (
  id: string,
  endedBy: string,
  client: DbClient = pool
): Promise<Agreement | null> => {
  const { rows } = await client.query<Agreement>(
    `UPDATE agreements SET
      status = 'ended', end_date = COALESCE(end_date, CURRENT_DATE),
      ended_at = NOW(), updated_at = NOW(), updated_by = $2
    WHERE agreement_id = $1 AND status = 'active' RETURNING *`,
    [id, endedBy]
  );
  return rows[0] || null;
};
