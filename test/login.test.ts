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
let hash: string;
before(async () => {
  hash = await bcrypt.hash(PASSWORD, 4);
});

// Gives a fixture user a known password changed today, and returns its email.
const withPassword = async (userId: string, cols: Record<string, unknown> = {}): Promise<string> => {
  const names = Object.keys(cols);
  const sets = names.map((n, i) => `, ${n} = $${i + 3}`).join('');
  const row = await db.one(
    `UPDATE users SET password = $2, password_last_changed = NOW()${sets} WHERE user_id = $1 RETURNING email`,
    [userId, hash, ...Object.values(cols)]
  );
  return row.email;
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
