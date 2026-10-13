// Tenant Invite: owner-created Tenants set their own
// password from an Invite email.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { useTestDatabase } from './support/db';
import { useApp } from './support/http';
import { useOutbox, tokenIn } from './support/mail';
import * as fixtures from './support/fixtures';
import jwt from 'jsonwebtoken';
import { generateInviteToken, generateResetToken, generateVerificationToken } from '../utils/jwtGenerator';

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
// The token in the Invite email of the Tenant created last.
const inviteToken = () => tokenIn(outbox[outbox.length - 1]);

test('creating a Tenant emails an Invite', async () => {
  const res = await createTenant();
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.status, 'AK');

  const email = res.body.data.tenant.email;
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].to, email);
  assert.ok(outbox[0].html.includes(inviteLink(tokenIn(outbox[0]))), outbox[0].html);
  assert.equal((jwt.decode(tokenIn(outbox[0])) as any).purpose, 'invite');
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

for (const [what, user_type_id] of [['without a user_type_id', undefined], ['with another user_type_id', 2]] as const) {
  test(`a Tenant created ${what} is a tenant`, async () => {
    const res = await createTenant({ user_type_id });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.tenant.user_type_id, 3);
  });
}

test('resending an Invite to a Tenant not linked to the caller is 404', async () => {
  const other = await fixtures.owner();
  const stranger = await fixtures.tenant({ linkedTo: other });
  await db.query('UPDATE users SET invite_pending = TRUE WHERE user_id = $1', [stranger]);
  const res = await app.call('POST', `/property-owner/tenant/${stranger}/invite`, { as: 'owner' });
  assert.equal(res.status, 404);
  assert.equal(res.body.status, 'NAK');
  assert.equal(outbox.length, 0);
});

test('resending an Invite to a Tenant who has set a password is 400', async () => {
  const res = await app.call('POST', `/property-owner/tenant/${app.ids.tenant}/invite`, { as: 'owner' });
  assert.equal(res.status, 400);
  assert.equal(res.body.status, 'NAK');
  assert.equal(outbox.length, 0);
});

test('resending an Invite emails a new link', async () => {
  const created = await createTenant();
  const tenantId = created.body.data.tenant.user_id;
  outbox.length = 0;

  const res = await app.call('POST', `/property-owner/tenant/${tenantId}/invite`, { as: 'owner' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.status, 'AK');
  assert.equal(typeof res.body.message, 'string');
  assert.equal(outbox.length, 1);
  assert.equal(outbox[0].to, created.body.data.tenant.email);
  assert.ok(outbox[0].html.includes(inviteLink(tokenIn(outbox[0]))));
  assert.equal((jwt.decode(tokenIn(outbox[0])) as any).purpose, 'invite');
});

const NEW_PASSWORD = 'NewPass1!';
const setPassword = (token: string, password = NEW_PASSWORD) =>
  app.call('POST', `/auth/reset-password?token=${encodeURIComponent(token)}`, {
    body: { newPassword: password, confirmNewPassword: password },
  });
const login = (email: string, password = NEW_PASSWORD) =>
  app.call('POST', '/auth/login', { body: { email, password } });

test('an Invite token sets the password, clears invite pending and verifies the Tenant', async () => {
  const created = await createTenant();
  const { email, user_id } = created.body.data.tenant;
  // A Tenant from before Invites: backfilled invite pending, never verified.
  await db.query('UPDATE users SET is_verified = FALSE WHERE user_id = $1', [user_id]);

  const res = await setPassword(inviteToken());
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal(res.body.status, 'AK');

  const signedIn = await login(email);
  assert.equal(signedIn.status, 200, JSON.stringify(signedIn.body));
  const owners = await app.call('GET', `/property-owner/tenant/${user_id}`, { as: 'owner' });
  assert.equal(owners.body.data.invite_pending, false);
});

test('a used Invite token is rejected', async () => {
  const created = await createTenant();
  assert.equal((await setPassword(inviteToken())).status, 200);
  const again = await setPassword(inviteToken(), 'Other1!pw');
  assert.equal(again.status, 400);
  assert.equal(again.body.status, 'NAK');
  assert.equal((await login(created.body.data.tenant.email)).status, 200);
});

test('an expired Invite token is 400 INVITE_EXPIRED', async () => {
  const created = await createTenant();
  const expired = jwt.sign(
    { email: created.body.data.tenant.email, purpose: 'invite', exp: Math.floor(Date.now() / 1000) - 60 },
    process.env.JWT_SECRET as string
  );
  const res = await setPassword(expired);
  assert.equal(res.status, 400);
  assert.deepEqual(res.body, {
    status: 'NAK',
    message: 'This invite has expired, ask your Property Owner to resend it',
    code: 'INVITE_EXPIRED',
  });
});

test('a verification token is rejected by reset-password', async () => {
  const created = await createTenant();
  const res = await setPassword(generateVerificationToken(created.body.data.tenant.email));
  assert.equal(res.status, 400);
  assert.equal(res.body.status, 'NAK');
  assert.equal(res.body.code, undefined);
});

test('a reset token still sets the password, and clears invite pending', async () => {
  const created = await createTenant();
  const { email, user_id } = created.body.data.tenant;
  const res = await setPassword(generateResetToken(email));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  assert.equal((await login(email)).status, 200);
  const owners = await app.call('GET', `/property-owner/tenant/${user_id}`, { as: 'owner' });
  assert.equal(owners.body.data.invite_pending, false);
});

test('a reset token also verifies the user: the emailed link proves they control the address', async () => {
  // A Tenant from before Invites who used forgot-password instead of an Invite.
  const created = await createTenant();
  const { email, user_id } = created.body.data.tenant;
  await db.query('UPDATE users SET is_verified = FALSE WHERE user_id = $1', [user_id]);

  const res = await setPassword(generateResetToken(email));
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const signedIn = await login(email);
  assert.equal(signedIn.status, 200, JSON.stringify(signedIn.body));
});

test('invite_pending is on every row of the tenant list and on the tenant detail', async () => {
  const created = await createTenant();
  const pendingId = created.body.data.tenant.user_id;

  const list = await app.call('GET', '/property-owner/tenants', { as: 'owner' });
  assert.equal(list.status, 200);
  const byId = Object.fromEntries(list.body.data.map((r: any) => [r.tenant_id, r.invite_pending]));
  assert.equal(byId[pendingId], true);
  assert.equal(byId[app.ids.tenant], false);

  const paged = await app.call('GET', '/property-owner/tenants?limit=50', { as: 'owner' });
  assert.ok(paged.body.data.every((r: any) => typeof r.invite_pending === 'boolean'));

  const pending = await app.call('GET', `/property-owner/tenant/${pendingId}`, { as: 'owner' });
  assert.equal(pending.body.data.invite_pending, true);
  const active = await app.call('GET', `/property-owner/tenant/${app.ids.tenant}`, { as: 'owner' });
  assert.equal(active.body.data.invite_pending, false);
});

test('verify-email rejects reset and Invite tokens', async () => {
  const created = await createTenant();
  const email = created.body.data.tenant.email;
  for (const token of [generateResetToken(email), generateInviteToken(email)]) {
    const res = await app.call('GET', `/auth/verify-email?token=${encodeURIComponent(token)}`);
    assert.equal(res.status, 400);
  }
  const ok = await app.call('GET', `/auth/verify-email?token=${encodeURIComponent(generateVerificationToken(email))}`);
  assert.equal(ok.status, 200);
});
