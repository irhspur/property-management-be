import pool from '../config/database';
import { DbClient } from '../types';
import { today } from './businessDate';

const err = (message: string, statusCode = 400): Error =>
  Object.assign(new Error(message), { statusCode });

export interface BsMonth {
  bs_year: number;
  bs_month: number;
  month_name: string;
  ad_start_date: string;
  days: number;
}

export interface BsDate {
  bs_year: number;
  bs_month: number;
  month_name: string;
  day: number;
}

export interface DateRange {
  from: string;
  to: string;
}

// ADR-0006: BS<->AD conversion is a seeded lookup, never computed — BS month
// lengths have no closed-form formula. All date arithmetic below happens in
// SQL against `bs_month`, not in JS Date objects, so results come back as
// plain 'YYYY-MM-DD' strings and never cross a timezone boundary.

// The BS month a given AD date falls within, and which day of that month it is.
export const toBs = async (adDate: string, client: DbClient = pool): Promise<BsDate> => {
  const { rows } = await client.query<{ bs_year: number; bs_month: number; month_name: string; day: number; days: number }>(
    `SELECT bs_year, bs_month, month_name, days,
            ($1::date - ad_start_date + 1)::int AS day
     FROM bs_month
     WHERE ad_start_date <= $1::date
     ORDER BY ad_start_date DESC
     LIMIT 1`,
    [adDate]
  );
  const row = rows[0];
  if (!row || row.day > row.days) {
    throw err(`${adDate} falls outside the seeded Bikram Sambat calendar range`);
  }
  return { bs_year: row.bs_year, bs_month: row.bs_month, month_name: row.month_name, day: row.day };
};

// BsDate, or null past the seeded calendar (BS 2090) — a long lease's later
// steps, or a period end, can run beyond it.
export const toBsOrNull = async (adDate: string, client: DbClient = pool): Promise<BsDate | null> => {
  try {
    return await toBs(adDate, client);
  } catch (e) {
    if ((e as any).statusCode === 400) return null;
    throw e;
  }
};

// toBsOrNull for many dates in one round trip, keyed by AD 'YYYY-MM-DD'. A
// list endpoint can carry thousands of dates (Ledger ?all=true), most of them
// shared, so each distinct date is converted once.
export const toBsMany = async (adDates: string[], client: DbClient = pool): Promise<Map<string, BsDate | null>> => {
  const distinct = [...new Set(adDates)];
  const result = new Map<string, BsDate | null>();
  if (distinct.length === 0) return result;

  const { rows } = await client.query<{
    ad_date: string; bs_year: number | null; bs_month: number | null; month_name: string | null; day: number | null; days: number | null;
  }>(
    `SELECT d::text AS ad_date, b.bs_year, b.bs_month, b.month_name, b.days,
            (d - b.ad_start_date + 1)::int AS day
     FROM unnest($1::date[]) AS d
     LEFT JOIN LATERAL (
       SELECT bs_year, bs_month, month_name, days, ad_start_date
       FROM bs_month
       WHERE ad_start_date <= d
       ORDER BY ad_start_date DESC
       LIMIT 1
     ) b ON TRUE`,
    [distinct]
  );
  for (const row of rows) {
    result.set(
      row.ad_date,
      row.bs_year === null || row.day! > row.days!
        ? null
        : { bs_year: row.bs_year, bs_month: row.bs_month!, month_name: row.month_name!, day: row.day! }
    );
  }
  return result;
};

// The AD date for a given BS year/month/day.
export const toAd = async (
  bsYear: number,
  bsMonth: number,
  bsDay: number,
  client: DbClient = pool
): Promise<string> => {
  const { rows } = await client.query<{ ad_date: string; days: number }>(
    `SELECT (ad_start_date + ($3::int - 1))::text AS ad_date, days
     FROM bs_month
     WHERE bs_year = $1 AND bs_month = $2`,
    [bsYear, bsMonth, bsDay]
  );
  const row = rows[0];
  if (!row) throw err(`BS ${bsYear}/${bsMonth} falls outside the seeded calendar range`);
  if (bsDay < 1 || bsDay > row.days) {
    throw err(`BS ${bsYear}/${bsMonth} has ${row.days} days — ${bsDay} is not valid`);
  }
  return row.ad_date;
};

const bsMonthRow = async (bsYear: number, bsMonth: number, client: DbClient): Promise<BsMonth> => {
  const { rows } = await client.query<BsMonth>(
    `SELECT bs_year, bs_month, month_name, ad_start_date::text, days
     FROM bs_month WHERE bs_year = $1 AND bs_month = $2`,
    [bsYear, bsMonth]
  );
  const row = rows[0];
  if (!row) throw err(`BS ${bsYear}/${bsMonth} falls outside the seeded calendar range`);
  return row;
};

// GLOSSARY.md "Fiscal Year": Shrawan 1 (BS month 4) of `fiscalYear` through the
// last day of Ashad (BS month 3) of `fiscalYear + 1`. `fiscalYear` is the
// opening year, matching how "FY 2080/81" is named.
export const fiscalYearRange = async (fiscalYear: number, client: DbClient = pool): Promise<DateRange> => {
  const start = await bsMonthRow(fiscalYear, 4, client);
  const nextStart = await bsMonthRow(fiscalYear + 1, 4, client);
  const { rows } = await client.query<{ to_date: string }>(
    `SELECT (ad_start_date - 1)::text AS to_date FROM bs_month WHERE bs_year = $1 AND bs_month = $2`,
    [nextStart.bs_year, nextStart.bs_month]
  );
  return { from: start.ad_start_date, to: rows[0].to_date };
};

// Every Fiscal Year from the one containing `from` to the one containing
// `to` (AD 'YYYY-MM-DD'), newest first. Clamped to the Fiscal Years the
// seeded calendar can fully range (fiscalYearRange needs both Shrawans), so
// every year listed can be requested; a date outside it lands on the nearest.
export const fiscalYearsBetween = async (from: string, to: string, client: DbClient = pool): Promise<number[]> => {
  const { rows } = await client.query<{ first: number; last: number }>(
    `WITH fy AS (
       SELECT b.bs_year, b.ad_start_date FROM bs_month b
       WHERE b.bs_month = 4
         AND EXISTS (SELECT 1 FROM bs_month n WHERE n.bs_year = b.bs_year + 1 AND n.bs_month = 4)
     )
     SELECT COALESCE((SELECT MAX(bs_year) FROM fy WHERE ad_start_date <= $1::date), (SELECT MIN(bs_year) FROM fy)) AS first,
            COALESCE((SELECT MAX(bs_year) FROM fy WHERE ad_start_date <= $2::date), (SELECT MIN(bs_year) FROM fy)) AS last`,
    [from, to]
  );
  const { first, last } = rows[0];
  const years: number[] = [];
  for (let y = last; y >= first; y--) years.push(y);
  return years;
};

// The Fiscal Year containing today (Kathmandu date — utils/businessDate.ts). Shrawan (BS month 4)
// through Chaitra (BS month 12) belong to the FY named after that same BS
// year; Baishak through Ashad (months 1-3) belong to the FY named after the
// PREVIOUS BS year, since Shrawan 1 is where a Fiscal Year begins.
export const currentFiscalYear = async (client: DbClient = pool): Promise<number> => {
  const bs = await toBs(today(), client);
  return bs.bs_month >= 4 ? bs.bs_year : bs.bs_year - 1;
};

// The BS year containing today (Kathmandu date).
export const currentBsYear = async (client: DbClient = pool): Promise<number> =>
  (await toBs(today(), client)).bs_year;

export const currentFiscalYearRange = async (client: DbClient = pool): Promise<DateRange> => {
  const fiscalYear = await currentFiscalYear(client);
  return fiscalYearRange(fiscalYear, client);
};
