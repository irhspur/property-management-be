// Tenant portal: a Tenant's personal Documents, profile and owner contact card
// (/tenant, ticket 05).
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { useTestDatabase } from './support/db';
import { useApp } from './support/http';
import * as fixtures from './support/fixtures';

useTestDatabase();

const app = useApp((a) => {
  a.use('/tenant', require('../routes/tenantPortalRoutes'));
  a.use('/property-owner', require('../routes/tenantRoutes'));
  a.use('/user', require('../routes/userRoutes'));
});

// In a suite so it runs after useApp() has created its users.
describe('tenant portal: personal Documents', () => {
  const ids: Record<string, string> = {};

  before(async () => {
    const { owner, tenant } = app.ids;
    const l = await fixtures.lookups();
    ids.mine = await fixtures.document({ user_id: tenant, file_category_id: l.file_category_id });
    // An Agreement Document is stored under the Tenant too, but isn't personal.
    const agreement = await fixtures.agreement({ property: await fixtures.property(owner), tenant });
    ids.agreementDoc = await fixtures.document({
      user_id: tenant, agreement_id: agreement.agreement_id, agreement_file_category_id: l.agreement_file_category_id,
      file_path: 'uploads/none/agreement.pdf',
    });
    const other = await fixtures.tenant({ linkedTo: owner });
    ids.theirs = await fixtures.document({ user_id: other, file_category_id: l.file_category_id });
  });

  test("lists the caller's personal Documents, the same rows the owner sees", async () => {
    const mine = await app.call('GET', '/tenant/files', { as: 'tenant' });
    const owners = await app.call('GET', `/property-owner/tenant/${app.ids.tenant}/files`, { as: 'owner' });
    assert.equal(mine.status, 200);
    assert.equal(mine.body.status, 'AK');
    assert.deepEqual(mine.body.data.map((f: any) => f.file_id), [ids.mine]);
    assert.deepEqual(mine.body.data, owners.body.data);
  });

  test('GET /user/files gives a Tenant exactly the same rows (spec decision 14)', async () => {
    const mine = await app.call('GET', '/tenant/files', { as: 'tenant' });
    const user = await app.call('GET', '/user/files', { as: 'tenant' });
    assert.deepEqual(user.body.data, mine.body.data);
  });

  test("view-url signs the caller's own Document", async () => {
    const res = await app.call('GET', `/tenant/file/${ids.mine}/view-url`, { as: 'tenant' });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'AK');
    assert.match(res.body.data.url, /\/files\/view\/[^/]+$/);
  });

  for (const [what, id] of [
    ["another Tenant's Document", () => ids.theirs],
    ['an Agreement Document (not personal)', () => ids.agreementDoc],
    ['a malformed id', () => 'not-a-uuid'],
  ] as const) {
    test(`view-url is 404 for ${what}`, async () => {
      const res = await app.call('GET', `/tenant/file/${id()}/view-url`, { as: 'tenant' });
      assert.equal(res.status, 404);
      assert.equal(res.body.status, 'NAK');
    });
  }

  test('an owner token gets 403', async () => {
    const res = await app.call('GET', '/tenant/files', { as: 'owner' });
    assert.equal(res.status, 403);
  });
});
