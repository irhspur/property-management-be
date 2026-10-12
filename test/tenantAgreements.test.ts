// Tenant portal: a Tenant's own Agreements and Statements (/tenant, ticket 03).
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

// In a suite so it runs after useApp() has created its users.
describe('tenant portal: agreements', () => {
  before(async () => {
    const { owner, tenant } = app.ids;
    const on = async (name: string) => fixtures.property(owner, { name });
    // Ended, with ended_at: ordered by it.
    ids.endedEarly = (await fixtures.agreement({
      property: await on('Early'), tenant, start: '2024-01-15', end: '2025-06-30', status: 'ended', endedAt: '2025-07-01',
    })).agreement_id;
    // Ended before ended_at existed: ordered by end_date.
    ids.endedLate = (await fixtures.agreement({
      property: await on('Late'), tenant, start: '2025-01-15', end: '2025-12-31', status: 'ended',
    })).agreement_id;
    ids.active = (await fixtures.agreement({ property: await on('Now'), tenant, start: '2026-01-15' })).agreement_id;

    // Another Tenant of the same owner.
    const other = await fixtures.tenant({ linkedTo: owner });
    ids.others = (await fixtures.agreement({ property: await on('Theirs'), tenant: other })).agreement_id;
  });

  test('a Tenant lists only their own Agreements, active first, then most recently ended', async () => {
    const res = await app.call('GET', '/tenant/agreements', { as: 'tenant' });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'AK');
    assert.deepEqual(
      res.body.data.map((a: any) => a.agreement_id),
      [ids.active, ids.endedLate, ids.endedEarly]
    );
  });

  test('list rows have the owner list row shape', async () => {
    const mine = await app.call('GET', '/tenant/agreements', { as: 'tenant' });
    const owners = await app.call('GET', `/property-owner/agreements?tenant_id=${app.ids.tenant}`, { as: 'owner' });
    const byId = (rows: any[]) => Object.fromEntries(rows.map((r) => [r.agreement_id, r]));
    assert.deepEqual(byId(mine.body.data), byId(owners.body.data));
  });

  test('a Property Owner token gets 403 on /tenant routes', async () => {
    const res = await app.call('GET', '/tenant/agreements', { as: 'owner' });
    assert.equal(res.status, 403);
    assert.equal(res.body.status, 'NAK');
  });
});
