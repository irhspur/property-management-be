import pool from '../config/database';
import { DbClient } from '../types';

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

// CONTEXT.md "Fiscal Year": Shrawan 1 (BS month 4) of `fiscalYear` through the
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

// The Fiscal Year containing today (server-local date). Shrawan (BS month 4)
// through Chaitra (BS month 12) belong to the FY named after that same BS
// year; Baishak through Ashad (months 1-3) belong to the FY named after the
// PREVIOUS BS year, since Shrawan 1 is where a Fiscal Year begins.
export const currentFiscalYear = async (client: DbClient = pool): Promise<number> => {
  const now = new Date();
  const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
  const bs = await toBs(todayStr, client);
  return bs.bs_month >= 4 ? bs.bs_year : bs.bs_year - 1;
};

export const currentFiscalYearRange = async (client: DbClient = pool): Promise<DateRange> => {
  const fiscalYear = await currentFiscalYear(client);
  return fiscalYearRange(fiscalYear, client);
};
