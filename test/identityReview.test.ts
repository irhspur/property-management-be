// Identity Review: an admin checks a Property Owner's details and personal
// Documents, then marks them verified or rejected (with a reason). Separate
// from email verification (`is_verified`), and gates nothing yet.
import { describe, test, before } from 'node:test';
import assert from 'node:assert/strict';
import { useTestDatabase } from './support/db';
import { useApp } from './support/http';
import * as fixtures from './support/fixtures';
import pool from '../config/database';

const db = useTestDatabase();
const app = useApp((a) => {
  a.use('/admin/property-owners', require('../routes/adminRoutes/propertyOwners'));
});

const review = (ownerId: string, body: unknown, as: 'admin' | 'owner' = 'admin') =>
  app.call('PUT', `/admin/property-owners/${ownerId}/identity-review`, { as, body });
const detail = (ownerId: string) => app.call('GET', `/admin/property-owners/${ownerId}/identity-review`);
const list = () => app.call('GET', '/admin/property-owners/identity-reviews');
const rowFor = async (ownerId: string) => (await list()).body.data.find((r: any) => r.user_id === ownerId);

let sita: string;
let docId: string;
before(async () => {
  sita = await fixtures.owner({ first: 'Sita', last: 'Sharma', mobile: '9800000001' });
  const l = await fixtures.lookups();
  docId = await fixtures.document({ user_id: sita, file_category_id: l.file_category_id });
});

describe('GET /admin/property-owners/identity-reviews', () => {
  test('lists owners, unreviewed by default, with their document count', async () => {
    const res = await list();
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const row = await rowFor(sita);
    assert.equal(row.first_name, 'Sita');
    assert.equal(row.mobile_number, '9800000001');
    assert.equal(row.identity_status, 'unreviewed');
    assert.equal(row.reviewed_at, null);
    assert.equal(row.document_count, 1);
    assert.equal(row.has_profile, true);
  });

  test('includes an owner who has no profile yet', async () => {
    const { user_id } = await db.one(
      `INSERT INTO users (email, password, user_type_id, is_verified) VALUES ('bare.${process.pid}@ir.test', 'x', 2, FALSE) RETURNING user_id`
    );
    const row = await rowFor(user_id);
    assert.equal(row.has_profile, false);
    assert.equal(row.first_name, null);
    assert.equal(row.is_verified, false);
  });

  test('lists only Property Owners', async () => {
    const ids = (await list()).body.data.map((r: any) => r.user_id);
    assert.ok(!ids.includes(app.ids.admin));
    assert.ok(!ids.includes(app.ids.tenant));
  });

  test('is for admins only', async () => {
    const res = await app.call('GET', '/admin/property-owners/identity-reviews', { as: 'owner' });
    assert.equal(res.status, 403);
  });
});

describe('PUT /admin/property-owners/:userId/identity-review', () => {
  test('verifies an owner, recording who and when', async () => {
    const res = await review(sita, { status: 'verified' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.status, 'verified');
    assert.equal(res.body.data.rejection_reason, null);
    assert.ok(res.body.data.reviewed_at);

    const row = await rowFor(sita);
    assert.equal(row.identity_status, 'verified');
    const stored = await db.one('SELECT reviewed_by FROM identity_review WHERE user_id = $1', [sita]);
    assert.equal(stored.reviewed_by, app.ids.admin);
  });

  test('rejects with a reason, trimmed', async () => {
    const res = await review(sita, { status: 'rejected', rejection_reason: '  Citizenship photo is blurred ' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.status, 'rejected');
    assert.equal(res.body.data.rejection_reason, 'Citizenship photo is blurred');
  });

  test('needs a reason to reject', async () => {
    const res = await review(sita, { status: 'rejected', rejection_reason: '  ' });
    assert.equal(res.status, 400);
    assert.ok(res.body.errors.some((e: any) => e.field === 'rejection_reason'), JSON.stringify(res.body));
  });

  test('takes only verified or rejected', async () => {
    const res = await review(sita, { status: 'unreviewed' });
    assert.equal(res.status, 400);
    assert.ok(res.body.errors.some((e: any) => e.field === 'status'), JSON.stringify(res.body));
  });

  test('a later review replaces the earlier one, dropping a stale reason', async () => {
    await review(sita, { status: 'rejected', rejection_reason: 'Blurred' });
    const res = await review(sita, { status: 'verified', rejection_reason: 'ignored' });
    assert.equal(res.body.data.status, 'verified');
    assert.equal(res.body.data.rejection_reason, null);
    const { n } = await db.one('SELECT COUNT(*)::int AS n FROM identity_review WHERE user_id = $1', [sita]);
    assert.equal(n, 1);
  });

  test("can't verify an owner who hasn't filled in their profile", async () => {
    const { user_id } = await db.one(
      `INSERT INTO users (email, password, user_type_id, is_verified) VALUES ('noprofile.${process.pid}@ir.test', 'x', 2, TRUE) RETURNING user_id`
    );
    const res = await review(user_id, { status: 'verified' });
    assert.equal(res.status, 400);
    assert.equal(res.body.code, 'PROFILE_INCOMPLETE');
  });

  test('is 404 for a user who is not a Property Owner, or a bad id', async () => {
    assert.equal((await review(app.ids.tenant, { status: 'verified' })).status, 404);
    assert.equal((await review('not-a-uuid', { status: 'verified' })).status, 404);
  });

  test('is for admins only', async () => {
    assert.equal((await review(sita, { status: 'verified' }, 'owner')).status, 403);
  });
});

describe('GET /admin/property-owners/:userId/identity-review', () => {
  test("returns the owner's details, documents and review", async () => {
    await review(sita, { status: 'rejected', rejection_reason: 'Blurred' });
    const res = await detail(sita);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const { owner, documents, review: r } = res.body.data;
    assert.equal(owner.user_id, sita);
    assert.equal(owner.details.first_name, 'Sita');
    assert.equal('password' in owner, false);
    assert.deepEqual(
      documents.map((d: any) => d.file_id),
      [docId]
    );
    assert.ok(documents[0].file_category_name);
    assert.equal('file_path' in documents[0], false);
    assert.equal(r.status, 'rejected');
    assert.equal(r.rejection_reason, 'Blurred');
    assert.equal(r.reviewed_by_email, (await pool.query('SELECT email FROM users WHERE user_id = $1', [app.ids.admin])).rows[0].email);
  });

  test('an unreviewed owner has status unreviewed and no reviewer', async () => {
    const other = await fixtures.owner();
    const { review: r } = (await detail(other)).body.data;
    assert.deepEqual(r, { status: 'unreviewed', rejection_reason: null, reviewed_at: null, reviewed_by_email: null });
  });

  test('is 404 for a tenant', async () => {
    assert.equal((await detail(app.ids.tenant)).status, 404);
  });
});

describe('GET /admin/property-owners/:userId/file/:fileId/view-url', () => {
  test("signs a view URL for the owner's personal document", async () => {
    const res = await app.call('GET', `/admin/property-owners/${sita}/file/${docId}/view-url`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.match(res.body.data.url, /\/files\/view\/.+/);
  });

  test("is 404 for a document that isn't that owner's", async () => {
    const other = await fixtures.owner();
    const res = await app.call('GET', `/admin/property-owners/${other}/file/${docId}/view-url`);
    assert.equal(res.status, 404);
  });
});

// Separate from the review: an admin vouches for the email, as the emailed
// link would, so an owner without the email can log in.
describe('POST /admin/property-owners/:userId/confirm-email', () => {
  const confirm = (ownerId: string, as: 'admin' | 'owner' = 'admin') =>
    app.call('POST', `/admin/property-owners/${ownerId}/confirm-email`, { as });
  const unconfirmedOwner = async () =>
    (
      await db.one(
        `INSERT INTO users (email, password, user_type_id, is_verified) VALUES ('unconfirmed.${process.pid}.${Date.now()}@ir.test', 'x', 2, FALSE) RETURNING user_id`
      )
    ).user_id;

  test("marks the owner's email confirmed, leaving the review alone", async () => {
    const id = await unconfirmedOwner();
    const res = await confirm(id);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.message, 'Email confirmed');

    const row = await rowFor(id);
    assert.equal(row.is_verified, true);
    assert.equal(row.identity_status, 'unreviewed');
  });

  test('is a no-op for an owner whose email is already confirmed', async () => {
    const res = await confirm(sita);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal((await rowFor(sita)).is_verified, true);
  });

  test('is 404 for a tenant or a bad id', async () => {
    assert.equal((await confirm(app.ids.tenant)).status, 404);
    assert.equal((await confirm('nope')).status, 404);
  });

  test('is for admins only', async () => {
    assert.equal((await confirm(await unconfirmedOwner(), 'owner')).status, 403);
  });
});
