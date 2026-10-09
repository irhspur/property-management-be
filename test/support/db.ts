// One call per test file, at the top: useTestDatabase() runs the file against
// the database in .env (migrated, lookup tables seeded) without leaving
// anything behind.
//
// - One client and transaction for the whole file, rolled back at the end.
//   Fixtures created in the file's own before() live in it.
// - Every test runs inside its own savepoint, undone afterwards: a test can't
//   see what another test changed, and a failing query can't poison the tests
//   after it.
// - Services join the same transaction: pool.query runs on the file's client,
//   and pool.connect (withTransaction) gets that client with BEGIN / COMMIT /
//   ROLLBACK turned into a nested savepoint.
// - Stored files go to a temp File store root, removed at the end.
//
// pool is patched the moment this is called, not in a before() hook: Node
// doesn't wait for one root before() to finish before starting the next, so a
// file's own before() could otherwise query the real database before the
// transaction exists. Every query waits for the transaction instead.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { after, beforeEach, afterEach } from 'node:test';
import { PoolClient } from 'pg';
import pool from '../../config/database';

const SERVICE_SAVEPOINT: Record<string, string> = {
  BEGIN: 'SAVEPOINT svc',
  COMMIT: 'RELEASE SAVEPOINT svc',
  ROLLBACK: 'ROLLBACK TO SAVEPOINT svc',
};

export interface TestDatabase {
  // Run SQL on the file's transaction; one() returns the first row.
  query: (sql: string, params?: unknown[]) => Promise<any[]>;
  one: (sql: string, params?: unknown[]) => Promise<any>;
  uploadRoot: string;
}

export const useTestDatabase = (): TestDatabase => {
  const uploadRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'proptrove-test-'));
  process.env.UPLOAD_ROOT = uploadRoot;

  const connect = pool.connect.bind(pool);
  const ready: Promise<PoolClient> = connect().then(async (client: PoolClient) => {
    await client.query('BEGIN');
    return client;
  });
  const run = async (sql: any, params?: unknown[]) => (await ready).query(sql, params);

  (pool as any).query = run;
  (pool as any).connect = async () => ({
    query: (sql: any, params?: unknown[]) => run(SERVICE_SAVEPOINT[sql] ?? sql, params),
    release: () => {},
  });

  beforeEach(async () => {
    await run('SAVEPOINT test_case');
  });

  afterEach(async () => {
    await run('ROLLBACK TO SAVEPOINT test_case');
    await run('RELEASE SAVEPOINT test_case');
  });

  after(async () => {
    const client = await ready;
    await client.query('ROLLBACK');
    client.release();
    await pool.end();
    fs.rmSync(uploadRoot, { recursive: true, force: true });
  });

  const query = async (sql: string, params: unknown[] = []) => (await run(sql, params)).rows;
  return { query, one: async (sql, params) => (await query(sql, params))[0], uploadRoot };
};
