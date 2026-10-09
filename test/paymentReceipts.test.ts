// Payment receipts (payment receipts spec).
import fs from 'fs';
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { useTestDatabase } from './support/db';
import * as fixtures from './support/fixtures';
import * as paymentService from '../services/paymentService';
import { today } from '../utils/businessDate';
import { MulterFile } from '../types';

const db = useTestDatabase();

let ownerId: string;
let otherOwnerId: string;
let tenantId: string;
let agreementId: string;
let otherAgreementId: string;
let paymentId: string;
let otherPaymentId: string;

const pdf = (name: string): MulterFile =>
  ({ originalname: name, mimetype: 'application/pdf', size: 4, buffer: Buffer.from('%PDF') } as MulterFile);

before(async () => {
  ownerId = await fixtures.owner();
  otherOwnerId = await fixtures.owner();
  tenantId = await fixtures.tenant({ linkedTo: ownerId });
  const property = await fixtures.property(ownerId, { name: 'Receipt House' });

  // Ended on purpose: receipts work on ended Agreements, as Payments do.
  const agreement = async () =>
    (await fixtures.agreement({ property, tenant: tenantId, end: '2025-12-31', status: 'ended' })).agreement_id;
  agreementId = await agreement();
  otherAgreementId = await agreement();
  paymentId = await fixtures.payment(agreementId, { paidOn: today() });
  otherPaymentId = await fixtures.payment(otherAgreementId, { paidOn: today() });
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
  await paymentService.uploadReceipts(ownerId, tenantId, agreementId, paymentId, [pdf('a.pdf'), pdf('b.pdf')]);
  await paymentService.uploadReceipts(ownerId, tenantId, otherAgreementId, otherPaymentId, [pdf('c.pdf')]);
  const count = 2;
  const otherCount = 1;

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
  const rows = await db.query('SELECT 1 FROM files WHERE file_id = $1', [receipt.file_id]);
  assert.equal(rows.length, 0);
});
