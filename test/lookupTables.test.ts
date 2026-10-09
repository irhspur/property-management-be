// Lookup tables (CONTEXT.md "Lookup table", ADR-0011): one suite, every case,
// all 16 tables — over HTTP through the mounted routers, so auth, validation,
// both PUT styles and the status codes are what a client sees. Runs against
// the database in .env, migrated, with lookup tables seeded, inside one
// transaction that is rolled back.
import 'dotenv/config';
import { AddressInfo } from 'net';
import { Server } from 'http';
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import jwt from 'jsonwebtoken';
import { PoolClient } from 'pg';
import pool from '../config/database';
import { LOOKUP_TABLES, LookupTable } from '../services/lookupTables';

const { mountLookupTables } = require('../routes/lookupRoutes');

let client: PoolClient;
let server: Server;
let base: string;
let adminToken: string;
let ownerToken: string;
const parentIds: Record<string, number> = {};

const one = async (sql: string, params: unknown[] = []): Promise<any> => (await client.query(sql, params)).rows[0];

const call = async (method: string, path: string, opts: { token?: string; body?: unknown } = {}) => {
  const res = await fetch(`${base}${path}`, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.token ?? adminToken}`,
    },
    body: opts.body === undefined ? undefined : JSON.stringify(opts.body),
  });
  return { status: res.status, body: (await res.json()) as any };
};

// A row that can't already exist, per table. `variant` makes a second,
// different one for updates.
const sample = (t: LookupTable, variant = 0): Record<string, unknown> => {
  const letters = variant ? 'Zqy' : 'Zqx';
  const body: Record<string, unknown> = {};
  for (const f of t.fields) {
    if (f.kind === 'number') {
      body[f.name] = f.name === 'numcode' ? 990 + variant : f.name === 'phonecode' ? 99990 + variant : 77.7 + variant;
    } else if (f.name === 'iso') body[f.name] = variant ? 'QY' : 'QX';
    else if (f.name === 'iso3') body[f.name] = variant ? 'QQY' : 'QQX';
    else body[f.name] = `${letters} ${t.label.replace(/[^A-Za-z ]/g, '')}`.slice(0, f.max);
  }
  if (t.parent) body[t.parent.column] = parentIds[t.parent.table];
  if (t.code) body.code = `test_${t.table}`.slice(0, 40);
  return body;
};

const freeId = async (t: LookupTable): Promise<number> =>
  (await one(`SELECT COALESCE(MAX(id), 0) + 100 AS id FROM ${t.table}`)).id;

before(async () => {
  client = await pool.connect();
  await client.query('BEGIN');
  (pool as any).query = client.query.bind(client);

  const user = async (typeId: number) =>
    (
      await one(
        `INSERT INTO users (email, password, user_type_id, is_verified) VALUES ($1, 'x', $2, TRUE) RETURNING user_id`,
        [`lookup.${typeId}.${Date.now()}@lookup.test`, typeId]
      )
    ).user_id as string;
  adminToken = jwt.sign({ id: await user(1) }, process.env.JWT_SECRET as string);
  ownerToken = jwt.sign({ id: await user(2) }, process.env.JWT_SECRET as string);

  for (const table of ['country', 'province', 'district']) {
    parentIds[table] = (await one(`SELECT MIN(id) AS id FROM ${table}`)).id;
  }

  const app = express();
  app.use(express.json());
  mountLookupTables(app);
  server = app.listen(0);
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

after(async () => {
  server.close();
  await client.query('ROLLBACK');
  client.release();
  await pool.end();
});

for (const t of LOOKUP_TABLES) {
  test(`${t.path}: read, create, update both ways, duplicates, 404, delete`, async () => {
    const list = await call('GET', `/${t.path}`, { token: ownerToken });
    assert.equal(list.status, 200);
    assert.ok(Array.isArray(list.body.data) && list.body.data.length > 0);
    const existing = list.body.data[0];
    assert.equal((await call('GET', `/${t.path}/${existing.id}`, { token: ownerToken })).body.data.id, existing.id);
    assert.equal((await call('GET', `/${t.path}/99999`)).status, 404);
    assert.equal((await call('GET', `/${t.path}/abc`)).status, 404);

    // Writes are admin-only; a property owner gets 403 from authorize.
    assert.equal((await call('POST', `/${t.path}`, { token: ownerToken, body: sample(t) })).status, 403);
    assert.equal((await call('DELETE', `/${t.path}/${existing.id}`, { token: ownerToken })).status, 403);

    // Validation comes back in the 400 envelope.
    const invalid = await call('POST', `/${t.path}`, { body: {} });
    assert.equal(invalid.status, 400);
    assert.ok(Array.isArray(invalid.body.errors) && invalid.body.errors.length > 0);

    if (t.locked?.closed) {
      const closed = await call('POST', `/${t.path}`, { body: { ...sample(t), id: await freeId(t) } });
      assert.equal(closed.status, 409, JSON.stringify(closed.body));
      // Renaming is allowed where only ids are hard-coded; user types are
      // matched by name, so they can't be renamed either.
      const renamed = await call('PUT', `/${t.path}/${existing.id}`, { body: sample(t) });
      assert.equal(renamed.status, t.locked.frozen ? 409 : 200, JSON.stringify(renamed.body));
      return;
    }

    const body = { ...sample(t), ...(t.idGenerated ? {} : { id: await freeId(t) }) };
    const created = await call('POST', `/${t.path}`, { body });
    assert.equal(created.status, 200, JSON.stringify(created.body));
    assert.equal(created.body.status, 'AK');
    const id = created.body.data.id;

    const duplicate = await call('POST', `/${t.path}`, { body: { ...body, ...(t.idGenerated ? {} : { id: id + 1 }), code: 'other_code' } });
    assert.equal(duplicate.status, 400, JSON.stringify(duplicate.body));

    const viaPath = await call('PUT', `/${t.path}/${id}`, { body: sample(t, 1) });
    assert.equal(viaPath.status, 200, JSON.stringify(viaPath.body));
    const viaQuery = await call('PUT', `/${t.path}?id=${id}`, { body: sample(t, 0) });
    assert.equal(viaQuery.status, 200, JSON.stringify(viaQuery.body));
    assert.equal((await call('PUT', `/${t.path}/99999`, { body: sample(t, 1) })).status, 404);

    assert.equal((await call('DELETE', `/${t.path}/${id}`)).status, 200);
    assert.equal((await call('GET', `/${t.path}/${id}`)).status, 404);
  });
}

test('text values are capitalised as before', async () => {
  const t = LOOKUP_TABLES.find((x) => x.path === 'payment-method')!;
  const { body } = await call('POST', '/payment-method', { body: { id: await freeId(t), payment_method: 'zqx bank draft' } });
  assert.equal(body.data.payment_method, 'Zqx Bank Draft');
});

test('in use: a referenced row is 409 with what uses it', async () => {
  const { id: countryId } = await one(
    `SELECT country_id AS id FROM province GROUP BY country_id ORDER BY count(*) DESC LIMIT 1`
  );
  const country = await call('DELETE', `/country/${countryId}`);
  assert.equal(country.status, 409);
  assert.match(country.body.message, /^Country is in use by .*\d+ provinces.*, so it cannot be deleted$/);

  const t = LOOKUP_TABLES.find((x) => x.path === 'file-category')!;
  const created = await call('POST', '/file-category', { body: { id: await freeId(t), name: 'Zqx Deed', code: 'zqx_deed' } });
  const { user_id } = await one(`SELECT MIN(user_id::text)::uuid AS user_id FROM users`);
  await client.query(
    `INSERT INTO files (user_id, file_category_id, original_name, mimetype, file_size, file_name, file_path)
     VALUES ($1, $2, 'x.pdf', 'application/pdf', 1, 'x.pdf', 'uploads/x.pdf')`,
    [user_id, created.body.data.id]
  );
  const category = await call('DELETE', `/file-category/${created.body.data.id}`);
  assert.equal(category.status, 409);
  assert.equal(category.body.message, 'File category is in use by 1 documents, so it cannot be deleted');
});

test('locked rows: rent, reserved category codes and fixed tables can\'t be deleted', async () => {
  assert.equal((await call('DELETE', '/payment-purpose/1')).status, 409);
  assert.equal((await call('DELETE', '/payment-period/1')).status, 409);
  assert.equal((await call('DELETE', '/user-type/3')).status, 409);
  const { id } = await one(`SELECT id FROM file_categories WHERE code = 'citizenship_front'`);
  const reserved = await call('DELETE', `/file-category/${id}`);
  assert.equal(reserved.status, 409);
  assert.match(reserved.body.message, /citizenship_front is used by the app/);
});

test('category codes: required and well-formed on create, never changed on update', async () => {
  const t = LOOKUP_TABLES.find((x) => x.path === 'property-file-category')!;
  const missing = await call('POST', '/property-file-category', { body: { id: await freeId(t), name: 'Zqx Map' } });
  assert.equal(missing.body.errors[0].field, 'code');
  const bad = await call('POST', '/property-file-category', { body: { id: await freeId(t), name: 'Zqx Map', code: 'Bad Code' } });
  assert.equal(bad.body.errors[0].field, 'code');

  const created = await call('POST', '/property-file-category', { body: { id: await freeId(t), name: 'Zqx Map', code: 'zqx_map' } });
  const id = created.body.data.id;
  const echoed = await call('PUT', `/property-file-category/${id}`, { body: { name: 'Zqx Plan', code: 'zqx_map' } });
  assert.equal(echoed.status, 200);
  const changed = await call('PUT', `/property-file-category/${id}`, { body: { name: 'Zqx Plan', code: 'zqx_other' } });
  assert.deepEqual(changed.body, { errors: [{ field: 'code', message: 'code cannot be changed' }] });
});

test('geography: by-parent filters, names unique within a parent, parent must exist', async () => {
  const provinces = await call('GET', `/province/by-country?country_id=${parentIds.country}`, { token: ownerToken });
  assert.equal(provinces.status, 200);
  assert.ok(provinces.body.data.every((p: any) => p.country_id === parentIds.country));
  assert.equal((await call('GET', '/district/by-province?province_id=abc')).status, 400);

  const noParent = await call('POST', '/district', { body: { name: 'Zqx Valley', province_id: 99999 } });
  assert.deepEqual(noParent.body.errors[0].field, 'province_id');

  const { name } = await one(`SELECT name FROM district WHERE province_id = $1 LIMIT 1`, [parentIds.province]);
  const clash = await call('POST', '/district', { body: { name: name.toLowerCase(), province_id: parentIds.province } });
  assert.equal(clash.status, 400);
});
