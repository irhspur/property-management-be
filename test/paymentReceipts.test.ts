// Payment receipts (payment receipts spec). Runs against the database in
// .env, migrated, with lookup tables seeded. All fixtures are created inside
// one transaction that is rolled back; services that open their own
// transaction get a savepoint on the same connection.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { AddressInfo } from 'net';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import { PoolClient } from 'pg';
import pool from '../config/database';
import * as paymentService from '../services/paymentService';
import { today } from '../utils/businessDate';
import { MulterFile } from '../types';

const { receiptsUpload } = require('../config/multer');

const MOBILE = `97${Date.now()}`.slice(0, 10);
// Stored files go to a temp File store root, removed afterwards.
const UPLOAD_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'proptrove-test-'));
process.env.UPLOAD_ROOT = UPLOAD_ROOT;
let client: PoolClient;
let ownerId: string;
let otherOwnerId: string;
let tenantId: string;
let agreementId: string;
let otherAgreementId: string;
let paymentId: string;
let otherPaymentId: string;

const one = async (sql: string, params: unknown[] = []): Promise<any> =>
  (await client.query(sql, params)).rows[0];

const pdf = (name: string): MulterFile =>
  ({ originalname: name, mimetype: 'application/pdf', size: 4, buffer: Buffer.from('%PDF') } as MulterFile);

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
    (SELECT id FROM agreement_duration WHERE duration_in_years = 3) AS agreement_duration_id`);

  const user = async (key: string, userTypeId: number, mobile: string | null = null) => {
    const { user_id } = await one(
      `INSERT INTO users (email, password, user_type_id, is_verified) VALUES ($1, 'x', $2, TRUE) RETURNING user_id`,
      [`${key}.${Date.now()}@payment-receipts.test`, userTypeId]
    );
    await client.query(
      `INSERT INTO user_details (user_id, first_name, last_name, mobile_number) VALUES ($1, $2, 'Receipts', $3)`,
      [user_id, key, mobile]
    );
    return user_id as string;
  };
  ownerId = await user('owner', 2);
  otherOwnerId = await user('other', 2);
  tenantId = await user('tenant', 3, MOBILE);
  await client.query(`INSERT INTO owner_tenant (property_owner_id, tenant_id) VALUES ($1, $2)`, [ownerId, tenantId]);

  const { property_id } = await one(
    `INSERT INTO properties (user_id, property_type_id, country_id, province_id, district_id, municipality_id,
       ward_number, street_name, house_number, property_name)
     VALUES ($1, $2, $3, $4, $5, $6, 1, 'Street', '1', 'Receipt House') RETURNING property_id`,
    [ownerId, lookups.property_type_id, lookups.country_id, lookups.province_id, lookups.district_id,
      lookups.municipality_id]
  );
  // Ended on purpose: receipts work on ended Agreements, as Payments do.
  const agreement = async (status: string) =>
    (
      await one(
        `INSERT INTO agreements (property_id, tenant_id, start_date, end_date, rent_amount,
           agreement_duration_id, payment_period_id, status)
         VALUES ($1, $2, '2025-01-15', '2025-12-31', 10000, $3, 1, $4) RETURNING agreement_id`,
        [property_id, tenantId, lookups.agreement_duration_id, status]
      )
    ).agreement_id as string;
  agreementId = await agreement('ended');
  otherAgreementId = await agreement('ended');

  const pay = async (agreement: string) =>
    (
      await paymentService.createPayment(ownerId, tenantId, agreement, {
        payment_purpose_id: 1,
        payment_method_id: 1,
        amount: 10000,
        paid_on: today(),
        covers_period_start: '2025-01-15',
      })
    ).payment_id;
  paymentId = await pay(agreementId);
  otherPaymentId = await pay(otherAgreementId);
});

after(async () => {
  await client.query('ROLLBACK');
  client.release();
  await pool.end();
  fs.rmSync(UPLOAD_ROOT, { recursive: true, force: true });
});

test('upload, list newest first, fetch, delete', async () => {
  assert.deepEqual(await paymentService.getReceipts(ownerId, tenantId, agreementId, paymentId), []);

  const created = await paymentService.uploadReceipts(ownerId, tenantId, agreementId, paymentId, [
    pdf('slip.pdf'),
    pdf('cheque.pdf'),
  ]);
  assert.equal(created.length, 2);
  assert.ok(created.every((f) => fs.existsSync(f.file_path)));
  assert.equal(created[0].payment_id, paymentId);
  assert.equal(created[0].user_id, tenantId);
  assert.deepEqual(Object.keys(created[0]).sort(), [
    'created_at', 'file_id', 'file_name', 'file_path', 'file_size', 'mimetype', 'original_name', 'payment_id',
    'updated_at', 'upload_date', 'user_id',
  ].sort());

  const listed = await paymentService.getReceipts(ownerId, tenantId, agreementId, paymentId);
  assert.deepEqual(listed.map((f) => f.file_id).sort(), created.map((f) => f.file_id).sort());

  const got = await paymentService.getReceipt(ownerId, tenantId, agreementId, paymentId, created[0].file_id);
  assert.equal(got.original_name, 'slip.pdf');

  await paymentService.deleteReceipt(ownerId, tenantId, agreementId, paymentId, created[0].file_id);
  assert.ok(!fs.existsSync(created[0].file_path));
  await assert.rejects(
    paymentService.getReceipt(ownerId, tenantId, agreementId, paymentId, created[0].file_id),
    { statusCode: 404 }
  );
  assert.equal((await paymentService.getReceipts(ownerId, tenantId, agreementId, paymentId)).length, 1);
});

test('no files is a 400', async () => {
  await assert.rejects(paymentService.uploadReceipts(ownerId, tenantId, agreementId, paymentId, []), {
    statusCode: 400,
  });
});

test('404 for another owner, a payment or file not on this agreement/payment', async () => {
  await assert.rejects(paymentService.getReceipts(otherOwnerId, tenantId, agreementId, paymentId), {
    statusCode: 404,
  });
  await assert.rejects(paymentService.getReceipts(ownerId, tenantId, agreementId, otherPaymentId), {
    statusCode: 404,
  });
  await assert.rejects(paymentService.getReceipts(ownerId, tenantId, agreementId, 'not-a-uuid'), {
    statusCode: 404,
  });

  const [other] = await paymentService.uploadReceipts(ownerId, tenantId, otherAgreementId, otherPaymentId, [
    pdf('other.pdf'),
  ]);
  await assert.rejects(paymentService.getReceipt(ownerId, tenantId, agreementId, paymentId, other.file_id), {
    statusCode: 404,
  });
  await assert.rejects(paymentService.deleteReceipt(ownerId, tenantId, agreementId, paymentId, other.file_id), {
    statusCode: 404,
  });
  await assert.rejects(paymentService.getReceipt(ownerId, tenantId, agreementId, paymentId, 'nope'), {
    statusCode: 404,
  });
});

test('receipt_count on ledger, agreement list and single payment', async () => {
  const count = (await paymentService.getReceipts(ownerId, tenantId, agreementId, paymentId)).length;
  const otherCount = (await paymentService.getReceipts(ownerId, tenantId, otherAgreementId, otherPaymentId)).length;

  const paged = await paymentService.getLedger(ownerId, {});
  const all = await paymentService.getLedger(ownerId, { all: true });
  for (const rows of [paged.data, all.data]) {
    assert.equal(rows.find((r) => r.payment_id === paymentId)!.receipt_count, count);
    assert.equal(rows.find((r) => r.payment_id === otherPaymentId)!.receipt_count, otherCount);
  }
  const [listed] = await paymentService.getPaymentsForAgreement(ownerId, tenantId, agreementId);
  assert.equal(listed.receipt_count, count);
  const single = await paymentService.getPayment(ownerId, tenantId, agreementId, paymentId);
  assert.equal(single.receipt_count, count);
});

test('deleting a payment removes its receipt rows and stored files', async () => {
  const [receipt] = await paymentService.uploadReceipts(ownerId, tenantId, otherAgreementId, otherPaymentId, [
    pdf('gone.pdf'),
  ]);
  const before = await paymentService.getReceipts(ownerId, tenantId, otherAgreementId, otherPaymentId);
  await paymentService.deletePayment(ownerId, tenantId, otherAgreementId, otherPaymentId);
  for (const f of before) assert.ok(!fs.existsSync(f.file_path));
  const { rows } = await client.query('SELECT 1 FROM files WHERE file_id = $1', [receipt.file_id]);
  assert.equal(rows.length, 0);
});

test('upload middleware: type, size and count rejections use the 400 envelope', async () => {
  const app = express();
  app.post('/r', receiptsUpload, (req, res) => res.json({ count: (req.files as unknown[]).length }));
  const server = app.listen(0);
  const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/r`;
  const send = async (files: [string, string, number][]) => {
    const form = new FormData();
    for (const [name, type, size] of files) form.append('files', new Blob([Buffer.alloc(size)], { type }), name);
    const res = await fetch(url, { method: 'POST', body: form });
    return { status: res.status, body: (await res.json()) as any };
  };
  try {
    assert.deepEqual(await send([['a.png', 'image/png', 10]]), { status: 200, body: { count: 1 } });
    assert.deepEqual(await send(Array(5).fill(['a.jpg', 'image/jpeg', 10])), { status: 200, body: { count: 5 } });

    const cases: [string, [string, string, number][]][] = [
      ['type', [['a.gif', 'image/gif', 10]]],
      ['size', [['a.pdf', 'application/pdf', 5 * 1024 * 1024 + 1]]],
      ['count', Array(6).fill(['a.pdf', 'application/pdf', 10])],
    ];
    for (const [label, files] of cases) {
      const { status, body } = await send(files);
      assert.equal(status, 400, label);
      assert.equal(body.errors[0].field, 'files', label);
    }
  } finally {
    server.close();
  }
});
