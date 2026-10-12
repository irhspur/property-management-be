// Tenant portal: a Tenant's Payments, Payment Receipts and Agreement Documents
// (/tenant, ticket 04). Each route answers what its owner counterpart answers
// for the same records, and 404 for anything that isn't the Tenant's.
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { useTestDatabase } from './support/db';
import { useApp } from './support/http';
import * as fixtures from './support/fixtures';

useTestDatabase();

const app = useApp((a) => {
  a.use('/tenant', require('../routes/tenantPortalRoutes'));
  a.use('/property-owner', require('../routes/agreementRoutes'));
  a.use('/property-owner', require('../routes/paymentRoutes'));
});

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
});
