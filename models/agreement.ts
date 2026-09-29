import pool from '../config/database';
import { Agreement, AgreementFields, DbClient } from '../types';

const FULL_SELECT = `SELECT
  a.agreement_id, a.property_id, a.tenant_id,
  a.start_date, a.end_date, a.rent_amount, a.security_deposit, a.advance_amount,
  a.agreement_duration_id, ad.duration_in_years AS agreement_duration_in_years,
  a.payment_period_id, pp.payment_period,
  a.increment_duration_id, incd.increment_duration_in_years,
  a.increment_percentage_id, ip.increment_percentage,
  a.status, a.created_at, a.updated_at,
  p.property_name, p.user_id AS property_owner_id,
  ud.first_name AS tenant_first_name, ud.last_name AS tenant_last_name,
  ud.mobile_number AS tenant_mobile_number
FROM agreements a
JOIN properties p ON a.property_id = p.property_id
JOIN agreement_duration ad ON a.agreement_duration_id = ad.id
JOIN payment_period pp ON a.payment_period_id = pp.id
LEFT JOIN increment_duration incd ON a.increment_duration_id = incd.id
LEFT JOIN increment_percentage ip ON a.increment_percentage_id = ip.id
LEFT JOIN user_details ud ON a.tenant_id = ud.user_id`;

export const findById = async (id: string): Promise<Record<string, any> | null> => {
  const { rows } = await pool.query(`${FULL_SELECT} WHERE a.agreement_id = $1`, [id]);
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
  status?: string;
  endingBefore?: string; // AD 'YYYY-MM-DD', exclusive; agreements with no end_date never match
  propertyId?: string;
  tenantId?: string;
}

export const findByOwner = async (
  ownerId: string,
  f: AgreementFilters = {}
): Promise<Record<string, any>[]> => {
  const params: any[] = [ownerId];
  let clause = 'WHERE p.user_id = $1';
  if (f.status) {
    params.push(f.status);
    clause += ` AND a.status = $${params.length}`;
  }
  if (f.endingBefore) {
    params.push(f.endingBefore);
    clause += ` AND a.end_date < $${params.length}`;
  }
  if (f.propertyId) {
    params.push(f.propertyId);
    clause += ` AND a.property_id = $${params.length}`;
  }
  if (f.tenantId) {
    params.push(f.tenantId);
    clause += ` AND a.tenant_id = $${params.length}`;
  }
  const { rows } = await pool.query(`${FULL_SELECT} ${clause} ORDER BY a.created_at DESC`, params);
  return rows;
};

export const findByOwnerAndTenant = async (
  ownerId: string,
  tenantId: string
): Promise<Record<string, any>[]> => {
  const { rows } = await pool.query(
    `${FULL_SELECT} WHERE p.user_id = $1 AND a.tenant_id = $2 ORDER BY a.created_at DESC`,
    [ownerId, tenantId]
  );
  return rows;
};

export const findByProperty = async (propertyId: string): Promise<Record<string, any>[]> => {
  const { rows } = await pool.query(
    `${FULL_SELECT} WHERE a.property_id = $1 ORDER BY a.created_at DESC`,
    [propertyId]
  );
  return rows;
};

// Dashboard counters (dashboard spec, P0). Ending is an explicit action, so an
// active Agreement whose end_date has already passed still counts as
// "ending" — it is the most urgent kind. Matches ?status=active&ending_before=.
export const countsByOwner = async (
  ownerId: string,
  endingOnOrBefore: string
): Promise<{ active: number; active_tenants: number; ending_soon: number }> => {
  const { rows } = await pool.query(
    `SELECT
       COUNT(*)::int AS active,
       COUNT(DISTINCT a.tenant_id)::int AS active_tenants,
       COUNT(*) FILTER (WHERE a.end_date <= $2::date)::int AS ending_soon
     FROM agreements a
     JOIN properties p ON a.property_id = p.property_id
     WHERE p.user_id = $1 AND a.status = 'active'`,
    [ownerId, endingOnOrBefore]
  );
  return rows[0];
};

export const create = async (f: AgreementFields, client: DbClient = pool): Promise<Agreement> => {
  const { rows } = await client.query<Agreement>(
    `INSERT INTO agreements (
      property_id, tenant_id, start_date, end_date,
      rent_amount, security_deposit, advance_amount,
      agreement_duration_id, payment_period_id,
      increment_duration_id, increment_percentage_id
    ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
    [
      f.property_id, f.tenant_id, f.start_date, f.end_date,
      f.rent_amount, f.security_deposit, f.advance_amount,
      f.agreement_duration_id, f.payment_period_id,
      f.increment_duration_id, f.increment_percentage_id,
    ]
  );
  return rows[0];
};

export const end = async (id: string, client: DbClient = pool): Promise<Agreement | null> => {
  const { rows } = await client.query<Agreement>(
    `UPDATE agreements SET
      status = 'ended', end_date = COALESCE(end_date, CURRENT_DATE), updated_at = NOW()
    WHERE agreement_id = $1 AND status = 'active' RETURNING *`,
    [id]
  );
  return rows[0] || null;
};
