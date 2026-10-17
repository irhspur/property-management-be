// Who can open the Portfolio Overview routes. Admins use the owner portal, so
// they get their own (empty) portfolio rather than a 403 (ADR-0009).
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { useTestDatabase } from './support/db';
import { useApp } from './support/http';

useTestDatabase();

const app = useApp((a) => {
  a.use('/property-owner', require('../routes/paymentRoutes'));
  a.use('/property-owner', require('../routes/dashboardRoutes'));
});

const routes = ['/property-owner/dashboard', '/property-owner/activity', '/property-owner/arrears'];

describe('owner portal roles', () => {
  for (const path of routes) {
    test(`${path}: admin and owner get 200, tenant gets 403`, async () => {
      for (const as of ['admin', 'owner'] as const) {
        const { status, body } = await app.call('GET', path, { as });
        assert.equal(status, 200, `${as}: ${JSON.stringify(body)}`);
        assert.equal(body.status, 'AK');
      }
      const { status, body } = await app.call('GET', path, { as: 'tenant' });
      assert.equal(status, 403);
      assert.equal(body.message, 'Access denied');
    });
  }
});
