// File store (ADR-0010): write order, cleanup on rollback, and deletes that
// remove every file their cascade orphans — including files in the previous
// name-based layout.
import fs from 'fs';
import path from 'path';
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { useTestDatabase } from './support/db';
import * as fixtures from './support/fixtures';
import * as fileStore from '../services/fileStore';
import * as tenantService from '../services/tenantService';
import * as propertyService from '../services/propertyService';
import * as userService from '../services/userService';
import { verifyViewToken } from '../utils/viewToken';
import { MulterFile } from '../types';

const db = useTestDatabase();
const UPLOAD_ROOT = db.uploadRoot;
let lookups: fixtures.Lookups;

const pdf = (name = 'x.pdf'): MulterFile =>
  ({ originalname: name, mimetype: 'application/pdf', size: 4, buffer: Buffer.from('%PDF') } as MulterFile);

// A file on disk at an arbitrary path, as the previous layout left them.
const legacyFile = (...parts: string[]): string => {
  const filePath = path.join(UPLOAD_ROOT, ...parts);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, 'old');
  return filePath;
};

// The Agreements here are ended, so deleting their property or people is allowed.
const endedAgreement = async (property: string, tenant: string): Promise<string> =>
  (await fixtures.agreement({ property, tenant, end: '2025-06-30', status: 'ended' })).agreement_id;

before(async () => {
  lookups = await fixtures.lookups();
});

test('save: bytes under <root>/<user_id>/<uuid><ext>, extension from the MIME type', async () => {
  const userId = await fixtures.owner({ first: 'saver' });
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
  const userId = await fixtures.owner({ first: 'failer' });
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
  assert.equal((await db.one('SELECT first_name FROM user_details WHERE user_id = $1', [userId])).first_name, 'failer');
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
  const ownerId = await fixtures.owner({ first: 'photo-owner' });
  const tenantId = await fixtures.tenant({ first: 'photo-tenant' });
  await fixtures.link(ownerId, tenantId);
  const png = { originalname: 'me.png', mimetype: 'image/png', size: 4, buffer: Buffer.from('png1') } as MulterFile;

  await tenantService.setPhoto(ownerId, tenantId, png, 'http://test');
  const first = (await db.one('SELECT profile_photo_path FROM users WHERE user_id = $1', [tenantId])).profile_photo_path;
  assert.ok(first.endsWith('.png') && fs.existsSync(first));

  await tenantService.setPhoto(ownerId, tenantId, png, 'http://test');
  const second = (await db.one('SELECT profile_photo_path FROM users WHERE user_id = $1', [tenantId])).profile_photo_path;
  assert.notEqual(second, first);
  assert.ok(!fs.existsSync(first) && fs.existsSync(second));

  await tenantService.removePhoto(ownerId, tenantId);
  assert.ok(!fs.existsSync(second));
});

test('tenant delete removes every file the cascade orphans, in any folder', async () => {
  const ownerId = await fixtures.owner({ first: 't-owner' });
  // No mobile number: the old code stored these under fallback folders and
  // then removed "uploads/null", leaving them behind.
  const tenantId = await fixtures.tenant({ first: 't-tenant', mobile: null });
  await fixtures.link(ownerId, tenantId);
  const agreementId = await endedAgreement(await fixtures.property(ownerId, { name: 'Tenant Flat' }), tenantId);
  const payment_id = await fixtures.payment(agreementId);

  const personal = legacyFile('unknown', 'personal.pdf');
  const agreementDoc = legacyFile(tenantId, 'contract.pdf');
  const receipt = legacyFile(tenantId, 'receipt.pdf');
  const photo = legacyFile(tenantId, 'profile_photo_1.png');
  await fixtures.document({ user_id: tenantId, file_category_id: lookups.file_category_id, file_path: personal });
  await fixtures.document({
    user_id: tenantId, agreement_id: agreementId, agreement_file_category_id: lookups.agreement_file_category_id,
    file_path: agreementDoc,
  });
  await fixtures.document({ user_id: tenantId, payment_id, file_path: receipt });
  await db.query('UPDATE users SET profile_photo_path = $1 WHERE user_id = $2', [photo, tenantId]);
  const unrelated = legacyFile('unknown', 'someone-else.pdf');

  await tenantService.deleteTenant(ownerId, tenantId);
  for (const p of [personal, agreementDoc, receipt, photo]) assert.ok(!fs.existsSync(p), p);
  assert.ok(fs.existsSync(unrelated));
  fileStore.discard([unrelated]);
});

test('property delete removes its files even when the name has special characters', async () => {
  const ownerId = await fixtures.owner({ first: 'p-owner', mobile: '9800000001' });
  const tenantId = await fixtures.tenant({ first: 'p-tenant' });
  const name = 'Flat 2/B: "Lake" View?';
  const propertyId = await fixtures.property(ownerId, { name: name });
  const agreementId = await endedAgreement(propertyId, tenantId);

  // The old upload path sanitised the name; the old delete didn't.
  const deed = legacyFile('9800000001', 'Flat 2_B_ _Lake_ View_', 'deed.pdf');
  const contract = legacyFile(tenantId, 'contract.pdf');
  await fixtures.document({
    user_id: ownerId, property_id: propertyId, property_file_category_id: lookups.property_file_category_id,
    file_path: deed,
  });
  await fixtures.document({
    user_id: tenantId, agreement_id: agreementId, agreement_file_category_id: lookups.agreement_file_category_id,
    file_path: contract,
  });

  await propertyService.deleteProperty(propertyId, ownerId);
  assert.ok(!fs.existsSync(deed));
  assert.ok(!fs.existsSync(contract));
});

test('owner account delete reaches Agreement documents stored in tenants\' folders', async () => {
  const ownerId = await fixtures.owner({ first: 'u-owner' });
  const tenantId = await fixtures.tenant({ first: 'u-tenant' });
  const propertyId = await fixtures.property(ownerId, { name: 'Owner House' });
  const agreementId = await endedAgreement(propertyId, tenantId);

  const own = legacyFile(ownerId, 'citizenship.pdf');
  const deed = legacyFile(ownerId, 'deed.pdf');
  const contract = legacyFile(tenantId, 'contract.pdf');
  const tenantOwn = legacyFile(tenantId, 'tenant-id.pdf');
  await fixtures.document({ user_id: ownerId, file_category_id: lookups.file_category_id, file_path: own });
  await fixtures.document({
    user_id: ownerId, property_id: propertyId, property_file_category_id: lookups.property_file_category_id,
    file_path: deed,
  });
  await fixtures.document({
    user_id: tenantId, agreement_id: agreementId, agreement_file_category_id: lookups.agreement_file_category_id,
    file_path: contract,
  });
  // The tenant's own Document survives: deleting the owner doesn't delete the tenant.
  await fixtures.document({ user_id: tenantId, file_category_id: lookups.file_category_id, file_path: tenantOwn });

  await userService.deleteUser(ownerId);
  for (const p of [own, deed, contract]) assert.ok(!fs.existsSync(p), p);
  assert.ok(fs.existsSync(tenantOwn));
  fileStore.discard([tenantOwn]);
});

test('view URLs: a Document link names the file, a photo link only exists with a photo', () => {
  const url = fileStore.viewUrl({ file_id: 'f-1', user_id: 'u-1' }, 'http://host');
  const token = url.replace('http://host/files/view/', '');
  assert.notEqual(token, url);
  assert.equal(verifyViewToken(token).file_id, 'f-1');

  assert.equal(fileStore.photoUrl('u-1', null, 'http://host'), null);
  const photo = fileStore.photoUrl('u-1', 'uploads/u-1/x.png', 'http://host')!;
  assert.equal(verifyViewToken(photo.replace('http://host/files/view/', '')).kind, 'profile_photo');
});
