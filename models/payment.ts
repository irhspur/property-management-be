import pool from '../config/database';
import { Payment, PaymentFields, DbClient } from '../types';

const FULL_SELECT = `SELECT
  p.payment_id, p.payment_reference, p.agreement_id,
  p.payment_purpose_id, pp.payment_purpose,
  p.payment_method_id, pm.payment_method,
  p.amount, p.paid_on, p.covers_period_start, p.remarks,
  p.created_at, p.updated_at
FROM payments p
JOIN payment_purpose pp ON p.payment_purpose_id = pp.id
JOIN payment_method pm ON p.payment_method_id = pm.id`;

export const findById = async (
  id: string,
  client: DbClient = pool
): Promise<Record<string, any> | null> => {
  const { rows } = await client.query(`${FULL_SELECT} WHERE p.payment_id = $1`, [id]);
  return rows[0] || null;
};

export const findByAgreement = async (agreementId: string): Promise<Record<string, any>[]> => {
  const { rows } = await pool.query(
    `${FULL_SELECT} WHERE p.agreement_id = $1 ORDER BY p.paid_on DESC, p.created_at DESC`,
    [agreementId]
  );
  return rows;
};

export const create = async (f: PaymentFields, client: DbClient = pool): Promise<Payment> => {
  const { rows } = await client.query<Payment>(
    `INSERT INTO payments (
      agreement_id, payment_purpose_id, payment_method_id, amount, paid_on, covers_period_start, remarks
    ) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
    [
      f.agreement_id,
      f.payment_purpose_id,
      f.payment_method_id,
      f.amount,
      f.paid_on,
      f.covers_period_start ?? null,
      f.remarks ?? null,
    ]
  );
  return rows[0];
};

export const update = async (
  id: string,
  f: PaymentFields,
  client: DbClient = pool
): Promise<Payment | null> => {
  const { rows } = await client.query<Payment>(
    `UPDATE payments SET
      payment_purpose_id = $1, payment_method_id = $2, amount = $3,
      paid_on = $4, covers_period_start = $5, remarks = $6, updated_at = NOW()
    WHERE payment_id = $7 RETURNING *`,
    [f.payment_purpose_id, f.payment_method_id, f.amount, f.paid_on, f.covers_period_start ?? null, f.remarks ?? null, id]
  );
  return rows[0] || null;
};

export const deleteById = async (id: string, client: DbClient = pool): Promise<Payment | null> => {
  const { rows } = await client.query<Payment>(
    'DELETE FROM payments WHERE payment_id = $1 RETURNING *',
    [id]
  );
  return rows[0] || null;
};

// Ledger (CONTEXT.md "Ledger"): a Property Owner's cash-flow view across all
// their Agreements, filtered and sorted on paid_on — not covers_period_start,
// which is the Payment Statement's concern (grill session 2026-08-22, Q19).
const LEDGER_SELECT = `SELECT
  p.payment_id, p.payment_reference, p.agreement_id,
  p.payment_purpose_id, pp.payment_purpose,
  p.payment_method_id, pm.payment_method,
  p.amount, p.paid_on, p.covers_period_start, p.remarks,
  p.created_at, p.updated_at,
  a.property_id, a.tenant_id,
  prop.property_name,
  ud.first_name AS tenant_first_name, ud.last_name AS tenant_last_name
FROM payments p
JOIN agreements a ON p.agreement_id = a.agreement_id
JOIN properties prop ON a.property_id = prop.property_id
LEFT JOIN user_details ud ON a.tenant_id = ud.user_id
JOIN payment_purpose pp ON p.payment_purpose_id = pp.id
JOIN payment_method pm ON p.payment_method_id = pm.id`;

export interface LedgerFilters {
  propertyId?: string;
  tenantId?: string;
  from?: string; // AD 'YYYY-MM-DD', inclusive, filters on paid_on
  to?: string;
}

const buildLedgerFilter = (ownerId: string, f: LedgerFilters): { clause: string; params: any[] } => {
  const params: any[] = [ownerId];
  let clause = 'WHERE prop.user_id = $1';
  if (f.propertyId) {
    params.push(f.propertyId);
    clause += ` AND a.property_id = $${params.length}`;
  }
  if (f.tenantId) {
    params.push(f.tenantId);
    clause += ` AND a.tenant_id = $${params.length}`;
  }
  if (f.from) {
    params.push(f.from);
    clause += ` AND p.paid_on >= $${params.length}`;
  }
  if (f.to) {
    params.push(f.to);
    clause += ` AND p.paid_on <= $${params.length}`;
  }
  return { clause, params };
};

export const findLedgerPage = async (
  ownerId: string,
  f: LedgerFilters,
  limit: number,
  offset: number
): Promise<{ rows: Record<string, any>[]; total: number }> => {
  const { clause, params } = buildLedgerFilter(ownerId, f);
  const countResult = await pool.query<{ total: string }>(
    `SELECT COUNT(*)::int AS total
     FROM payments p
     JOIN agreements a ON p.agreement_id = a.agreement_id
     JOIN properties prop ON a.property_id = prop.property_id
     ${clause}`,
    params
  );
  const { rows } = await pool.query(
    `${LEDGER_SELECT} ${clause}
     ORDER BY p.paid_on DESC, p.created_at DESC
     LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
    [...params, limit, offset]
  );
  return { rows, total: Number(countResult.rows[0].total) };
};

// ?all=true export path (Q17): same filters, no pagination, hard-capped so a
// client can't pull the whole table. CSV rendering happens client-side from
// this JSON — no server-side file generation (Q17).
export const findLedgerAll = async (
  ownerId: string,
  f: LedgerFilters,
  cap: number
): Promise<Record<string, any>[]> => {
  const { clause, params } = buildLedgerFilter(ownerId, f);
  const { rows } = await pool.query(
    `${LEDGER_SELECT} ${clause} ORDER BY p.paid_on DESC, p.created_at DESC LIMIT $${params.length + 1}`,
    [...params, cap]
  );
  return rows;
};

// Coupled to data/payment_purpose.csv seed order (id 1 = rent) — same
// posture as paymentService.ts's RENT_PURPOSE_ID.
const RENT_PURPOSE_ID = 1;

export const findRentSummary = async (
  ownerId: string,
  f: LedgerFilters
): Promise<{ total: number; monthly: { month: string; total: number }[] }> => {
  const { clause, params } = buildLedgerFilter(ownerId, f);
  const rentClause = `${clause} AND p.payment_purpose_id = ${RENT_PURPOSE_ID}`;

  const totalResult = await pool.query<{ total: string }>(
    `SELECT COALESCE(SUM(p.amount), 0)::numeric AS total
     FROM payments p
     JOIN agreements a ON p.agreement_id = a.agreement_id
     JOIN properties prop ON a.property_id = prop.property_id
     ${rentClause}`,
    params
  );
  const monthlyResult = await pool.query<{ month: string; total: string }>(
    `SELECT to_char(p.paid_on, 'YYYY-MM') AS month, SUM(p.amount)::numeric AS total
     FROM payments p
     JOIN agreements a ON p.agreement_id = a.agreement_id
     JOIN properties prop ON a.property_id = prop.property_id
     ${rentClause}
     GROUP BY 1 ORDER BY 1`,
    params
  );
  return {
    total: Number(totalResult.rows[0].total),
    monthly: monthlyResult.rows.map((r) => ({ month: r.month, total: Number(r.total) })),
  };
};

// Guards property deletion (grill session 2026-08-22): a vacant property can
// still have ended Agreements carrying real payment history, which deleting
// the property would cascade away.
export const existsForProperty = async (propertyId: string, client: DbClient = pool): Promise<boolean> => {
  const { rows } = await client.query(
    `SELECT 1 FROM payments pay
     JOIN agreements a ON pay.agreement_id = a.agreement_id
     WHERE a.property_id = $1 LIMIT 1`,
    [propertyId]
  );
  return rows.length > 0;
};
