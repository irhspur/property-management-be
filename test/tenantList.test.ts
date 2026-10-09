// Tenant list tenancy summary vs the dashboard (My Tenants spec, item 3).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import { useTestDatabase } from './support/db';
import * as fixtures from './support/fixtures';
import * as dashboardService from '../services/dashboardService';
import * as tenantService from '../services/tenantService';
import { today, addDays } from '../utils/businessDate';

const db = useTestDatabase();

const BASE_URL = 'http://test';
let ownerId: string;
const tenants: Record<string, string> = {};

before(async () => {
  ownerId = await fixtures.owner();
  const specs: [string, string, string | null, string][] = [
    ['open', 'Arjun', 'Bahadur', 'Koirala'],
    ['soon', 'Sita', null, 'Sharma'],
    ['overdue', 'Hari', null, 'Thapa'],
    ['ended', 'Gita', null, 'Rai'],
    ['none', 'Ram', null, '100%_Literal'],
    ['second', 'Maya', null, 'Gurung'],
  ];
  for (const [key, first, middle, last] of specs) {
    tenants[key] = await fixtures.tenant({ first, middle, last, linkedTo: ownerId });
  }

  const todayStr = today();
  const agreement = async (tenantKey: string, end: string | null, status: 'active' | 'ended') =>
    fixtures.agreement({
      property: await fixtures.property(ownerId, { name: `House ${tenantKey}`, vacant: status !== 'active' }),
      tenant: tenants[tenantKey], start: addDays(todayStr, -400), end, status,
    });
  await agreement('open', null, 'active');
  await agreement('soon', addDays(todayStr, 10), 'active');
  await agreement('overdue', addDays(todayStr, -5), 'active');
  await agreement('ended', addDays(todayStr, -30), 'ended');
  await agreement('second', addDays(todayStr, 31), 'active');
});

const statusOf = (rows: Record<string, any>[], key: string) =>
  rows.find((r) => r.tenant_id === tenants[key])?.tenancy?.status ?? null;

test('tenancy status follows the agreement and the 30-day expiring rule', async () => {
  const { data } = await tenantService.getTenantsByOwner(ownerId, BASE_URL);
  assert.equal(statusOf(data, 'open'), 'active');
  assert.equal(statusOf(data, 'soon'), 'expiring');
  assert.equal(statusOf(data, 'overdue'), 'expiring');
  assert.equal(statusOf(data, 'ended'), 'ended');
  assert.equal(statusOf(data, 'second'), 'active');
  assert.equal(data.find((r) => r.tenant_id === tenants.none)?.tenancy, null);
});

test('dashboard tenants.active equals tenants with status active or expiring', async () => {
  const dashboard = await dashboardService.getDashboard(ownerId);
  const { data } = await tenantService.getTenantsByOwner(ownerId, BASE_URL);
  const holding = data.filter((r) => r.tenancy?.status === 'active' || r.tenancy?.status === 'expiring');
  assert.equal(holding.length, 4);
  assert.equal(dashboard.tenants.active, holding.length);
  assert.equal(dashboard.tenants.added_this_month, 6);
});

test('status filter matches tenancy.status, and none means no tenancy', async () => {
  for (const status of ['active', 'expiring', 'ended'] as const) {
    const { data } = await tenantService.getTenantsByOwner(ownerId, BASE_URL, { status });
    assert.ok(data.length > 0);
    assert.ok(data.every((r) => r.tenancy?.status === status), status);
  }
  const { data } = await tenantService.getTenantsByOwner(ownerId, BASE_URL, { status: 'none' });
  assert.deepEqual(data.map((r) => r.tenant_id), [tenants.none]);
});

test('q matches full name with middle name, property name, and treats % and _ literally', async () => {
  const byName = await tenantService.getTenantsByOwner(ownerId, BASE_URL, { q: 'arjun koirala' });
  assert.deepEqual(byName.data.map((r) => r.tenant_id), [tenants.open]);
  const byFullName = await tenantService.getTenantsByOwner(ownerId, BASE_URL, { q: 'ARJUN BAHADUR' });
  assert.deepEqual(byFullName.data.map((r) => r.tenant_id), [tenants.open]);
  const byProperty = await tenantService.getTenantsByOwner(ownerId, BASE_URL, { q: 'house soon' });
  assert.deepEqual(byProperty.data.map((r) => r.tenant_id), [tenants.soon]);
  const literal = await tenantService.getTenantsByOwner(ownerId, BASE_URL, { q: '100%_' });
  assert.deepEqual(literal.data.map((r) => r.tenant_id), [tenants.none]);
  const wildcard = await tenantService.getTenantsByOwner(ownerId, BASE_URL, { q: '%' });
  assert.deepEqual(wildcard.data.map((r) => r.tenant_id), [tenants.none]);
});

test('paging returns the full total, and an offset past the end returns no rows', async () => {
  const all = await tenantService.getTenantsByOwner(ownerId, BASE_URL);
  const page = await tenantService.getTenantsByOwner(ownerId, BASE_URL, { limit: 2, offset: 2 });
  assert.equal(page.total, 6);
  assert.deepEqual(page.data.map((r) => r.tenant_id), all.data.slice(2, 4).map((r) => r.tenant_id));
  const past = await tenantService.getTenantsByOwner(ownerId, BASE_URL, { limit: 10, offset: 50 });
  assert.deepEqual(past.data, []);
  assert.equal(past.total, 6);
});

test('rows carry profile_photo_url, never the stored path', async () => {
  const { data } = await tenantService.getTenantsByOwner(ownerId, BASE_URL);
  assert.ok(data.every((r) => r.profile_photo_url === null && !('profile_photo_path' in r)));
  await db.query(`UPDATE users SET profile_photo_path = 'uploads/x/p.jpg' WHERE user_id = $1`, [tenants.open]);
  const tenant = await tenantService.getTenant(ownerId, tenants.open, BASE_URL);
  assert.match(tenant.profile_photo_url, /^http:\/\/test\/files\/view\/.+/);
  assert.equal(tenant.tenancy.status, 'active');
});
