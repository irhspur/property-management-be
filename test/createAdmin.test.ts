// tasks/create-admin.js creates the first admin from the server, without
// email: verified, active, and able to log in straight away.
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { useTestDatabase } from './support/db';
import { useApp } from './support/http';
import pool from '../config/database';

useTestDatabase();
const app = useApp((a) => {
  a.use('/auth', require('../routes/authRoutes'));
});
const { createAdmin, passwordProblem } = require('../tasks/create-admin');

const PASSWORD = 'Admin1!pw';
let seq = 0;
const newEmail = () => `admin.${process.pid}${++seq}@create-admin.test`;

describe('createAdmin', () => {
  test('creates a verified, active admin who can log in', async () => {
    const email = newEmail();
    await createAdmin({ email, password: PASSWORD });

    const { rows } = await pool.query(
      `SELECT ut.name AS user_type, u.is_verified, u.is_active, u.invite_pending, u.password
       FROM users u JOIN user_type ut ON ut.id = u.user_type_id WHERE u.email = $1`,
      [email]
    );
    assert.equal(rows.length, 1);
    assert.equal(rows[0].user_type, 'admin');
    assert.equal(rows[0].is_verified, true);
    assert.equal(rows[0].is_active, true);
    assert.equal(rows[0].invite_pending, false);
    assert.notEqual(rows[0].password, PASSWORD);

    const res = await app.call('POST', '/auth/login', { body: { email, password: PASSWORD } });
    assert.equal(res.status, 200, JSON.stringify(res.body));
  });

  test('trims spaces around the email, as the API does', async () => {
    const email = newEmail();
    await createAdmin({ email: `  ${email} `, password: PASSWORD });
    const { rowCount } = await pool.query('SELECT 1 FROM users WHERE email = $1', [email]);
    assert.equal(rowCount, 1);
  });

  test('refuses an email that already has an account', async () => {
    const email = newEmail();
    await createAdmin({ email, password: PASSWORD });
    await assert.rejects(createAdmin({ email, password: PASSWORD }), /already has an account/);
  });

  test('refuses an invalid email', async () => {
    await assert.rejects(createAdmin({ email: 'not-an-email', password: PASSWORD }), /Invalid email/);
  });

  test('refuses a password that fails the policy', async () => {
    const email = newEmail();
    await assert.rejects(createAdmin({ email, password: 'weak' }), /7 - 14 characters/);
    const { rowCount } = await pool.query('SELECT 1 FROM users WHERE email = $1', [email]);
    assert.equal(rowCount, 0);
  });
});

describe('passwordProblem', () => {
  for (const [password, problem] of [
    ['Admin1!pw', null],
    ['Ab1!', 'Password must be 7 - 14 characters'],
    ['Abcdefgh1!xyz12', 'Password must be 7 - 14 characters'],
    ['admin1!pw', 'Must include at least one uppercase letter'],
    ['Admin!!pw', 'Must include at least one digit'],
    ['Admin11pw', 'Must include at least one special character'],
  ] as const) {
    test(`"${password}" → ${problem ?? 'ok'}`, () => {
      assert.equal(passwordProblem(password), problem);
    });
  }
});
