// Every "today" / "this month" boundary in the API is computed in
// Asia/Kathmandu, never the server's local zone (dashboard spec, 2026-09-29):
// at UTC+05:45 a UTC server disagrees with the business about which day it is
// for the first ~6 hours of every day, which flips month-level answers on the
// 1st. Responses that report a period echo the dates used, so clients render
// the server's boundaries instead of recomputing them.

export const BUSINESS_TIME_ZONE = 'Asia/Kathmandu';

const DATE_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: BUSINESS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
});

// Today's AD date in Kathmandu, 'YYYY-MM-DD' (en-CA formats as ISO order).
export const today = (now: Date = new Date()): string => DATE_FORMAT.format(now);

// All helpers below are pure string/calendar arithmetic on 'YYYY-MM-DD' — no
// Date objects carrying a zone — so they can't drift across a boundary.
const pad = (n: number): string => String(n).padStart(2, '0');

export const addDays = (date: string, days: number): string => {
  const [y, m, d] = date.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + days));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
};

export interface Period {
  from: string;
  to: string;
}

// The Gregorian month containing `date`, shifted by `offset` months.
export const monthOf = (date: string, offset = 0): Period => {
  const [y, m] = date.split('-').map(Number);
  const total = y * 12 + (m - 1) + offset;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return { from: `${year}-${pad(month)}-01`, to: `${year}-${pad(month)}-${pad(lastDay)}` };
};

// Every 'YYYY-MM' from the month of `from` to the month of `to`, inclusive.
export const monthKeysBetween = (from: string, to: string): string[] => {
  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);
  const keys: string[] = [];
  for (let i = fy * 12 + fm - 1; i <= ty * 12 + tm - 1; i++) {
    keys.push(`${Math.floor(i / 12)}-${pad((i % 12) + 1)}`);
  }
  return keys;
};

// created_at/updated_at are TIMESTAMP WITHOUT TIME ZONE, filled by
// CURRENT_TIMESTAMP in the session's zone. Re-attach that zone, then read the
// wall-clock date in Kathmandu — so "added this month" uses the same day
// boundary as everything else regardless of the DB server's TimeZone.
export const sqlBusinessDate = (column: string): string =>
  `((${column} AT TIME ZONE current_setting('TimeZone')) AT TIME ZONE '${BUSINESS_TIME_ZONE}')::date`;

// pg has no custom type parser registered (config/database.js), so a DATE
// column comes back as a JS Date built from LOCAL date components (see
// postgres-date), not a string. Everything here works in AD 'YYYY-MM-DD'
// strings, so every date read from the database is normalised using local
// getters — the same ones pg used to build the Date — never toISOString(),
// which can roll the calendar day for timezones east of UTC.
export const dateOnly = (d: Date | string): string => {
  if (typeof d === 'string') return d.slice(0, 10);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
};

// `startDate` advanced by `periodsElapsed * monthsPerPeriodCount` months.
// Manual integer month arithmetic, not JS Date +setMonth, so a start date of
// the 31st doesn't silently overflow into the next month — it clamps to the
// target month's last day instead, same day every cycle where possible.
export const addPeriods = (startDate: string, periodsElapsed: number, monthsPerPeriodCount: number): string => {
  const [y, m, d] = startDate.split('-').map(Number);
  const totalMonths = m - 1 + periodsElapsed * monthsPerPeriodCount;
  const targetYear = y + Math.floor(totalMonths / 12);
  const targetMonth = ((totalMonths % 12) + 12) % 12; // 0-indexed
  const lastDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  return `${targetYear}-${pad(targetMonth + 1)}-${pad(Math.min(d, lastDay))}`;
};
