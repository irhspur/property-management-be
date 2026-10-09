// The shared test setup (test/support/db.ts) itself: each test is rolled back,
// a failed query doesn't poison the next test, services' own transactions
// stay inside the test's, and fixtures from before() survive every test.
import { test, before } from 'node:test';
import assert from 'node:assert/strict';
import pool from '../config/database';
import { useTestDatabase } from './support/db';
import * as fixtures from './support/fixtures';
import { withTransaction } from '../utils/transaction';

const db = useTestDatabase();
let ownerId: string;

before(async () => {
  ownerId = await fixtures.owner({ first: 'Kept' });
});

test('a test changes a fixture', async () => {
  await db.query(`UPDATE user_details SET first_name = 'Changed' WHERE user_id = $1`, [ownerId]);
  assert.equal((await db.one('SELECT first_name FROM user_details WHERE user_id = $1', [ownerId])).first_name, 'Changed');
});

test('the next test sees the fixture as before() left it', async () => {
  assert.equal((await db.one('SELECT first_name FROM user_details WHERE user_id = $1', [ownerId])).first_name, 'Kept');
});

test('a failing query fails only its own test', async () => {
  await assert.rejects(db.query('SELECT * FROM no_such_table'));
});

test('so the test after it still runs normally', async () => {
  assert.equal((await db.one('SELECT 1 AS n')).n, 1);
});

test("a service's transaction rolls back to its own savepoint, inside the test", async () => {
  await assert.rejects(
    withTransaction(async (client) => {
      await client.query(`UPDATE user_details SET first_name = 'Inside' WHERE user_id = $1`, [ownerId]);
      throw new Error('service failed');
    }),
    /service failed/
  );
  assert.equal((await db.one('SELECT first_name FROM user_details WHERE user_id = $1', [ownerId])).first_name, 'Kept');
  // pool.query is the same transaction, so it sees what the test wrote.
  await db.query(`UPDATE user_details SET first_name = 'Seen' WHERE user_id = $1`, [ownerId]);
  assert.equal((await pool.query('SELECT first_name FROM user_details WHERE user_id = $1', [ownerId])).rows[0].first_name, 'Seen');
});
