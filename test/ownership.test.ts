// Ownership (CONTEXT.md "Ownership", ADR-0009): every lookup against the same
// cases — the owner, another owner, a malformed id, the wrong parent. Runs
// against the database in .env, migrated, with lookup tables seeded. All
// fixtures are created inside one transaction that is rolled back.
import fs from 'fs';
import path from 'path';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PoolClient } from 'pg';
import pool from '../config/database';
import * as ownership from '../services/ownership';
import * as propertyService from '../services/propertyService';
import * as propertyFileService from '../services/propertyFileService';
import * as paymentService from '../services/paymentService';
import { MulterFile } from '../types';

const MOBILE = `96${Date.now()}`.slice(0, 10);
let client: PoolClient;
let ownerId: string;
let otherOwnerId: string;
let tenantId: string;
let propertyId: string;
let otherPropertyId: string;
let fileId: string;
let otherFileId: string;
let categoryId: number;

const one = async (sql: string, params: unknown[] = []): Promise<any> =>
  (await client.query(sql, params)).rows[0];

const NOT_FOUND = { statusCode: 404 };
const MALFORMED = 'not-a-uuid';
const MISSING = '00000000-0000-0000-0000-000000000000';

before(async () => {
  client = await pool.connect();
  await client.query('BEGIN');
  (pool as any).query = client.query.bind(client);
  const savepoint: Record<string, string> = {
    BEGIN: 'SAVEPOINT svc',
    COMMIT: 'RELEASE SAVEPOINT svc',
    ROLLBACK: 'ROLLBACK TO SAVEPOINT svc',
  };
  (pool as any).connect = async () => ({
    query: (sql: string, params?: unknown[]) => client.query(savepoint[sql] ?? sql, params),
    release: () => {},
  });

  const lookups = await one(`SELECT
    (SELECT MIN(id) FROM property_types) AS property_type_id,
    (SELECT MIN(id) FROM country) AS country_id,
    (SELECT MIN(id) FROM province) AS province_id,
    (SELECT MIN(id) FROM district) AS district_id,
    (SELECT MIN(id) FROM municipality) AS municipality_id,
    (SELECT MIN(id) FROM property_file_categories) AS property_file_category_id`);
  categoryId = lookups.property_file_category_id;

  const user = async (key: string, userTypeId: number, mobile: string | null = null) => {
    const { user_id } = await one(
      `INSERT INTO users (email, password, user_type_id, is_verified) VALUES ($1, 'x', $2, TRUE) RETURNING user_id`,
      [`${key}.${Date.now()}@ownership.test`, userTypeId]
    );
    await client.query(
      `INSERT INTO user_details (user_id, first_name, last_name, mobile_number) VALUES ($1, $2, 'Ownership', $3)`,
      [user_id, key, mobile]
    );
    return user_id as string;
  };
  ownerId = await user('owner', 2, MOBILE);
  otherOwnerId = await user('other', 2);
  tenantId = await user('tenant', 3);

  const property = async (owner: string, name: string) =>
    (
      await one(
        `INSERT INTO properties (user_id, property_type_id, country_id, province_id, district_id, municipality_id,
           ward_number, street_name, house_number, property_name)
         VALUES ($1, $2, $3, $4, $5, $6, 1, 'Street', '1', $7) RETURNING property_id`,
        [owner, lookups.property_type_id, lookups.country_id, lookups.province_id, lookups.district_id,
          lookups.municipality_id, name]
      )
    ).property_id as string;
  propertyId = await property(ownerId, 'Mine');
  otherPropertyId = await property(otherOwnerId, 'Theirs');

  const document = async (owner: string, property: string) =>
    (
      await one(
        `INSERT INTO files (user_id, property_id, property_file_category_id, original_name, mimetype, file_size,
           file_name, file_path)
         VALUES ($1, $2, $3, 'deed.pdf', 'application/pdf', 4, 'deed.pdf', 'uploads/none/deed.pdf') RETURNING file_id`,
        [owner, property, categoryId]
      )
    ).file_id as string;
  fileId = await document(ownerId, propertyId);
  otherFileId = await document(otherOwnerId, otherPropertyId);
});

after(async () => {
  await client.query('ROLLBACK');
  client.release();
  await pool.end();
  fs.rmSync(path.join('uploads', MOBILE), { recursive: true, force: true });
});

test('property: the owner gets it; another owner, a malformed or missing id is 404', async () => {
  assert.equal((await ownership.property(ownerId, propertyId)).property_id, propertyId);
  await assert.rejects(ownership.property(otherOwnerId, propertyId), NOT_FOUND);
  await assert.rejects(ownership.property(ownerId, otherPropertyId), NOT_FOUND);
  await assert.rejects(ownership.property(ownerId, MALFORMED), NOT_FOUND);
  await assert.rejects(ownership.property(ownerId, MISSING), NOT_FOUND);
});

test('document under a property: owner, other owner, malformed id, wrong parent', async () => {
  const doc = await ownership.document(ownerId, fileId, { property: propertyId });
  assert.equal(doc.file_id, fileId);
  assert.equal(typeof doc.property_file_category_name, 'string');
  assert.ok(!('property_owner_id' in doc));
  assert.equal((await ownership.document(ownerId, fileId, { property: null })).file_id, fileId);

  await assert.rejects(ownership.document(otherOwnerId, fileId, { property: null }), NOT_FOUND);
  await assert.rejects(ownership.document(ownerId, otherFileId, { property: null }), NOT_FOUND);
  await assert.rejects(ownership.document(ownerId, MALFORMED, { property: null }), NOT_FOUND);
  await assert.rejects(ownership.document(ownerId, fileId, { property: otherPropertyId }), NOT_FOUND);
});

test('GET /user/property/:id: another owner gets 404', async () => {
  assert.equal((await propertyService.getById(ownerId, propertyId)).property_name, 'Mine');
  await assert.rejects(propertyService.getById(ownerId, otherPropertyId), NOT_FOUND);
});

test('property document upload onto another owner\'s property is 404 and writes nothing', async () => {
  const pdf = { originalname: 'x.pdf', mimetype: 'application/pdf', size: 4, buffer: Buffer.from('%PDF') } as MulterFile;
  const userData = { firstName: 'owner', mobileNumber: MOBILE };
  await assert.rejects(
    propertyFileService.createFile(ownerId, otherPropertyId, userData, pdf, categoryId),
    NOT_FOUND
  );
  assert.ok(!fs.existsSync(path.join('uploads', MOBILE, 'Theirs')));

  // On the owner's own property it still works.
  await client.query('DELETE FROM files WHERE file_id = $1', [fileId]);
  const created = await propertyFileService.createFile(ownerId, propertyId, userData, pdf, categoryId);
  assert.equal(created.property_id, propertyId);
});

test('property document routes go through the lookup', async () => {
  await assert.rejects(propertyFileService.getFileById(ownerId, otherFileId), NOT_FOUND);
  await assert.rejects(propertyFileService.deleteFile(ownerId, otherFileId), NOT_FOUND);
  await assert.rejects(propertyFileService.getFileById(otherOwnerId, MALFORMED), NOT_FOUND);
});

test('payment routes: a malformed agreement id is 404, not 500', async () => {
  await client.query(`INSERT INTO owner_tenant (property_owner_id, tenant_id) VALUES ($1, $2)`, [ownerId, tenantId]);
  await assert.rejects(paymentService.getPaymentsForAgreement(ownerId, tenantId, MALFORMED), NOT_FOUND);
});
