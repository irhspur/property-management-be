// Self-registration creates Property Owners only. Admins are not
// self-registered, and Tenants are created by their Property Owner.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { useTestDatabase } from './support/db';
import { useApp } from './support/http';
import { useOutbox } from './support/mail';
import pool from '../config/database';

useTestDatabase();
useOutbox();
const app = useApp((a) => {
  a.use('/auth', require('../routes/authRoutes'));
});

let seq = 0;
const register = (user_type_id: unknown) => {
  const email = `register.${process.pid}${++seq}@register.test`;
  const body: Record<string, unknown> = { email, password: 'Register1!' };
  if (user_type_id !== undefined) body.user_type_id = user_type_id;
  return { email, res: app.call('POST', '/auth/register', { body }) };
};

const userExists = async (email: string): Promise<boolean> =>
  (await pool.query('SELECT 1 FROM users WHERE email = $1', [email])).rowCount === 1;

describe('POST /auth/register', () => {
  test('creates a Property Owner', async () => {
    const { email, res } = register(2);
    const { status, body } = await res;
    assert.equal(status, 200, JSON.stringify(body));
    assert.equal(body.data.user_type_id, 2);
    assert.equal(await userExists(email), true);
  });

  for (const [name, user_type_id] of [
    ['an admin', 1],
    ['an admin given as a string', '1'],
    ['a Tenant', 3],
    ['an unknown user type', 99],
    ['no user type', undefined],
  ] as const) {
    test(`refuses ${name}`, async () => {
      const { email, res } = register(user_type_id);
      const { status, body } = await res;
      assert.equal(status, 400, JSON.stringify(body));
      assert.deepEqual(body.errors.map((e: { field: string }) => e.field), ['user_type_id']);
      assert.equal(await userExists(email), false);
    });
  }
});
