import pool from '../config/database';
import { DbClient, Address, AddressFields } from '../types';

export const findByUserId = async (userId: number, client: DbClient = pool): Promise<Address | null> => {
  const { rows } = await client.query<Address>(
    'SELECT * FROM address WHERE user_id = $1',
    [userId]
  );
  return rows[0] || null;
};

export const findWithJoinsByUserId = async (userId: number): Promise<Record<string, any> | null> => {
  const { rows } = await pool.query(
    `SELECT a.address_id, a.country_id, c.nicename AS country,
      a.province_id, p.name AS province, a.district_id, d.name AS district,
      a.municipality_id, m.name AS municipality,
      a.ward_number, a.street_name, a.house_number,
      a.contact_number_1, a.contact_number_2, a.contact_address
    FROM address a
    LEFT JOIN country c ON a.country_id = c.id
    LEFT JOIN province p ON a.province_id = p.id
    LEFT JOIN district d ON a.district_id = d.id
    LEFT JOIN municipality m ON a.municipality_id = m.id
    WHERE a.user_id = $1`,
    [userId]
  );
  return rows[0] || null;
};

export const insert = async (userId: number, a: AddressFields, client: DbClient = pool): Promise<Address> => {
  const { rows } = await client.query<Address>(
    `INSERT INTO address (
      user_id, country_id, province_id, district_id, municipality_id,
      ward_number, street_name, house_number, contact_number_1,
      contact_number_2, contact_address
    ) VALUES ($1, $2, $3, $4, $5, $6, INITCAP($7), INITCAP($8), $9, $10, INITCAP($11)) RETURNING *`,
    [
      userId, a.country_id, a.province_id, a.district_id, a.municipality_id,
      a.ward_number, a.street_name, a.house_number, a.contact_number_1,
      a.contact_number_2, a.contact_address,
    ]
  );
  return rows[0];
};

export const update = async (userId: number, a: AddressFields, client: DbClient = pool): Promise<Address> => {
  const { rows } = await client.query<Address>(
    `UPDATE address SET
      country_id = $1, province_id = $2, district_id = $3, municipality_id = $4,
      ward_number = $5, street_name = INITCAP($6), house_number = INITCAP($7),
      contact_number_1 = $8, contact_number_2 = $9, contact_address = INITCAP($10),
      updated_at = NOW()
    WHERE user_id = $11 RETURNING *`,
    [
      a.country_id, a.province_id, a.district_id, a.municipality_id,
      a.ward_number, a.street_name, a.house_number, a.contact_number_1,
      a.contact_number_2, a.contact_address, userId,
    ]
  );
  return rows[0];
};

export const upsert = async (userId: number, a: AddressFields, client: DbClient = pool): Promise<Address> => {
  const existing = await findByUserId(userId, client);
  if (existing) return update(userId, a, client);
  return insert(userId, a, client);
};
