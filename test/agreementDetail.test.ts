// Agreement Details page support (agreement details spec, items 1-7).
import fs from 'fs';
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { useTestDatabase } from './support/db';
import * as fixtures from './support/fixtures';
import * as agreementService from '../services/agreementService';
import * as paymentService from '../services/paymentService';
import { dateOnly } from '../utils/businessDate';
import { MulterFile } from '../types';

useTestDatabase();

const BASE_URL = 'http://test';
let ownerId: string;
let otherOwnerId: string;
let tenantId: string;
let agreementId: string;
let signedContractId: number;

before(async () => {
  const lookups = await fixtures.lookups();
  signedContractId = lookups.signed_contract_id;
  ownerId = await fixtures.owner();
  otherOwnerId = await fixtures.owner({ first: 'Other', last: 'Owner' });
  tenantId = await fixtures.tenant({ first: 'Sita', last: 'Sharma', mobile: '9800000002', linkedTo: ownerId });

  // Through the service on purpose: it sets the audit fields these tests read.
  const created = await agreementService.createAgreement(ownerId, tenantId, {
    property_id: await fixtures.property(ownerId, { name: 'Detail House', ward: 7 }),
    start_date: '2024-01-15',
    rent_amount: '45000',
    agreement_duration_id: lookups.agreement_duration_id,
    payment_period_id: 1,
    increment_duration_id: lookups.increment_duration_id,
    increment_percentage_id: lookups.increment_percentage_id,
  });
  agreementId = created.agreement_id;
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
  assert.match(a.tenant_email, /^tenant\..*@fixture\.test$/);
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
