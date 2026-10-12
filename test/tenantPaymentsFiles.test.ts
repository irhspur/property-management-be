// Tenant portal: a Tenant's Payments, Payment Receipts and Agreement Documents
// (/tenant, ticket 04). Each route answers what its owner counterpart answers
// for the same records, and 404 for anything that isn't the Tenant's.
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { useTestDatabase } from './support/db';
import { useApp } from './support/http';
import * as fixtures from './support/fixtures';
import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';

useTestDatabase();

const app = useApp((a) => {
  a.use('/tenant', require('../routes/tenantPortalRoutes'));
  a.use('/property-owner', require('../routes/agreementRoutes'));
  a.use('/property-owner', require('../routes/paymentRoutes'));
  a.use('/files/view', require('../routes/fileViewRoutes'));
});

// A Document row whose bytes are on disk, so its view URL can be followed.
const stored = async (cols: { user_id: string } & Record<string, unknown>, content: string): Promise<string> => {
  const dir = path.join(process.env.UPLOAD_ROOT as string, cols.user_id);
  fs.mkdirSync(dir, { recursive: true });
  const file_path = path.join(dir, `${randomUUID()}.pdf`);
  fs.writeFileSync(file_path, content);
  return fixtures.document({ ...cols, file_path });
};

// Follow a Signed View URL and return the bytes it serves.
const follow = async (url: string): Promise<string> => {
  const res = await fetch(url);
  assert.equal(res.status, 200);
  return res.text();
};

const ids: Record<string, string> = {};
const ownerBase = () => `/property-owner/tenant/${app.ids.tenant}/agreement/${ids.agreement}`;
const mineBase = () => `/tenant/agreement/${ids.agreement}`;

// In a suite so it runs after useApp() has created its users.
describe('tenant portal: payments, receipts and agreement documents', () => {
  before(async () => {
    const { owner, tenant } = app.ids;
    ids.agreement = (await fixtures.agreement({ property: await fixtures.property(owner), tenant })).agreement_id;
    ids.rent = await fixtures.payment(ids.agreement, { paidOn: '2025-01-20', covers: '2025-01-15' });
    ids.deposit = await fixtures.payment(ids.agreement, { purpose: 3, paidOn: '2025-01-10', covers: null });

    // Another Tenant of the same owner, with an Agreement and a Payment.
    const other = await fixtures.tenant({ linkedTo: owner });
    ids.others = (await fixtures.agreement({ property: await fixtures.property(owner), tenant: other })).agreement_id;
    ids.othersPayment = await fixtures.payment(ids.others);

    ids.receipt = await stored({ user_id: tenant, payment_id: ids.rent }, 'rent receipt');
    ids.othersReceipt = await fixtures.document({ user_id: other, payment_id: ids.othersPayment });

    const { agreement_file_category_id: category } = await fixtures.lookups();
    ids.contract = await stored({ user_id: tenant, agreement_id: ids.agreement, agreement_file_category_id: category }, 'contract');
    ids.othersContract = await fixtures.document({ user_id: other, agreement_id: ids.others, agreement_file_category_id: category });
  });

  test("payments are the owner's list for the same Agreement", async () => {
    const mine = await app.call('GET', `${mineBase()}/payments`, { as: 'tenant' });
    const owners = await app.call('GET', `${ownerBase()}/payments`, { as: 'owner' });
    assert.equal(mine.status, 200);
    assert.equal(mine.body.status, 'AK');
    assert.equal(mine.body.data.length, 2);
    assert.deepEqual(mine.body.data, owners.body.data);
  });

  test("another Tenant's Agreement has no payments for this Tenant", async () => {
    const res = await app.call('GET', `/tenant/agreement/${ids.others}/payments`, { as: 'tenant' });
    assert.equal(res.status, 404);
    assert.equal(res.body.status, 'NAK');
  });

  test("receipts are the owner's list for the same Payment", async () => {
    const mine = await app.call('GET', `${mineBase()}/payment/${ids.rent}/receipts`, { as: 'tenant' });
    const owners = await app.call('GET', `${ownerBase()}/payment/${ids.rent}/receipts`, { as: 'owner' });
    assert.equal(mine.status, 200);
    assert.equal(mine.body.status, 'AK');
    assert.deepEqual(mine.body.data.map((f: any) => f.file_id), [ids.receipt]);
    assert.deepEqual(mine.body.data, owners.body.data);
  });

  test('receipts are 404 for a Payment on another Agreement, or on an Agreement not theirs', async () => {
    const onOther = await app.call('GET', `${mineBase()}/payment/${ids.othersPayment}/receipts`, { as: 'tenant' });
    assert.equal(onOther.status, 404);
    const notTheirs = await app.call('GET', `/tenant/agreement/${ids.others}/payment/${ids.othersPayment}/receipts`, { as: 'tenant' });
    assert.equal(notTheirs.status, 404);
  });

  test('a receipt view URL serves the receipt, as the owner\'s does', async () => {
    const mine = await app.call('GET', `${mineBase()}/payment/${ids.rent}/receipt/${ids.receipt}/view-url`, { as: 'tenant' });
    const owners = await app.call('GET', `${ownerBase()}/payment/${ids.rent}/receipt/${ids.receipt}/view-url`, { as: 'owner' });
    assert.equal(mine.status, 200);
    assert.equal(mine.body.status, 'AK');
    assert.deepEqual(Object.keys(mine.body.data), ['url']);
    assert.equal(await follow(mine.body.data.url), 'rent receipt');
    assert.equal(await follow(owners.body.data.url), 'rent receipt');
  });

  test('a receipt view URL is 404 for a receipt on another Payment, or a Payment not theirs', async () => {
    const otherReceipt = await app.call('GET', `${mineBase()}/payment/${ids.rent}/receipt/${ids.othersReceipt}/view-url`, { as: 'tenant' });
    assert.equal(otherReceipt.status, 404);
    const deposit = await app.call('GET', `${mineBase()}/payment/${ids.deposit}/receipt/${ids.receipt}/view-url`, { as: 'tenant' });
    assert.equal(deposit.status, 404);
    const notTheirs = await app.call(
      'GET', `/tenant/agreement/${ids.others}/payment/${ids.othersPayment}/receipt/${ids.othersReceipt}/view-url`, { as: 'tenant' }
    );
    assert.equal(notTheirs.status, 404);
  });

  test("Agreement Documents are the owner's list for the same Agreement", async () => {
    const mine = await app.call('GET', `${mineBase()}/files`, { as: 'tenant' });
    const owners = await app.call('GET', `${ownerBase()}/files`, { as: 'owner' });
    assert.equal(mine.status, 200);
    assert.equal(mine.body.status, 'AK');
    assert.deepEqual(mine.body.data.map((f: any) => f.file_id), [ids.contract]);
    assert.deepEqual(mine.body.data, owners.body.data);
  });

  test("another Tenant's Agreement has no Documents for this Tenant", async () => {
    const res = await app.call('GET', `/tenant/agreement/${ids.others}/files`, { as: 'tenant' });
    assert.equal(res.status, 404);
  });

  test("an Agreement Document view URL serves the Document, as the owner's does", async () => {
    const mine = await app.call('GET', `${mineBase()}/file/${ids.contract}/view-url`, { as: 'tenant' });
    const owners = await app.call('GET', `${ownerBase()}/file/${ids.contract}/view-url`, { as: 'owner' });
    assert.equal(mine.status, 200);
    assert.equal(mine.body.status, 'AK');
    assert.deepEqual(Object.keys(mine.body.data), ['url']);
    assert.equal(await follow(mine.body.data.url), 'contract');
    assert.equal(await follow(owners.body.data.url), 'contract');
  });

  test('an Agreement Document view URL is 404 for a file on another parent, or an Agreement not theirs', async () => {
    const othersFile = await app.call('GET', `${mineBase()}/file/${ids.othersContract}/view-url`, { as: 'tenant' });
    assert.equal(othersFile.status, 404);
    // A receipt hangs off a Payment, not the Agreement.
    const receipt = await app.call('GET', `${mineBase()}/file/${ids.receipt}/view-url`, { as: 'tenant' });
    assert.equal(receipt.status, 404);
    const notTheirs = await app.call('GET', `/tenant/agreement/${ids.others}/file/${ids.othersContract}/view-url`, { as: 'tenant' });
    assert.equal(notTheirs.status, 404);
    const malformed = await app.call('GET', `${mineBase()}/file/not-a-uuid/view-url`, { as: 'tenant' });
    assert.equal(malformed.status, 404);
  });

  test('an owner token on these routes is 403', async () => {
    const res = await app.call('GET', `${mineBase()}/payments`, { as: 'owner' });
    assert.equal(res.status, 403);
  });
});
