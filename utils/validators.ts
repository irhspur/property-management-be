// Query-string format checks shared by services. Each throws a 400 carrying
// the caller's parameter name, and passes `undefined` through (every filter
// using these is optional).

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const badRequest = (message: string): Error => Object.assign(new Error(message), { statusCode: 400 });

export const isUuid = (value: string): boolean => UUID_RE.test(value);

export const assertDate = (label: string, value?: string): void => {
  if (value !== undefined && !DATE_RE.test(value)) {
    throw badRequest(`${label} must be a date in YYYY-MM-DD format`);
  }
};

export const assertUuid = (label: string, value?: string): void => {
  if (value !== undefined && !isUuid(value)) {
    throw badRequest(`${label} must be a UUID`);
  }
};
