// Ownership (GLOSSARY.md "Ownership", ADR-0009): every lookup against the same
// cases — the owner, another owner, a malformed id, the wrong parent — plus a
// few service-level checks that routes go through it.
import fs from 'fs';
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { useTestDatabase } from './support/db';
import * as fixtures from './support/fixtures';
import * as ownership from '../services/ownership';
import * as propertyService from '../services/propertyService';
import * as propertyFileService from '../services/propertyFileService';
import * as paymentService from '../services/paymentService';
import { MulterFile } from '../types';

const db = useTestDatabase();
const UPLOAD_ROOT = db.uploadRoot;

let ownerId: string;
let otherOwnerId: string;
let tenantId: string;
let otherTenantId: string;
let propertyId: string;
let otherPropertyId: string;
let fileId: string;
let otherFileId: string;
let categoryId: number;
let agreementId: string;
let otherAgreementId: string;
let paymentId: string;
let otherPaymentId: string;
const docs: Record<string, string> = {};

const NOT_FOUND = { statusCode: 404 };
const MALFORMED = 'not-a-uuid';
const MISSING = '00000000-0000-0000-0000-000000000000';

before(async () => {
  const l = await fixtures.lookups();
  categoryId = l.property_file_category_id;

  ownerId = await fixtures.owner();
  otherOwnerId = await fixtures.owner();
  tenantId = await fixtures.tenant({ linkedTo: ownerId });
  otherTenantId = await fixtures.tenant({ linkedTo: otherOwnerId });
  propertyId = await fixtures.property(ownerId, { name: 'Mine' });
  otherPropertyId = await fixtures.property(otherOwnerId, { name: 'Theirs' });

  const propertyDoc = (owner: string, property: string) =>
    fixtures.document({ user_id: owner, property_id: property, property_file_category_id: categoryId });
  fileId = await propertyDoc(ownerId, propertyId);
  otherFileId = await propertyDoc(otherOwnerId, otherPropertyId);

  agreementId = (await fixtures.agreement({ property: propertyId, tenant: tenantId })).agreement_id;
  otherAgreementId = (await fixtures.agreement({ property: otherPropertyId, tenant: otherTenantId })).agreement_id;
  paymentId = await fixtures.payment(agreementId);
  otherPaymentId = await fixtures.payment(otherAgreementId);

  // One Document per parent kind, each stored under some user_id.
  docs.ownerPersonal = await fixtures.document({ user_id: ownerId, file_category_id: l.file_category_id });
  docs.tenantPersonal = await fixtures.document({ user_id: tenantId, file_category_id: l.file_category_id });
  docs.otherTenantPersonal = await fixtures.document({ user_id: otherTenantId, file_category_id: l.file_category_id });
  docs.agreementDoc = await fixtures.document({
    user_id: tenantId, agreement_id: agreementId, agreement_file_category_id: l.agreement_file_category_id,
  });
  docs.otherAgreementDoc = await fixtures.document({
    user_id: otherTenantId, agreement_id: otherAgreementId, agreement_file_category_id: l.agreement_file_category_id,
  });
  docs.receipt = await fixtures.document({ user_id: tenantId, payment_id: paymentId });
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
  await assert.rejects(
    propertyFileService.createFile(ownerId, otherPropertyId, pdf, categoryId),
    NOT_FOUND
  );
  assert.deepEqual(fs.readdirSync(UPLOAD_ROOT), []);

  // On the owner's own property it still works.
  await db.query('DELETE FROM files WHERE file_id = $1', [fileId]);
  const created = await propertyFileService.createFile(ownerId, propertyId, pdf, categoryId);
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
