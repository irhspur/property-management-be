// Tenant Invite (tenant-portal spec 1b–1e): owner-created Tenants set their own
// password from an Invite email.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useTestDatabase } from './support/db';
import { useApp } from './support/http';
import { useOutbox } from './support/mail';

const db = useTestDatabase();
const outbox = useOutbox();
const app = useApp((a) => {
  a.use('/auth', require('../routes/authRoutes'));
  a.use('/property-owner', require('../routes/tenantRoutes'));
});

let seq = 0;
const newTenantBody = (extra: Record<string, unknown> = {}) => {
  seq += 1;
  const n = `${process.pid}${Date.now()}`.slice(-8) + String(seq).padStart(2, '0');
  return {
    email: `invitee.${n}@invite.test`,
    user_type_id: 3,
    first_name: 'Sita',
    last_name: 'Sharma',
    dob: '1990-01-01',
    father_full_name: 'Ram Sharma',
    nin_number: 'N123',
    mobile_number: `98${n}`,
    citizenship_number: 'C-123',
    citizenship_issue_date: '2010-01-01',
    bank_account_number: '123456',
    bank_name: 'Nabil Bank',
    ward_number: 3,
    street_name: 'Lazimpat',
    contact_number_1: '9800000000',
    contact_address: 'Lazimpat, Kathmandu',
    ...extra,
  };
};

const createTenant = (extra: Record<string, unknown> = {}) =>
  app.call('POST', '/property-owner/tenant', { as: 'owner', body: newTenantBody(extra) });

const inviteLink = (token: string) => `${process.env.BASE_URL}/set-password?token=${token}&kind=invite`;

test('creating a Tenant emails an Invite and returns its token', async () => {
  const res = await createTenant();
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.status, 'AK');
  assert.equal(typeof res.body.token, 'string');

  const email = res.body.data.tenant.email;
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].to, email);
  assert.ok(outbox[0].html.includes(inviteLink(res.body.token)), outbox[0].html);
});

test('a created Tenant is verified, invite pending, and has no usable password even if the owner sent one', async () => {
  const res = await createTenant({ password: 'Owner1!pw' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const row = await db.one('SELECT password, is_verified, invite_pending FROM users WHERE user_id = $1', [
    res.body.data.tenant.user_id,
  ]);
  assert.equal(row.is_verified, true);
  assert.equal(row.invite_pending, true);
  assert.notEqual(row.password, 'Owner1!pw');
  assert.match(row.password, /^\$2[aby]\$/);
});
