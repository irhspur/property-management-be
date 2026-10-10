// Every migration applies cleanly to an empty database (ADR-0012), so a broken
// one fails here rather than in the prod `migrate` container, where it stops
// the API from starting. Not useTestDatabase(): migrations need a database of
// their own. Creates <DB_NAME>_migrations_check on the .env server and drops it
// afterwards.
import { execFileSync } from 'child_process';
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

const migrate = () =>
  execFileSync(process.execPath, [path.join('scripts', 'migrate.js'), 'up'], {
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

test('every migration applies to an empty database, and a second run applies nothing', () => {
  assert.match(migrate(), /_baseline/);
  assert.match(migrate(), /No migrations to run!/);
});
