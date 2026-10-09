// File store (CONTEXT.md "File store", ADR-0010): write order, cleanup on
// rollback, and deletes that remove every file their cascade orphans —
// including files in the previous name-based layout. Runs against the
// database in .env, migrated, with lookup tables seeded. All fixtures are
// created inside one transaction that is rolled back; services that open
// their own transaction get a savepoint on the same connection.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { PoolClient } from 'pg';
import pool from '../config/database';
import * as fileStore from '../services/fileStore';
import * as tenantService from '../services/tenantService';
import * as propertyService from '../services/propertyService';
import * as userService from '../services/userService';
import { MulterFile } from '../types';

const UPLOAD_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'proptrove-test-'));
process.env.UPLOAD_ROOT = UPLOAD_ROOT;

let client: PoolClient;
let lookups: Record<string, number>;

const one = async (sql: string, params: unknown[] = []): Promise<any> =>
  (await client.query(sql, params)).rows[0];

const pdf = (name = 'x.pdf'): MulterFile =>
  ({ originalname: name, mimetype: 'application/pdf', size: 4, buffer: Buffer.from('%PDF') } as MulterFile);

// A file on disk at an arbitrary path, as the previous layout left them.
const legacyFile = (...parts: string[]): string => {
  const filePath = path.join(UPLOAD_ROOT, ...parts);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, 'old');
  return filePath;
};

const user = async (key: string, userTypeId: number, mobile: string | null = null): Promise<string> => {
  const { user_id } = await one(
    `INSERT INTO users (email, password, user_type_id, is_verified) VALUES ($1, 'x', $2, TRUE) RETURNING user_id`,
    [`${key}.${Date.now()}.${Math.random()}@file-store.test`, userTypeId]
  );
  await client.query(`INSERT INTO user_details (user_id, first_name, last_name, mobile_number) VALUES ($1, $2, 'Store', $3)`, [
    user_id, key, mobile,
  ]);
  return user_id;
};

const property = async (ownerId: string, name: string): Promise<string> =>
  (
    await one(
      `INSERT INTO properties (user_id, property_type_id, country_id, province_id, district_id, municipality_id,
         ward_number, street_name, house_number, property_name)
       VALUES ($1, $2, $3, $4, $5, $6, 1, 'Street', '1', $7) RETURNING property_id`,
      [ownerId, lookups.property_type_id, lookups.country_id, lookups.province_id, lookups.district_id,
        lookups.municipality_id, name]
    )
  ).property_id;

const agreement = async (propertyId: string, tenantId: string, status = 'ended'): Promise<string> =>
  (
    await one(
      `INSERT INTO agreements (property_id, tenant_id, start_date, end_date, rent_amount, agreement_duration_id,
         payment_period_id, status)
       VALUES ($1, $2, '2025-01-15', '2025-06-30', 10000, $3, 1, $4) RETURNING agreement_id`,
      [propertyId, tenantId, lookups.agreement_duration_id, status]
    )
  ).agreement_id;

const fileRow = async (cols: Record<string, unknown>): Promise<void> => {
  const names = Object.keys(cols);
  await client.query(
    `INSERT INTO files (${names.join(', ')}, original_name, mimetype, file_size, file_name)
     VALUES (${names.map((_, i) => `$${i + 1}`).join(', ')}, 'x.pdf', 'application/pdf', 4, 'x.pdf')`,
    Object.values(cols)
  );
};

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

  lookups = await one(`SELECT
    (SELECT MIN(id) FROM property_types) AS property_type_id,
    (SELECT MIN(id) FROM country) AS country_id,
    (SELECT MIN(id) FROM province) AS province_id,
    (SELECT MIN(id) FROM district) AS district_id,
    (SELECT MIN(id) FROM municipality) AS municipality_id,
    (SELECT MIN(id) FROM file_categories) AS file_category_id,
    (SELECT MIN(id) FROM property_file_categories) AS property_file_category_id,
    (SELECT MIN(id) FROM agreement_file_categories) AS agreement_file_category_id,
    (SELECT id FROM agreement_duration WHERE duration_in_years = 3) AS agreement_duration_id`);
});

after(async () => {
  await client.query('ROLLBACK');
  client.release();
  await pool.end();
  fs.rmSync(UPLOAD_ROOT, { recursive: true, force: true });
});

test('save: bytes under <root>/<user_id>/<uuid><ext>, extension from the MIME type', async () => {
  const userId = await user('saver', 2);
  const paths = await fileStore.save(userId, [pdf('Scan.PDF'), pdf('no-extension')], async (placed) =>
    placed.map((p) => p.file_path)
  );
  for (const p of paths) {
    assert.match(p, new RegExp(`^${UPLOAD_ROOT}/${userId}/[0-9a-f-]{36}\\.pdf$`));
    assert.equal(fs.readFileSync(p, 'utf8'), '%PDF');
  }
  assert.notEqual(paths[0], paths[1]);
  fileStore.discard(paths);
});

test('save: a failing record removes the bytes and rolls the rows back', async () => {
  const userId = await user('failer', 2);
  let written: string[] = [];
  await assert.rejects(
    fileStore.save(userId, [pdf(), pdf()], async (placed, txClient) => {
      written = placed.map((p) => p.file_path);
      await txClient.query(`UPDATE user_details SET first_name = 'changed' WHERE user_id = $1`, [userId]);
      throw new Error('insert failed');
    }),
    /insert failed/
  );
  assert.equal(written.length, 2);
  for (const p of written) assert.ok(!fs.existsSync(p));
  assert.equal((await one('SELECT first_name FROM user_details WHERE user_id = $1', [userId])).first_name, 'failer');
});

test('discard: ignores missing files and empty paths, prunes an emptied directory but never the root', async () => {
  const kept = legacyFile('keep', 'a.pdf');
  const lone = legacyFile('lone', 'b.pdf');
  const atRoot = legacyFile('c.pdf');
  fileStore.discard([lone, atRoot, path.join(UPLOAD_ROOT, 'missing', 'x.pdf'), null, undefined]);
  assert.ok(!fs.existsSync(path.join(UPLOAD_ROOT, 'lone')));
  assert.ok(!fs.existsSync(atRoot));
  assert.ok(fs.existsSync(UPLOAD_ROOT));
  assert.ok(fs.existsSync(kept));
  fileStore.discard([kept]);
});

test('tenant photo: replacing removes the old file, removing clears it', async () => {
  const ownerId = await user('photo-owner', 2);
  const tenantId = await user('photo-tenant', 3);
  await client.query(`INSERT INTO owner_tenant (property_owner_id, tenant_id) VALUES ($1, $2)`, [ownerId, tenantId]);
  const png = { originalname: 'me.png', mimetype: 'image/png', size: 4, buffer: Buffer.from('png1') } as MulterFile;

  await tenantService.setPhoto(ownerId, tenantId, png, 'http://test');
  const first = (await one('SELECT profile_photo_path FROM users WHERE user_id = $1', [tenantId])).profile_photo_path;
  assert.ok(first.endsWith('.png') && fs.existsSync(first));

  await tenantService.setPhoto(ownerId, tenantId, png, 'http://test');
  const second = (await one('SELECT profile_photo_path FROM users WHERE user_id = $1', [tenantId])).profile_photo_path;
  assert.notEqual(second, first);
  assert.ok(!fs.existsSync(first) && fs.existsSync(second));

  await tenantService.removePhoto(ownerId, tenantId);
  assert.ok(!fs.existsSync(second));
});

test('tenant delete removes every file the cascade orphans, in any folder', async () => {
  const ownerId = await user('t-owner', 2);
  // No mobile number: the old code stored these under fallback folders and
  // then removed "uploads/null", leaving them behind.
  const tenantId = await user('t-tenant', 3, null);
  await client.query(`INSERT INTO owner_tenant (property_owner_id, tenant_id) VALUES ($1, $2)`, [ownerId, tenantId]);
  const agreementId = await agreement(await property(ownerId, 'Tenant Flat'), tenantId);
  const { payment_id } = await one(
    `INSERT INTO payments (agreement_id, payment_purpose_id, payment_method_id, amount, paid_on, covers_period_start)
     VALUES ($1, 1, 1, 10000, '2025-01-20', '2025-01-15') RETURNING payment_id`,
    [agreementId]
  );

  const personal = legacyFile('unknown', 'personal.pdf');
  const agreementDoc = legacyFile(tenantId, 'contract.pdf');
  const receipt = legacyFile(tenantId, 'receipt.pdf');
  const photo = legacyFile(tenantId, 'profile_photo_1.png');
  await fileRow({ user_id: tenantId, file_category_id: lookups.file_category_id, file_path: personal });
  await fileRow({
    user_id: tenantId, agreement_id: agreementId, agreement_file_category_id: lookups.agreement_file_category_id,
    file_path: agreementDoc,
  });
  await fileRow({ user_id: tenantId, payment_id, file_path: receipt });
  await client.query('UPDATE users SET profile_photo_path = $1 WHERE user_id = $2', [photo, tenantId]);
  const unrelated = legacyFile('unknown', 'someone-else.pdf');

  await tenantService.deleteTenant(ownerId, tenantId);
  for (const p of [personal, agreementDoc, receipt, photo]) assert.ok(!fs.existsSync(p), p);
  assert.ok(fs.existsSync(unrelated));
  fileStore.discard([unrelated]);
});

test('property delete removes its files even when the name has special characters', async () => {
  const ownerId = await user('p-owner', 2, '9800000001');
  const tenantId = await user('p-tenant', 3);
  const name = 'Flat 2/B: "Lake" View?';
  const propertyId = await property(ownerId, name);
  const agreementId = await agreement(propertyId, tenantId);

  // The old upload path sanitised the name; the old delete didn't.
  const deed = legacyFile('9800000001', 'Flat 2_B_ _Lake_ View_', 'deed.pdf');
  const contract = legacyFile(tenantId, 'contract.pdf');
  await fileRow({
    user_id: ownerId, property_id: propertyId, property_file_category_id: lookups.property_file_category_id,
    file_path: deed,
  });
  await fileRow({
    user_id: tenantId, agreement_id: agreementId, agreement_file_category_id: lookups.agreement_file_category_id,
    file_path: contract,
  });

  await propertyService.deleteProperty(propertyId, ownerId);
  assert.ok(!fs.existsSync(deed));
  assert.ok(!fs.existsSync(contract));
});

test('owner account delete reaches Agreement documents stored in tenants\' folders', async () => {
  const ownerId = await user('u-owner', 2);
  const tenantId = await user('u-tenant', 3);
  const propertyId = await property(ownerId, 'Owner House');
  const agreementId = await agreement(propertyId, tenantId);

  const own = legacyFile(ownerId, 'citizenship.pdf');
  const deed = legacyFile(ownerId, 'deed.pdf');
  const contract = legacyFile(tenantId, 'contract.pdf');
  const tenantOwn = legacyFile(tenantId, 'tenant-id.pdf');
  await fileRow({ user_id: ownerId, file_category_id: lookups.file_category_id, file_path: own });
  await fileRow({
    user_id: ownerId, property_id: propertyId, property_file_category_id: lookups.property_file_category_id,
    file_path: deed,
  });
  await fileRow({
    user_id: tenantId, agreement_id: agreementId, agreement_file_category_id: lookups.agreement_file_category_id,
    file_path: contract,
  });
  // The tenant's own Document survives: deleting the owner doesn't delete the tenant.
  await fileRow({ user_id: tenantId, file_category_id: lookups.file_category_id, file_path: tenantOwn });

  await userService.deleteUser(ownerId);
  for (const p of [own, deed, contract]) assert.ok(!fs.existsSync(p), p);
  assert.ok(fs.existsSync(tenantOwn));
  fileStore.discard([tenantOwn]);
});
