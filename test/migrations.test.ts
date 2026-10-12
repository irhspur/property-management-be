// Every migration applies cleanly to an empty database (ADR-0012), so a broken
// one fails here rather than in the prod `migrate` container, where it stops
// the API from starting. Not useTestDatabase(): migrations need a database of
// their own. Creates <DB_NAME>_migrations_check on the .env server and drops it
// afterwards.
import { execFileSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { Client } from 'pg';
import 'dotenv/config';

const checkDb = `${process.env.DB_NAME}_migrations_check`;

const admin = () =>
  new Client({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 5432,
    database: 'postgres',
  });

const adminQuery = async (sql: string) => {
  const client = admin();
  await client.connect();
  try {
    await client.query(sql);
  } finally {
    await client.end();
  }
};

const checkQuery = async (sql: string, params: unknown[] = []) => {
  const client = new Client({
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    host: process.env.DB_HOST,
    port: Number(process.env.DB_PORT) || 5432,
    database: checkDb,
  });
  await client.connect();
  try {
    return (await client.query(sql, params)).rows;
  } finally {
    await client.end();
  }
};

// How many migrations sort before the named one.
const countBefore = (name: string) =>
  fs.readdirSync('migrations').filter((f) => /^\d.*\.js$/.test(f)).sort().findIndex((f) => f.includes(name));

const migrate = (count?: number) =>
  execFileSync(process.execPath, [path.join('scripts', 'migrate.js'), 'up', ...(count ? [String(count)] : [])], {
    env: { ...process.env, DB_NAME: checkDb },
    encoding: 'utf8',
  });

before(async () => {
  await adminQuery(`DROP DATABASE IF EXISTS "${checkDb}"`);
  await adminQuery(`CREATE DATABASE "${checkDb}"`);
});

after(async () => {
  await adminQuery(`DROP DATABASE IF EXISTS "${checkDb}" WITH (FORCE)`);
});

test('every migration applies to an empty database, and a second run applies nothing', async () => {
  assert.match(migrate(countBefore('_tenant-invite-pending')), /_baseline/);

  // Owner-created Tenants from before the Invite: plaintext password, unverified.
  const hash = '$2b$10$abcdefghijklmnopqrstuuJ0o2pXo3eYv3yN8bQ6wQ0m3m3m3m3m3';
  await checkQuery(
    `INSERT INTO users (email, password, user_type_id) VALUES
      ('plain@check.test', 'Secret1!', 3), ('hashed@check.test', $1, 3), ('owner@check.test', 'Plain1!', 2)`,
    [hash]
  );

  assert.match(migrate(), /_tenant-invite-pending/);
  const rows = await checkQuery('SELECT email, password, invite_pending FROM users ORDER BY email');
  const by = Object.fromEntries(rows.map((r: any) => [r.email, r]));
  assert.equal(by['plain@check.test'].invite_pending, true);
  assert.notEqual(by['plain@check.test'].password, 'Secret1!');
  assert.equal(by['hashed@check.test'].invite_pending, false);
  assert.equal(by['hashed@check.test'].password, hash);
  assert.equal(by['owner@check.test'].invite_pending, false);
  assert.equal(by['owner@check.test'].password, 'Plain1!');

  assert.match(migrate(), /No migrations to run!/);
});
