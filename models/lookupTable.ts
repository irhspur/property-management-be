// SQL for the lookup tables (CONTEXT.md "Lookup table"). Table and column
// names come only from the fixed descriptions in services/lookupTables.ts —
// never from a request — so splicing them into SQL is safe. Values are always
// bound parameters.
import pool from '../config/database';
import { DbClient } from '../types';

export interface Column {
  name: string;
  // SQL applied to the bound value on write, e.g. INITCAP($n).
  transform?: 'initcap' | 'upper';
}

const wrap = (c: Column, param: string): string =>
  c.transform === 'initcap' ? `INITCAP(${param})` : c.transform === 'upper' ? `UPPER(${param})` : param;

// Ids are compared as bigint: several tables use smallint ids, and an id past
// that range should be "not found", not a Postgres out-of-range error.
export const findAll = async (table: string, where?: { column: string; value: unknown }): Promise<Record<string, any>[]> => {
  const { rows } = where
    ? await pool.query(`SELECT * FROM ${table} WHERE ${where.column} = $1::bigint ORDER BY id`, [where.value])
    : await pool.query(`SELECT * FROM ${table} ORDER BY id`);
  return rows;
};

export const findById = async (table: string, id: number, client: DbClient = pool): Promise<Record<string, any> | null> => {
  const { rows } = await client.query(`SELECT * FROM ${table} WHERE id = $1::bigint`, [id]);
  return rows[0] || null;
};

// Is `value` already taken in `column` — case-insensitively for text — within
// `scope` (a parent column) if given, ignoring row `exceptId`?
export const isTaken = async (
  table: string,
  column: string,
  value: unknown,
  opts: { text: boolean; scope?: { column: string; value: unknown }; exceptId?: number }
): Promise<boolean> => {
  const params: unknown[] = [value];
  let sql = opts.text
    ? `SELECT 1 FROM ${table} WHERE lower(${column}::text) = lower($1)`
    : `SELECT 1 FROM ${table} WHERE ${column} = $1`;
  if (opts.scope) {
    params.push(opts.scope.value);
    sql += ` AND ${opts.scope.column} = $${params.length}`;
  }
  if (opts.exceptId !== undefined) {
    params.push(opts.exceptId);
    sql += ` AND id <> $${params.length}::bigint`;
  }
  const { rows } = await pool.query(`${sql} LIMIT 1`, params);
  return rows.length > 0;
};

export const insert = async (
  table: string,
  values: { column: Column; value: unknown }[]
): Promise<Record<string, any>> => {
  const columns = values.map((v) => v.column.name).join(', ');
  const params = values.map((v, i) => wrap(v.column, `$${i + 1}`)).join(', ');
  const { rows } = await pool.query(
    `INSERT INTO ${table} (${columns}) VALUES (${params}) RETURNING *`,
    values.map((v) => v.value)
  );
  return rows[0];
};

export const update = async (
  table: string,
  id: number,
  values: { column: Column; value: unknown }[],
  timestamps: boolean
): Promise<Record<string, any> | null> => {
  const sets = values.map((v, i) => `${v.column.name} = ${wrap(v.column, `$${i + 1}`)}`);
  if (timestamps) sets.push('updated_at = NOW()');
  const { rows } = await pool.query(
    `UPDATE ${table} SET ${sets.join(', ')} WHERE id = $${values.length + 1}::bigint RETURNING *`,
    [...values.map((v) => v.value), id]
  );
  return rows[0] || null;
};

export const deleteById = async (table: string, id: number): Promise<boolean> => {
  const { rowCount } = await pool.query(`DELETE FROM ${table} WHERE id = $1::bigint`, [id]);
  return (rowCount ?? 0) > 0;
};

// Every row elsewhere that points at this one, per referencing table, read
// from Postgres's own foreign keys so a new reference is covered without
// anyone listing it.
export const countReferences = async (table: string, id: number): Promise<{ table: string; count: number }[]> => {
  const { rows: refs } = await pool.query<{ ref_table: string; ref_column: string }>(
    `SELECT c.conrelid::regclass::text AS ref_table, a.attname AS ref_column
     FROM pg_constraint c
     JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = c.conkey[1]
     WHERE c.contype = 'f' AND c.confrelid = $1::regclass`,
    [table]
  );
  const counts: { table: string; count: number }[] = [];
  for (const r of refs) {
    const { rows } = await pool.query<{ n: number }>(
      `SELECT count(*)::int AS n FROM ${r.ref_table} WHERE ${r.ref_column} = $1::bigint`,
      [id]
    );
    if (rows[0].n > 0) counts.push({ table: r.ref_table, count: rows[0].n });
  }
  return counts;
};
