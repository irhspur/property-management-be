import pool from '../config/database';
import { DbClient, Property, PropertyFields } from '../types';

const FULL_SELECT = `SELECT
  p.property_id, p.user_id,
  p.property_type_id, pt.name AS property_type,
  p.country_id, c.name AS country,
  p.province_id, pr.name AS province,
  p.district_id, d.name AS district,
  p.municipality_id, m.name AS municipality,
  p.ward_number, p.street_name, p.house_number,
  p.property_name, p.property_description, p.property_value,
  p.is_vacant, p.created_at, p.updated_at
FROM properties p
JOIN property_types pt ON p.property_type_id = pt.id
JOIN country c ON p.country_id = c.id
JOIN province pr ON p.province_id = pr.id
JOIN district d ON p.district_id = d.id
JOIN municipality m ON p.municipality_id = m.id`;

export const findByUserAndName = async (userId: string, name: string): Promise<boolean> => {
  const { rows } = await pool.query(
    `SELECT 1 FROM properties WHERE user_id = $1 AND property_name = INITCAP($2)`,
    [userId, name]
  );
  return rows.length > 0;
};

export const findByUserId = async (userId: string): Promise<Record<string, any>[]> => {
  const { rows } = await pool.query(`${FULL_SELECT} WHERE p.user_id = $1`, [userId]);
  return rows;
};

export const findById = async (id: string): Promise<Record<string, any> | null> => {
  const { rows } = await pool.query(`${FULL_SELECT} WHERE p.property_id = $1`, [id]);
  return rows[0] || null;
};

export const findByMobileNumber = async (mobile: string): Promise<Record<string, any>[]> => {
  const { rows } = await pool.query(
    `SELECT p.*, ud.mobile_number, ud.first_name, ud.last_name
    FROM properties p
    JOIN user_details ud ON p.user_id = ud.user_id
    WHERE ud.mobile_number = $1`,
    [mobile]
  );
  return rows;
};

export const findNameById = async (id: string): Promise<string | null> => {
  const { rows } = await pool.query<{ property_name: string }>(
    'SELECT property_name FROM properties WHERE property_id = $1',
    [id]
  );
  return rows[0]?.property_name || null;
};

export const checkVacancy = async (
  id: string,
  userId: string
): Promise<{ is_vacant: boolean } | null> => {
  const { rows } = await pool.query<{ is_vacant: boolean }>(
    'SELECT is_vacant FROM properties WHERE property_id = $1 AND user_id = $2',
    [id, userId]
  );
  return rows[0] || null;
};

export const create = async (userId: string, f: PropertyFields): Promise<Property> => {
  const { rows } = await pool.query<Property>(
    `INSERT INTO properties (
      user_id, country_id, province_id, district_id, municipality_id,
      ward_number, street_name, house_number, property_type_id,
      property_name, property_description, property_value
    ) VALUES ($1, $2, $3, $4, $5, $6, INITCAP($7), $8, $9, INITCAP($10), $11, $12) RETURNING *`,
    [
      userId, f.country_id, f.province_id, f.district_id, f.municipality_id,
      f.ward_number, f.street_name, f.house_number, f.property_type_id,
      f.property_name, f.property_description, f.property_value,
    ]
  );
  return rows[0];
};

export const update = async (id: string, userId: string, f: PropertyFields): Promise<Property | null> => {
  const { rows } = await pool.query<Property>(
    `UPDATE properties SET
      country_id = $1, province_id = $2, district_id = $3, municipality_id = $4,
      ward_number = $5, street_name = INITCAP($6), house_number = $7,
      property_type_id = $8, property_name = INITCAP($9), property_description = $10,
      property_value = $11, updated_at = NOW(), is_vacant = $12
    WHERE property_id = $13 AND user_id = $14 RETURNING *`,
    [
      f.country_id, f.province_id, f.district_id, f.municipality_id,
      f.ward_number, f.street_name, f.house_number, f.property_type_id,
      f.property_name, f.property_description, f.property_value, f.is_vacant,
      id, userId,
    ]
  );
  return rows[0] || null;
};

export const deleteById = async (id: string, userId: string, client: DbClient = pool): Promise<Property | null> => {
  const { rows } = await client.query<Property>(
    'DELETE FROM properties WHERE property_id = $1 AND user_id = $2 RETURNING *',
    [id, userId]
  );
  return rows[0] || null;
};
