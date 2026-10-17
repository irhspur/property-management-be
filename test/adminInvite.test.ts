// Admin Invite: an admin invites another admin from the admin console. The
// invitee sets their password from the link. The link is emailed, and also
// returned to the inviting admin to pass on, so inviting works without email.
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import jwt from 'jsonwebtoken';
import { useTestDatabase } from './support/db';
import { useApp } from './support/http';
import { useOutbox } from './support/mail';
import pool from '../config/database';

useTestDatabase();
const outbox = useOutbox();
const app = useApp((a) => {
  a.use('/auth', require('../routes/authRoutes'));
  a.use('/admin/admins', require('../routes/adminRoutes/admins'));
});

const ADMIN_BASE_URL = 'https://admin.example.test';
before(() => {
  process.env.ADMIN_BASE_URL = ADMIN_BASE_URL;
});

let seq = 0;
const newEmail = () => `invitee.${process.pid}${++seq}@admin-invite.test`;
const PASSWORD = 'Admin1!pw';

const invite = (email: string, as: 'admin' | 'owner' | 'tenant' = 'admin') =>
  app.call('POST', '/admin/admins', { as, body: { email } });

const tokenOf = (link: string) => new URL(link).searchParams.get('token') as string;

// Email sends after the response, without being waited for.
const settle = () => new Promise((resolve) => setImmediate(resolve));

const acceptInvite = (link: string, password = PASSWORD) =>
  app.call('POST', `/auth/reset-password?token=${tokenOf(link)}`, {
    body: { newPassword: password, confirmNewPassword: password },
  });

describe('POST /admin/admins', () => {
  test('creates a pending admin and returns the set-password link', async () => {
    const email = newEmail();
    const res = await invite(email);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.status, 'AK');

    const { admin, invite_link } = res.body.data;
    assert.equal(admin.email, email);
    assert.equal(admin.invite_pending, true);
    assert.equal('password' in admin, false);
    assert.ok(invite_link.startsWith(`${ADMIN_BASE_URL}/set-password?token=`), invite_link);
    assert.equal((jwt.decode(tokenOf(invite_link)) as any).purpose, 'invite');

    const { rows } = await pool.query(
      `SELECT ut.name AS user_type, u.is_verified FROM users u JOIN user_type ut ON ut.id = u.user_type_id WHERE u.email = $1`,
      [email]
    );
    assert.deepEqual(rows, [{ user_type: 'admin', is_verified: true }]);
  });

  test('emails the same link', async () => {
    const email = newEmail();
    const res = await invite(email);
    await settle();
    assert.equal(outbox.length, 1);
    assert.equal(outbox[0].to, email);
    assert.ok(outbox[0].html.includes(res.body.data.invite_link), outbox[0].html);
  });

  test('the invitee sets a password from the link, then logs in', async () => {
    const email = newEmail();
    const { invite_link } = (await invite(email)).body.data;

    const before = await app.call('POST', '/auth/login', { body: { email, password: PASSWORD } });
    assert.equal(before.status, 403);
    assert.equal(before.body.code, 'INVITE_PENDING');
    assert.match(before.body.message, /another admin/);

    const accepted = await acceptInvite(invite_link);
    assert.equal(accepted.status, 200, JSON.stringify(accepted.body));

    const after = await app.call('POST', '/auth/login', { body: { email, password: PASSWORD } });
    assert.equal(after.status, 200, JSON.stringify(after.body));
    assert.equal(after.body.data.user_type, 'admin');

    const again = await acceptInvite(invite_link, 'Other1!pw');
    assert.equal(again.status, 400, 'a used invite link must not work again');
  });

  test('refuses an email that already has an account', async () => {
    const email = newEmail();
    await invite(email);
    const res = await invite(email);
    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.equal(res.body.message, 'An account with this email already exists');
  });

  test('refuses an invalid email', async () => {
    const res = await invite('not-an-email');
    assert.equal(res.status, 400);
    assert.deepEqual(res.body.errors.map((e: { field: string }) => e.field), ['email']);
  });

  for (const as of ['owner', 'tenant'] as const) {
    test(`is admin-only (${as} refused)`, async () => {
      const email = newEmail();
      const res = await invite(email, as);
      assert.equal(res.status, 403, JSON.stringify(res.body));
      const { rowCount } = await pool.query('SELECT 1 FROM users WHERE email = $1', [email]);
      assert.equal(rowCount, 0);
    });
  }
});

describe('GET /admin/admins', () => {
  test('lists admins, pending ones included, and no one else', async () => {
    const email = newEmail();
    await invite(email);

    const res = await app.call('GET', '/admin/admins');
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const emails = res.body.data.map((a: { email: string }) => a.email);
    assert.ok(emails.includes(email));
    const listed = res.body.data.find((a: { email: string }) => a.email === email);
    assert.deepEqual(Object.keys(listed).sort(), ['created_at', 'email', 'invite_pending', 'is_active', 'user_id']);
    assert.equal(listed.invite_pending, true);

    const { rows } = await pool.query(
      `SELECT email FROM users WHERE user_id = ANY($1::uuid[])`,
      [[app.ids.owner, app.ids.tenant]]
    );
    for (const { email: other } of rows) assert.equal(emails.includes(other), false);
  });

  test('is admin-only', async () => {
    const res = await app.call('GET', '/admin/admins', { as: 'owner' });
    assert.equal(res.status, 403);
  });
});

describe('POST /admin/admins/:userId/invite', () => {
  test('returns a new link for a pending admin, and emails it', async () => {
    const created = (await invite(newEmail())).body.data;
    outbox.length = 0;

    const res = await app.call('POST', `/admin/admins/${created.admin.user_id}/invite`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const link = res.body.data.invite_link;
    assert.ok(link.startsWith(`${ADMIN_BASE_URL}/set-password?token=`), link);
    await settle();
    assert.equal(outbox.length, 1);
    assert.ok(outbox[0].html.includes(link));

    assert.equal((await acceptInvite(link)).status, 200);
  });

  test('refuses an admin who has already set a password', async () => {
    const res = await app.call('POST', `/admin/admins/${app.ids.admin}/invite`);
    assert.equal(res.status, 400, JSON.stringify(res.body));
    assert.equal(res.body.message, 'This admin has already set a password');
  });

  test('refuses a user who is not an admin', async () => {
    const res = await app.call('POST', `/admin/admins/${app.ids.owner}/invite`);
    assert.equal(res.status, 404, JSON.stringify(res.body));
  });

  test('is admin-only', async () => {
    const created = (await invite(newEmail())).body.data;
    const res = await app.call('POST', `/admin/admins/${created.admin.user_id}/invite`, { as: 'owner' });
    assert.equal(res.status, 403);
  });
});
