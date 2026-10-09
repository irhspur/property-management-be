// Agreement Details page support (agreement details spec, items 1-7). Runs
// against the database in .env, migrated, with lookup tables seeded. All
// fixtures are created inside one transaction that is rolled back; services
// that open their own transaction get a savepoint on the same connection.
import fs from 'fs';
import path from 'path';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PoolClient } from 'pg';
import pool from '../config/database';
import * as agreementService from '../services/agreementService';
import * as paymentService from '../services/paymentService';
import { dateOnly } from '../utils/rent';
import { MulterFile } from '../types';

const BASE_URL = 'http://test';
const MOBILE = `98${Date.now()}`.slice(0, 10);
let client: PoolClient;
let ownerId: string;
let otherOwnerId: string;
let tenantId: string;
let agreementId: string;
let signedContractId: number;

const one = async (sql: string, params: unknown[] = []): Promise<any> =>
  (await client.query(sql, params)).rows[0];

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
    (SELECT id FROM agreement_duration WHERE duration_in_years = 3) AS agreement_duration_id,
    (SELECT id FROM increment_duration WHERE increment_duration_in_years = 1) AS increment_duration_id,
    (SELECT id FROM increment_percentage WHERE increment_percentage = 10) AS increment_percentage_id,
    (SELECT id FROM agreement_file_categories WHERE code = 'signed_contract') AS signed_contract_id`);
  signedContractId = lookups.signed_contract_id;

  const user = async (key: string, userTypeId: number, first: string, last: string, mobile: string | null = null) => {
    const { user_id } = await one(
      `INSERT INTO users (email, password, user_type_id, is_verified)
       VALUES ($1, 'x', $2, TRUE) RETURNING user_id`,
      [`${key}.${Date.now()}@agreement-detail.test`, userTypeId]
    );
    await client.query(
      `INSERT INTO user_details (user_id, first_name, last_name, mobile_number) VALUES ($1, $2, $3, $4)`,
      [user_id, first, last, mobile]
    );
    return user_id as string;
  };
  ownerId = await user('owner', 2, 'Owner', 'Test');
  otherOwnerId = await user('other', 2, 'Other', 'Owner');
  tenantId = await user('tenant', 3, 'Sita', 'Sharma', MOBILE);
  await client.query(`INSERT INTO owner_tenant (property_owner_id, tenant_id) VALUES ($1, $2)`, [ownerId, tenantId]);

  const { property_id } = await one(
    `INSERT INTO properties (user_id, property_type_id, country_id, province_id, district_id, municipality_id,
       ward_number, street_name, house_number, property_name)
     VALUES ($1, $2, $3, $4, $5, $6, 7, 'Test Street', '1', 'Detail House') RETURNING property_id`,
    [ownerId, lookups.property_type_id, lookups.country_id, lookups.province_id, lookups.district_id,
      lookups.municipality_id]
  );
  const created = await agreementService.createAgreement(ownerId, tenantId, {
    property_id,
    start_date: '2024-01-15',
    rent_amount: '45000',
    agreement_duration_id: lookups.agreement_duration_id,
    payment_period_id: 1,
    increment_duration_id: lookups.increment_duration_id,
    increment_percentage_id: lookups.increment_percentage_id,
  });
  agreementId = created.agreement_id;
});

after(async () => {
  await client.query('ROLLBACK');
  client.release();
  await pool.end();
  fs.rmSync(path.join('uploads', MOBILE), { recursive: true, force: true });
});

test('fetch by id alone, 404 for another owner or a malformed id', async () => {
  const a = await agreementService.getAgreementById(ownerId, agreementId, BASE_URL);
  assert.equal(a.agreement_id, agreementId);
  assert.equal(a.tenant_id, tenantId);
  await assert.rejects(agreementService.getAgreementById(otherOwnerId, agreementId, BASE_URL), { statusCode: 404 });
  await assert.rejects(agreementService.getAgreementById(ownerId, 'not-a-uuid', BASE_URL), { statusCode: 404 });
});

test('rent schedule matches the Payment Statement rent in force', async () => {
  const a = await agreementService.getAgreementById(ownerId, agreementId, BASE_URL);
  assert.deepEqual(
    a.rent_schedule.map((s: any) => [s.index, s.start_date, s.end_date, s.rent_in_force]),
    [
      [1, '2024-01-15', '2025-01-14', 45000],
      [2, '2025-01-15', '2026-01-14', 49500],
      [3, '2026-01-15', '2027-01-14', 54450],
    ]
  );
  assert.deepEqual(a.rent_schedule[0].start_date_bs, { bs_year: 2080, bs_month: 10, month_name: 'Magh', day: 1 });

  // FY 2081/82 contains 2025-01-15, where the second step starts.
  const statement = await paymentService.getStatement(ownerId, tenantId, agreementId, 2081);
  const period = statement.periods.find((p: any) => p.period_start === '2025-01-15');
  assert.equal(period.rent_in_force, a.rent_schedule[1].rent_in_force);
});

test('BS dates on list and single, null when the AD date is null', async () => {
  const { data: [listed] } = await agreementService.getAgreementsByOwner(ownerId, BASE_URL);
  assert.equal(listed.start_date_bs.bs_year, 2080);
  assert.equal(listed.start_date_bs.day, 1);
  assert.equal(listed.end_date_bs, null);
  const single = await agreementService.getAgreement(ownerId, tenantId, agreementId, BASE_URL);
  assert.deepEqual(single.start_date_bs, listed.start_date_bs);
});

test('linked records, reference and audit fields', async () => {
  const a = await agreementService.getAgreementById(ownerId, agreementId, BASE_URL);
  assert.equal(a.property_name, 'Detail House');
  assert.equal(a.street_name, 'Test Street');
  assert.equal(a.ward_number, 7);
  for (const key of ['property_type', 'municipality', 'district', 'province']) assert.ok(a[key], key);
  assert.match(a.tenant_email, /@agreement-detail\.test$/);
  assert.equal(a.tenant_profile_photo_url, null);
  assert.ok(!('tenant_profile_photo_path' in a));
  assert.equal(a.owner_first_name, 'Owner');
  assert.equal(a.owner_last_name, 'Test');
  assert.equal(typeof a.agreement_reference, 'string');
  assert.equal(a.created_by_name, 'Owner Test');
  assert.equal(a.updated_by_name, 'Owner Test');
  assert.equal(a.ended_at, null);
});

test('documents: upload, list, fetch, delete; scoped to the agreement', async () => {
  const pdf = (name: string): MulterFile =>
    ({ originalname: name, mimetype: 'application/pdf', size: 4, buffer: Buffer.from('%PDF') } as MulterFile);

  await assert.rejects(
    agreementService.uploadFiles(ownerId, tenantId, agreementId, [pdf('a.pdf')], undefined),
    { statusCode: 400 }
  );
  await assert.rejects(
    agreementService.uploadFiles(otherOwnerId, tenantId, agreementId, [pdf('a.pdf')], signedContractId),
    { statusCode: 404 }
  );

  const created = await agreementService.uploadFiles(
    ownerId, tenantId, agreementId, [pdf('page1.pdf'), pdf('page2.pdf')], String(signedContractId)
  );
  assert.equal(created.length, 2);
  assert.equal(created[0].file_category_name, 'Signed Contract');
  assert.equal(created[0].user_id, tenantId);
  assert.ok(created.every((f) => fs.existsSync(f.file_path)));
  assert.notEqual(created[0].file_path, created[1].file_path);

  const listed = await agreementService.getFiles(ownerId, tenantId, agreementId);
  assert.deepEqual(listed.map((f) => f.file_id).sort(), created.map((f) => f.file_id).sort());
  assert.equal(listed[0].file_category_code, 'signed_contract');

  await agreementService.deleteFile(ownerId, tenantId, agreementId, created[0].file_id);
  assert.ok(!fs.existsSync(created[0].file_path));
  await assert.rejects(
    agreementService.getFile(ownerId, tenantId, agreementId, created[0].file_id),
    { statusCode: 404 }
  );
  assert.equal((await agreementService.getFiles(ownerId, tenantId, agreementId)).length, 1);
});

test('ending records ended_at and who ended it', async () => {
  await agreementService.endAgreement(ownerId, tenantId, agreementId);
  const a = await agreementService.getAgreementById(ownerId, agreementId, BASE_URL);
  assert.equal(a.status, 'ended');
  assert.ok(a.ended_at instanceof Date);
  assert.equal(a.updated_by_name, 'Owner Test');
  assert.ok(a.end_date_bs);
  // The schedule now stops at the end date set on ending.
  assert.equal(a.rent_schedule[a.rent_schedule.length - 1].end_date, dateOnly(a.end_date));
});
