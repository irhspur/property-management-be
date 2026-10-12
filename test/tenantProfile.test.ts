// Tenant portal: a Tenant's personal Documents, profile and owner contact card
// (/tenant).
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { useTestDatabase } from './support/db';
import { useApp } from './support/http';
import * as fixtures from './support/fixtures';
import pool from '../config/database';

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

  test('GET /user/files gives a Tenant exactly the same rows', async () => {
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

// Each test starts the useApp() Tenant with no Agreements and no Ownership
// Links (undone with the test's savepoint), then links it to `owners` with
// creation times one day apart, oldest first.
const relinkTenant = async (...owners: string[]): Promise<void> => {
  const tenant = app.ids.tenant;
  await pool.query('DELETE FROM agreements WHERE tenant_id = $1', [tenant]);
  await pool.query('DELETE FROM owner_tenant WHERE tenant_id = $1', [tenant]);
  for (const [i, owner] of owners.entries()) {
    await pool.query(
      `INSERT INTO owner_tenant (property_owner_id, tenant_id, created_at) VALUES ($1, $2, '2025-01-01'::timestamp + $3 * interval '1 day')`,
      [owner, tenant, i]
    );
  }
};

describe('tenant portal: Property Owner card', () => {
  test('is exactly first_name, last_name, profile_photo_url, mobile_number and email', async () => {
    const owner = await fixtures.owner({ first: 'Sita', last: 'Sharma', mobile: '9800000001' });
    await relinkTenant(owner);
    const { rows: [{ email }] } = await pool.query('SELECT email FROM users WHERE user_id = $1', [owner]);

    const res = await app.call('GET', '/tenant/owner', { as: 'tenant' });
    assert.equal(res.status, 200);
    assert.equal(res.body.status, 'AK');
    assert.deepEqual(res.body.data, {
      first_name: 'Sita', last_name: 'Sharma', profile_photo_url: null, mobile_number: '9800000001', email,
    });
  });

  test("profile_photo_url is a Signed View URL when the owner has a photo", async () => {
    await relinkTenant(await fixtures.owner({ photoPath: 'uploads/none/photo.jpg' }));
    const res = await app.call('GET', '/tenant/owner', { as: 'tenant' });
    assert.match(res.body.data.profile_photo_url, /\/files\/view\/[^/]+$/);
  });

  test('with several links and no Agreement, the most recently linked owner', async () => {
    const older = await fixtures.owner({ first: 'Older' });
    const newer = await fixtures.owner({ first: 'Newer' });
    await relinkTenant(older, newer);
    const res = await app.call('GET', '/tenant/owner', { as: 'tenant' });
    assert.equal(res.body.data.first_name, 'Newer');
  });

  test('with Agreements, the owner of the first one in /tenant/agreements order', async () => {
    const a = await fixtures.owner({ first: 'Active' });
    const e = await fixtures.owner({ first: 'Ended' });
    const latest = await fixtures.owner({ first: 'Latest' });
    await relinkTenant(a, e, latest);
    const tenant = app.ids.tenant;
    await fixtures.agreement({ property: await fixtures.property(e), tenant, status: 'ended', endedAt: '2026-01-01' });
    await fixtures.agreement({ property: await fixtures.property(a), tenant, start: '2025-06-01' });

    const res = await app.call('GET', '/tenant/owner', { as: 'tenant' });
    assert.equal(res.body.data.first_name, 'Active');
  });

  test('with no Ownership Link and no Agreement, 404', async () => {
    await relinkTenant();
    const res = await app.call('GET', '/tenant/owner', { as: 'tenant' });
    assert.equal(res.status, 404);
    assert.equal(res.body.status, 'NAK');
  });
});

describe('tenant portal: profile', () => {
  test("is the owner's tenant payload for the caller, plus password dates", async () => {
    await pool.query(`UPDATE users SET password_last_changed = '2025-03-10 08:30:00' WHERE user_id = $1`, [app.ids.tenant]);
    const mine = await app.call('GET', '/tenant/profile', { as: 'tenant' });
    const owners = await app.call('GET', `/property-owner/tenant/${app.ids.tenant}`, { as: 'owner' });
    assert.equal(mine.status, 200);
    assert.equal(mine.body.status, 'AK');
    const { password_last_changed, password_expires_on, ...rest } = mine.body.data;
    assert.deepEqual(rest, owners.body.data);
    assert.equal(password_last_changed, '2025-03-10T08:30:00.000Z');
    // Login's rule: a password expires a year after it was last changed.
    assert.equal(password_expires_on, '2026-03-10T08:30:00.000Z');
  });

  test('without password_last_changed both password dates are null', async () => {
    await pool.query('UPDATE users SET password_last_changed = NULL WHERE user_id = $1', [app.ids.tenant]);
    const res = await app.call('GET', '/tenant/profile', { as: 'tenant' });
    assert.equal(res.body.data.password_last_changed, null);
    assert.equal(res.body.data.password_expires_on, null);
  });

  test('with several owners, it is seen as the owner of the owner card', async () => {
    const older = await fixtures.owner({ first: 'Older' });
    const newer = await fixtures.owner({ first: 'Newer' });
    await relinkTenant(older, newer);
    const res = await app.call('GET', '/tenant/profile', { as: 'tenant' });
    assert.equal(res.status, 200);
    assert.equal(res.body.data.user_id, app.ids.tenant);
    assert.equal(res.body.data.associated_property_owner, 'Newer');
  });

  test("with Agreements, it is seen as the first Agreement's owner while that owner is linked", async () => {
    const agreed = await fixtures.owner({ first: 'Agreed' });
    const latest = await fixtures.owner({ first: 'Latest' });
    await relinkTenant(agreed, latest);
    await fixtures.agreement({ property: await fixtures.property(agreed), tenant: app.ids.tenant });
    const res = await app.call('GET', '/tenant/profile', { as: 'tenant' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.associated_property_owner, 'Agreed');
  });

  test("when the first Agreement's owner is no longer linked, it is seen as the most recently linked owner", async () => {
    const unlinked = await fixtures.owner({ first: 'Unlinked' });
    const older = await fixtures.owner({ first: 'Older' });
    const newer = await fixtures.owner({ first: 'Newer' });
    await relinkTenant(older, newer);
    await fixtures.agreement({ property: await fixtures.property(unlinked), tenant: app.ids.tenant });
    const res = await app.call('GET', '/tenant/profile', { as: 'tenant' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.user_id, app.ids.tenant);
    assert.equal(res.body.data.associated_property_owner, 'Newer');
  });

  test('with no Ownership Link, 404', async () => {
    await relinkTenant();
    const res = await app.call('GET', '/tenant/profile', { as: 'tenant' });
    assert.equal(res.status, 404);
  });
});
