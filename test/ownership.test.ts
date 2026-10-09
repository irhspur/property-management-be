// Ownership (CONTEXT.md "Ownership", ADR-0009): every lookup against the same
// cases — the owner, another owner, a malformed id, the wrong parent — plus a
// few service-level checks that routes go through it. Runs
// against the database in .env, migrated, with lookup tables seeded. All
// fixtures are created inside one transaction that is rolled back.
import fs from 'fs';
import os from 'os';
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
// Stored files go to a temp File store root, removed afterwards.
const UPLOAD_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'proptrove-test-'));
process.env.UPLOAD_ROOT = UPLOAD_ROOT;
let client: PoolClient;
let ownerId: string;
let otherOwnerId: string;
let tenantId: string;
let propertyId: string;
let otherPropertyId: string;
let otherTenantId: string;
let fileId: string;
let otherFileId: string;
let categoryId: number;
let agreementId: string;
let otherAgreementId: string;
let paymentId: string;
let otherPaymentId: string;
const docs: Record<string, string> = {};

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
    (SELECT MIN(id) FROM property_file_categories) AS property_file_category_id,
    (SELECT MIN(id) FROM file_categories) AS file_category_id,
    (SELECT MIN(id) FROM agreement_file_categories) AS agreement_file_category_id,
    (SELECT id FROM agreement_duration WHERE duration_in_years = 3) AS agreement_duration_id`);
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
  otherTenantId = await user('othertenant', 3);
  await client.query(`INSERT INTO owner_tenant (property_owner_id, tenant_id) VALUES ($1, $2), ($3, $4)`, [
    ownerId, tenantId, otherOwnerId, otherTenantId,
  ]);

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

  const agreement = async (property: string, tenant: string) =>
    (
      await one(
        `INSERT INTO agreements (property_id, tenant_id, start_date, rent_amount, agreement_duration_id,
           payment_period_id, status)
         VALUES ($1, $2, '2025-01-15', 10000, $3, 1, 'active') RETURNING agreement_id`,
        [property, tenant, lookups.agreement_duration_id]
      )
    ).agreement_id as string;
  agreementId = await agreement(propertyId, tenantId);
  otherAgreementId = await agreement(otherPropertyId, otherTenantId);

  const payment = async (agreement: string) =>
    (
      await one(
        `INSERT INTO payments (agreement_id, payment_purpose_id, payment_method_id, amount, paid_on, covers_period_start)
         VALUES ($1, 1, 1, 10000, '2025-01-20', '2025-01-15') RETURNING payment_id`,
        [agreement]
      )
    ).payment_id as string;
  paymentId = await payment(agreementId);
  otherPaymentId = await payment(otherAgreementId);

  // One Document per parent kind, each stored under some user_id.
  const file = async (key: string, cols: Record<string, unknown>) => {
    const names = Object.keys(cols);
    const { file_id } = await one(
      `INSERT INTO files (${names.join(', ')}, original_name, mimetype, file_size, file_name, file_path)
       VALUES (${names.map((_, i) => `$${i + 1}`).join(', ')}, 'x.pdf', 'application/pdf', 4, 'x.pdf', 'uploads/none/x.pdf')
       RETURNING file_id`,
      Object.values(cols)
    );
    docs[key] = file_id;
  };
  await file('ownerPersonal', { user_id: ownerId, file_category_id: lookups.file_category_id });
  await file('tenantPersonal', { user_id: tenantId, file_category_id: lookups.file_category_id });
  await file('otherTenantPersonal', { user_id: otherTenantId, file_category_id: lookups.file_category_id });
  await file('agreementDoc', {
    user_id: tenantId, agreement_id: agreementId, agreement_file_category_id: lookups.agreement_file_category_id,
  });
  await file('otherAgreementDoc', {
    user_id: otherTenantId, agreement_id: otherAgreementId, agreement_file_category_id: lookups.agreement_file_category_id,
  });
  await file('receipt', { user_id: tenantId, payment_id: paymentId });
});

after(async () => {
  await client.query('ROLLBACK');
  client.release();
  await pool.end();
  fs.rmSync(UPLOAD_ROOT, { recursive: true, force: true });
});

test('tenant: linked owner gets it; another owner, an unlinked tenant or a malformed id is 404', async () => {
  assert.equal((await ownership.tenant(ownerId, tenantId)).tenant_id, tenantId);
  await assert.rejects(ownership.tenant(otherOwnerId, tenantId), NOT_FOUND);
  await assert.rejects(ownership.tenant(ownerId, otherTenantId), NOT_FOUND);
  await assert.rejects(ownership.tenant(ownerId, MALFORMED), NOT_FOUND);
});

test('agreement: through its property; another owner, wrong tenant or malformed id is 404', async () => {
  assert.equal((await ownership.agreement(ownerId, agreementId)).agreement_id, agreementId);
  assert.equal((await ownership.agreement(ownerId, agreementId, { tenant: tenantId })).agreement_id, agreementId);
  await assert.rejects(ownership.agreement(otherOwnerId, agreementId), NOT_FOUND);
  await assert.rejects(ownership.agreement(ownerId, otherAgreementId), NOT_FOUND);
  await assert.rejects(ownership.agreement(ownerId, agreementId, { tenant: otherTenantId }), NOT_FOUND);
  await assert.rejects(ownership.agreement(ownerId, MALFORMED), NOT_FOUND);
});

test('payment: through its agreement, and must be on it', async () => {
  const { agreement, payment } = await ownership.payment(ownerId, paymentId, { agreement: agreementId, tenant: tenantId });
  assert.equal(payment.payment_id, paymentId);
  assert.equal(agreement.agreement_id, agreementId);
  await assert.rejects(ownership.payment(otherOwnerId, paymentId, { agreement: agreementId }), NOT_FOUND);
  await assert.rejects(ownership.payment(ownerId, otherPaymentId, { agreement: agreementId }), NOT_FOUND);
  await assert.rejects(ownership.payment(ownerId, paymentId, { agreement: agreementId, tenant: otherTenantId }), NOT_FOUND);
  await assert.rejects(ownership.payment(ownerId, MALFORMED, { agreement: agreementId }), NOT_FOUND);
});

test('document, self: the caller\'s own personal Documents only', async () => {
  assert.equal((await ownership.document(ownerId, docs.ownerPersonal, { self: true })).file_id, docs.ownerPersonal);
  assert.equal((await ownership.document(tenantId, docs.tenantPersonal, { self: true })).file_id, docs.tenantPersonal);
  await assert.rejects(ownership.document(ownerId, docs.tenantPersonal, { self: true }), NOT_FOUND);
  // An Agreement document or receipt is under the tenant's user_id, but isn't personal.
  await assert.rejects(ownership.document(tenantId, docs.agreementDoc, { self: true }), NOT_FOUND);
  await assert.rejects(ownership.document(tenantId, docs.receipt, { self: true }), NOT_FOUND);
});

test('document, tenant: a linked tenant\'s personal Documents only', async () => {
  const doc = await ownership.document(ownerId, docs.tenantPersonal, { tenant: tenantId });
  assert.equal(typeof doc.file_category_name, 'string');
  await assert.rejects(ownership.document(otherOwnerId, docs.tenantPersonal, { tenant: tenantId }), NOT_FOUND);
  await assert.rejects(ownership.document(ownerId, docs.otherTenantPersonal, { tenant: tenantId }), NOT_FOUND);
  await assert.rejects(ownership.document(ownerId, docs.otherTenantPersonal, { tenant: otherTenantId }), NOT_FOUND);
  await assert.rejects(ownership.document(ownerId, docs.agreementDoc, { tenant: tenantId }), NOT_FOUND);
});

test('document, agreement and payment: attached to an owned parent', async () => {
  assert.equal(
    (await ownership.document(ownerId, docs.agreementDoc, { agreement: agreementId, tenant: tenantId })).file_id,
    docs.agreementDoc
  );
  await assert.rejects(ownership.document(otherOwnerId, docs.agreementDoc, { agreement: agreementId }), NOT_FOUND);
  await assert.rejects(ownership.document(ownerId, docs.otherAgreementDoc, { agreement: agreementId }), NOT_FOUND);
  await assert.rejects(ownership.document(ownerId, docs.receipt, { agreement: agreementId }), NOT_FOUND);

  assert.equal(
    (await ownership.document(ownerId, docs.receipt, { payment: paymentId, agreement: agreementId })).file_id,
    docs.receipt
  );
  await assert.rejects(ownership.document(otherOwnerId, docs.receipt, { payment: paymentId, agreement: agreementId }), NOT_FOUND);
  await assert.rejects(ownership.document(ownerId, docs.agreementDoc, { payment: paymentId, agreement: agreementId }), NOT_FOUND);
  await assert.rejects(ownership.document(ownerId, MALFORMED, { payment: paymentId, agreement: agreementId }), NOT_FOUND);
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
  assert.deepEqual(fs.readdirSync(UPLOAD_ROOT), []);

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
  await assert.rejects(paymentService.getPaymentsForAgreement(ownerId, tenantId, MALFORMED), NOT_FOUND);
});
