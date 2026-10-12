// Login returns the role and is gated (tenant-portal spec 1a, 1f; decisions 9–10).
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import bcrypt from 'bcrypt';
import { useTestDatabase } from './support/db';
import { useApp } from './support/http';
import * as fixtures from './support/fixtures';

const db = useTestDatabase();
const app = useApp((a) => {
  a.use('/auth', require('../routes/authRoutes'));
  a.use('/user', require('../routes/userRoutes'));
});

const PASSWORD = 'Secret1!pw';
const WRONG = 'Wrong1!pwd'; // passes the login password policy
let hash: string;
before(async () => {
  hash = await bcrypt.hash(PASSWORD, 4);
});

// Gives a fixture user a known password changed today, and returns its email.
// `cols` overrides any users column (e.g. is_active, password_last_changed).
const withPassword = async (userId: string, cols: Record<string, unknown> = {}): Promise<string> => {
  const all: Record<string, unknown> = { password: hash, password_last_changed: new Date(), ...cols };
  const names = Object.keys(all);
  const row = await db.one(
    `UPDATE users SET ${names.map((n, i) => `${n} = $${i + 2}`).join(', ')} WHERE user_id = $1 RETURNING email`,
    [userId, ...Object.values(all)]
  );
  return row.email;
};

const assertNak = (res: { status: number; body: any }, status: number, code: string | undefined, message: string) => {
  assert.equal(res.status, status, JSON.stringify(res.body));
  assert.equal(res.body.status, 'NAK');
  assert.equal(res.body.code, code);
  assert.equal(res.body.message, message);
  assert.equal(res.body.token, undefined);
};

const login = (email: string, password = PASSWORD) =>
  app.call('POST', '/auth/login', { body: { email, password } });

test('login returns the role of each user type', async () => {
  for (const [as, id, name] of [
    ['admin', 1, 'admin'],
    ['owner', 2, 'property_owner'],
    ['tenant', 3, 'tenant'],
  ] as const) {
    const res = await login(await withPassword(app.ids[as]));
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.status, 'AK');
    assert.equal(res.body.data.user_type_id, id);
    assert.equal(res.body.data.user_type, name);
    assert.equal(res.body.data.password, undefined);
    assert.equal(typeof res.body.token, 'string');
  }
});

test('GET /user returns the role of each user type', async () => {
  for (const [as, id, name] of [
    ['admin', 1, 'admin'],
    ['owner', 2, 'property_owner'],
    ['tenant', 3, 'tenant'],
  ] as const) {
    const res = await app.call('GET', '/user', { as });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.user_type_id, id);
    assert.equal(res.body.data.user_type, name);
  }
});

test('an invite-pending Tenant is told to check their invite, whatever password they try', async () => {
  const email = await withPassword(app.ids.tenant, { invite_pending: true, password: '!invite-pending' });
  for (const password of [PASSWORD, WRONG]) {
    assertNak(
      await login(email, password),
      403,
      'INVITE_PENDING',
      'Check your email for your invite, or ask your Property Owner to resend it.'
    );
  }
});
