// Emailed tokens (verification, reset, Invite) reach the user only by email.
// The response carries `token` only when EXPOSE_EMAIL_TOKENS=true (local dev).
import { describe, test, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { useTestDatabase } from './support/db';
import { useApp } from './support/http';
import { useOutbox, tokenIn } from './support/mail';
import pool from '../config/database';

useTestDatabase();
const outbox = useOutbox();
const app = useApp((a) => {
  a.use('/auth', require('../routes/authRoutes'));
  a.use('/property-owner', require('../routes/tenantRoutes'));
});

let seq = 0;
const unique = () => `${process.pid}${Date.now()}`.slice(-8) + String(++seq).padStart(2, '0');

const newTenantBody = () => {
  const n = unique();
  return {
    email: `exposed.${n}@tokens.test`,
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
  };
};

const emailOf = async (userId: string): Promise<string> =>
  (await pool.query('SELECT email FROM users WHERE user_id = $1', [userId])).rows[0].email;

// Each endpoint that emails a token, called once; the email is in `outbox`.
const endpoints: Record<string, () => Promise<{ status: number; body: any }>> = {
  'POST /auth/register': () =>
    app.call('POST', '/auth/register', {
      body: { email: `register.${unique()}@tokens.test`, password: 'Register1!', user_type_id: 2 },
    }),
  'POST /auth/forgot-password': async () =>
    app.call('POST', '/auth/forgot-password', { body: { email: await emailOf(app.ids.owner) } }),
  'POST /property-owner/tenant': () =>
    app.call('POST', '/property-owner/tenant', { as: 'owner', body: newTenantBody() }),
  'POST /property-owner/tenant/:tenantId/invite': async () => {
    const created = await app.call('POST', '/property-owner/tenant', { as: 'owner', body: newTenantBody() });
    outbox.length = 0;
    return app.call('POST', `/property-owner/tenant/${created.body.data.tenant.user_id}/invite`, { as: 'owner' });
  },
};

// Register sends its email without waiting for it.
const settle = () => new Promise((resolve) => setImmediate(resolve));

describe('with EXPOSE_EMAIL_TOKENS unset', () => {
  beforeEach(() => {
    delete process.env.EXPOSE_EMAIL_TOKENS;
  });

  for (const [name, call] of Object.entries(endpoints)) {
    test(`${name} emails the token and leaves it out of the response`, async () => {
      const res = await call();
      assert.equal(res.status, 200, JSON.stringify(res.body));
      assert.equal(res.body.status, 'AK');
      assert.equal('token' in res.body, false);
      await settle();
      assert.equal(outbox.length, 1);
    });
  }
});

describe('with EXPOSE_EMAIL_TOKENS=true', () => {
  beforeEach(() => {
    process.env.EXPOSE_EMAIL_TOKENS = 'true';
  });
  afterEach(() => {
    delete process.env.EXPOSE_EMAIL_TOKENS;
  });

  for (const [name, call] of Object.entries(endpoints)) {
    test(`${name} also returns the emailed token`, async () => {
      const res = await call();
      assert.equal(res.status, 200, JSON.stringify(res.body));
      await settle();
      assert.equal(outbox.length, 1);
      assert.equal(res.body.token, tokenIn(outbox[0]));
    });
  }
});
