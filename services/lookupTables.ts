// Lookup tables (ADR-0011): the small reference tables (countries, payment
// methods, file categories, ...) that other records point at by id. Every one
// is the same module, driven by a description below: list, get, create,
// update, delete, plus a by-parent filter for the geography tables.
//
// Deletes are guarded (ADR-0011): a row anything references can't be deleted
// (409), whatever its foreign key would do — SET NULL hides documents behind a
// deleted category and logs users out behind a deleted user type, CASCADE takes
// a country's whole geography. Rows the code itself depends on are locked.
import * as lookupModel from '../models/lookupTable';
import { Column } from '../models/lookupTable';

export interface Field extends Column {
  label: string; // in messages: "Payment method must not be empty"
  kind: 'text' | 'number';
  required: boolean;
  unique: boolean;
  max?: number; // text: characters
  pattern?: RegExp;
  patternMessage?: string;
  min?: number; // number range
  maxValue?: number;
}

export interface LookupTable {
  path: string; // mounted at /<path>
  table: string;
  label: string; // "Payment method"
  fields: Field[];
  // Geography: each row belongs to a parent row, names are unique within it,
  // and GET /by-<route>?<column>= lists one parent's rows.
  parent?: { column: string; table: string; label: string; route: string };
  // File categories: a stable machine code, set on create, never changed.
  code?: boolean;
  // false when the id column has no sequence, so create must send one.
  idGenerated: boolean;
  timestamps: boolean;
  // Rows the code depends on by id or code; tables whose rows are all
  // hard-coded so a new one would mean nothing (closed); and tables the code
  // matches by name, so even a rename breaks it (frozen).
  locked?: { ids?: number[]; codes?: string[]; closed?: boolean; frozen?: boolean; reason: string };
}

const LETTERS = /^[A-Za-z\s-]+$/;
const lettersMessage = (label: string) => `${label} must contain only letters, spaces, or hyphens`;

const name = (label: string, max: number, opts: { letters?: boolean; pattern?: RegExp; patternMessage?: string } = {}): Field => ({
  name: 'name',
  label,
  kind: 'text',
  required: true,
  unique: true,
  max,
  transform: 'initcap',
  ...(opts.letters ? { pattern: LETTERS, patternMessage: lettersMessage(label) } : {}),
  ...(opts.pattern ? { pattern: opts.pattern, patternMessage: opts.patternMessage } : {}),
});

const years = (column: string, label: string): Field => ({
  name: column, label, kind: 'number', required: true, unique: true, min: 0.1, maxValue: 999.99,
});

const textValue = (column: string, label: string, max: number): Field => ({
  name: column, label, kind: 'text', required: true, unique: true, max, transform: 'initcap',
  pattern: LETTERS, patternMessage: lettersMessage(label),
});

// Keep in step with the seed data (data/*.csv) and with the constants that
// hard-code these ids/codes: RENT_PURPOSE_ID, PAYMENT_PERIOD_MONTHS,
// user_type 3 for tenants.
export const LOOKUP_TABLES: LookupTable[] = [
  {
    path: 'user-type', table: 'user_type', label: 'User type', idGenerated: false, timestamps: true,
    fields: [name('User type name', 20, { letters: true })],
    // authorize() compares the caller's user type by name ("admin", ...), so
    // renaming one locks out every user of that type.
    locked: { ids: [1, 2, 3], closed: true, frozen: true, reason: 'authorization matches user types by name' },
  },
  {
    path: 'gender', table: 'gender', label: 'Gender', idGenerated: false, timestamps: true,
    fields: [name('Gender name', 20, { letters: true })],
  },
  {
    path: 'country', table: 'country', label: 'Country', idGenerated: true, timestamps: false,
    fields: [
      { name: 'iso', label: 'Country ISO', kind: 'text', required: true, unique: true, max: 2, transform: 'upper',
        pattern: /^[A-Za-z]+$/, patternMessage: 'Country ISO must contain only letters' },
      { name: 'name', label: 'Country name', kind: 'text', required: true, unique: true, max: 80, transform: 'upper',
        pattern: LETTERS, patternMessage: lettersMessage('Country name') },
      { name: 'nicename', label: 'Country nicename', kind: 'text', required: true, unique: true, max: 80, transform: 'initcap',
        pattern: LETTERS, patternMessage: lettersMessage('Country nicename') },
      { name: 'iso3', label: 'Country ISO3', kind: 'text', required: false, unique: true, max: 3, transform: 'upper',
        pattern: /^[A-Za-z]+$/, patternMessage: 'Country ISO3 must contain only letters' },
      { name: 'numcode', label: 'Country numcode', kind: 'number', required: false, unique: true, min: 0, maxValue: 999 },
      { name: 'phonecode', label: 'Country phonecode', kind: 'number', required: true, unique: true, min: 0, maxValue: 99999 },
    ],
  },
  {
    path: 'province', table: 'province', label: 'Province', idGenerated: true, timestamps: true,
    fields: [name('Province name', 80, {
      pattern: /^[A-Za-z0-9\s\-[\]]+$/,
      patternMessage: 'Province name must contain only letters, numbers, spaces, hyphens or brackets',
    })],
    parent: { column: 'country_id', table: 'country', label: 'Country', route: 'by-country' },
  },
  {
    path: 'district', table: 'district', label: 'District', idGenerated: true, timestamps: true,
    fields: [name('District name', 80, { letters: true })],
    parent: { column: 'province_id', table: 'province', label: 'Province', route: 'by-province' },
  },
  {
    path: 'municipality', table: 'municipality', label: 'Municipality', idGenerated: true, timestamps: true,
    fields: [name('Municipality name', 80, { letters: true })],
    parent: { column: 'district_id', table: 'district', label: 'District', route: 'by-district' },
  },
  {
    path: 'file-category', table: 'file_categories', label: 'File category', idGenerated: false, timestamps: true,
    fields: [name('File category name', 50)], code: true,
    locked: { codes: ['citizenship_front', 'citizenship_back'], reason: 'the app uploads into it' },
  },
  {
    path: 'property-file-category', table: 'property_file_categories', label: 'Property file category',
    idGenerated: false, timestamps: true, fields: [name('Property file category name', 50)], code: true,
    locked: { codes: ['lalpurja', 'property_photo'], reason: 'the app uploads into it' },
  },
  {
    path: 'agreement-file-category', table: 'agreement_file_categories', label: 'Agreement file category',
    idGenerated: false, timestamps: true, fields: [name('Agreement file category name', 50)], code: true,
    locked: { codes: ['signed_contract'], reason: 'the app uploads into it' },
  },
  {
    path: 'property-type', table: 'property_types', label: 'Property type', idGenerated: false, timestamps: true,
    fields: [name('Property type name', 50, { letters: true })],
  },
  {
    path: 'agreement-duration', table: 'agreement_duration', label: 'Agreement duration', idGenerated: true, timestamps: true,
    fields: [years('duration_in_years', 'Duration in years')],
  },
  {
    path: 'increment-duration', table: 'increment_duration', label: 'Increment duration', idGenerated: true, timestamps: true,
    fields: [years('increment_duration_in_years', 'Increment duration in years')],
  },
  {
    path: 'increment-percentage', table: 'increment_percentage', label: 'Increment percentage', idGenerated: true,
    timestamps: true,
    fields: [{ name: 'increment_percentage', label: 'Increment percentage', kind: 'number', required: true, unique: true,
      min: 0.01, maxValue: 100 }],
  },
  {
    path: 'payment-period', table: 'payment_period', label: 'Payment period', idGenerated: true, timestamps: true,
    fields: [textValue('payment_period', 'Payment period', 20)],
    locked: { ids: [1, 2, 3, 4], closed: true, reason: 'rent periods are priced by these ids (PAYMENT_PERIOD_MONTHS)' },
  },
  {
    path: 'payment-purpose', table: 'payment_purpose', label: 'Payment purpose', idGenerated: false, timestamps: true,
    fields: [textValue('payment_purpose', 'Payment purpose', 30)],
    locked: { ids: [1], reason: 'id 1 is rent (RENT_PURPOSE_ID)' },
  },
  {
    path: 'payment-method', table: 'payment_method', label: 'Payment method', idGenerated: false, timestamps: true,
    fields: [textValue('payment_method', 'Payment method', 30)],
  },
];

// A failure the router answers with. With `field` it's the 400 validation
// envelope ({ errors: [{ field, message }] }); without, { status: 'NAK', message }.
export class LookupError extends Error {
  constructor(public statusCode: number, message: string, public field?: string) {
    super(message);
  }
}

const NOUNS: Record<string, string> = {
  files: 'documents', user_details: 'user profiles', address: 'addresses', users: 'users',
  properties: 'properties', agreements: 'agreements', payments: 'payments',
  province: 'provinces', district: 'districts', municipality: 'municipalities',
};

const toId = (raw: unknown): number | null => {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
};

const valueOf = (field: Field, raw: unknown): unknown => {
  if (raw === undefined || raw === null || raw === '') return null;
  return field.kind === 'number' ? Number(raw) : String(raw).trim();
};

export const list = (t: LookupTable): Promise<Record<string, any>[]> => lookupModel.findAll(t.table);

export const listByParent = async (t: LookupTable, parentId: unknown): Promise<Record<string, any>[]> => {
  const id = toId(parentId);
  if (!t.parent || id === null) throw new LookupError(400, `${t.parent?.column} must be a positive integer`, t.parent?.column);
  return lookupModel.findAll(t.table, { column: t.parent.column, value: id });
};

export const get = async (t: LookupTable, rawId: unknown): Promise<Record<string, any>> => {
  const id = toId(rawId);
  const row = id === null ? null : await lookupModel.findById(t.table, id);
  if (!row) throw new LookupError(404, `${t.label} not found`);
  return row;
};

// Uniqueness and parent checks shared by create and update.
const checkValues = async (t: LookupTable, body: Record<string, any>, exceptId?: number) => {
  let parentId: number | null = null;
  if (t.parent) {
    parentId = toId(body[t.parent.column]);
    if (parentId === null || !(await lookupModel.findById(t.parent.table, parentId))) {
      throw new LookupError(400, `${t.parent.label} does not exist`, t.parent.column);
    }
  }
  const scope = t.parent ? { column: t.parent.column, value: parentId } : undefined;
  for (const field of t.fields) {
    const value = valueOf(field, body[field.name]);
    if (!field.unique || value === null) continue;
    if (await lookupModel.isTaken(t.table, field.name, value, { text: field.kind === 'text', scope, exceptId })) {
      throw new LookupError(400, `${t.label} already exists`);
    }
  }
  return parentId;
};

const writeValues = (t: LookupTable, body: Record<string, any>, parentId: number | null) => [
  ...t.fields.map((field) => ({ column: field as Column, value: valueOf(field, body[field.name]) })),
  ...(t.parent ? [{ column: { name: t.parent.column }, value: parentId }] : []),
];

export const create = async (t: LookupTable, body: Record<string, any>): Promise<Record<string, any>> => {
  if (t.locked?.closed) {
    throw new LookupError(409, `${t.label}s are fixed and cannot be added: ${t.locked.reason}`);
  }
  const id = body.id === undefined || body.id === null || body.id === '' ? null : toId(body.id);
  if (body.id !== undefined && body.id !== null && body.id !== '' && id === null) {
    throw new LookupError(400, 'id must be a positive integer', 'id');
  }
  if (id === null && !t.idGenerated) throw new LookupError(400, 'id is required', 'id');
  if (id !== null && (await lookupModel.findById(t.table, id))) throw new LookupError(400, `${t.label} already exists`);

  const parentId = await checkValues(t, body);
  const values = writeValues(t, body, parentId);
  if (id !== null) values.unshift({ column: { name: 'id' }, value: id });
  if (t.code) {
    if (await lookupModel.isTaken(t.table, 'code', body.code, { text: false })) {
      throw new LookupError(400, 'code already exists', 'code');
    }
    values.push({ column: { name: 'code' }, value: body.code });
  }
  return lookupModel.insert(t.table, values);
};

export const update = async (t: LookupTable, rawId: unknown, body: Record<string, any>): Promise<Record<string, any>> => {
  const existing = await get(t, rawId);
  if (t.locked?.frozen) {
    throw new LookupError(409, `${t.label}s cannot be changed: ${t.locked.reason}`);
  }
  // A code is set once: echoing the stored value back is fine, changing it isn't.
  if (t.code && body.code !== undefined && body.code !== existing.code) {
    throw new LookupError(400, 'code cannot be changed', 'code');
  }
  const parentId = await checkValues(t, body, existing.id);
  const updated = await lookupModel.update(t.table, existing.id, writeValues(t, body, parentId), t.timestamps);
  if (!updated) throw new LookupError(404, `${t.label} not found`);
  return updated;
};

export const remove = async (t: LookupTable, rawId: unknown): Promise<void> => {
  const existing = await get(t, rawId);
  if (t.locked?.ids?.includes(existing.id)) {
    throw new LookupError(409, `${t.label} ${existing.id} is required by the system and cannot be deleted: ${t.locked.reason}`);
  }
  if (t.code && t.locked?.codes?.includes(existing.code)) {
    throw new LookupError(409, `${existing.code} is used by the app and cannot be deleted`);
  }

  const refs = await lookupModel.countReferences(t.table, existing.id);
  if (refs.length) {
    const byNoun = new Map<string, number>();
    for (const r of refs) {
      const noun = NOUNS[r.table] ?? r.table;
      byNoun.set(noun, (byNoun.get(noun) ?? 0) + r.count);
    }
    const parts = [...byNoun].map(([noun, n]) => `${n} ${noun}`);
    const uses = parts.length > 1 ? `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}` : parts[0];
    throw new LookupError(409, `${t.label} is in use by ${uses}, so it cannot be deleted`);
  }
  await lookupModel.deleteById(t.table, existing.id);
};
