import * as propertyModel from '../models/property';
import * as agreementModel from '../models/agreement';
import * as paymentModel from '../models/payment';
import * as activityModel from '../models/activityEvent';
import { FeedCursor } from '../models/activityEvent';
import { today, addDays, monthOf, Period } from '../utils/businessDate';
import { isUuid } from '../utils/validators';

const err = (message: string, statusCode = 500): Error =>
  Object.assign(new Error(message), { statusCode });

const ENDING_SOON_DAYS = 30;

export interface Dashboard {
  period: Period;
  properties: { total: number; leased: number; vacant: number; added_this_month: number };
  tenants: { active: number };
  agreements: { active: number; ending_within_30_days: number };
  revenue: { current_month: number; previous_month: number };
}

// Portfolio Overview aggregate (dashboard spec, P0): counts only, so the
// client never downloads full lists to count them. "This month" is the
// Gregorian month containing today in Kathmandu, echoed back as `period`.
export const getDashboard = async (ownerId: string): Promise<Dashboard> => {
  const todayStr = today();
  const current = monthOf(todayStr);
  const previous = monthOf(todayStr, -1);

  const [properties, agreements, rent] = await Promise.all([
    propertyModel.countsByOwner(ownerId, current.from, current.to),
    agreementModel.countsByOwner(ownerId, addDays(todayStr, ENDING_SOON_DAYS)),
    // Same basis as /payments/summary.total_rent_collected: rent purpose, paid_on.
    paymentModel.findRentSummary(ownerId, { from: previous.from, to: current.to }),
  ]);

  const monthTotal = (p: Period): number =>
    rent.monthly.find((m) => m.month === p.from.slice(0, 7))?.total ?? 0;

  return {
    period: current,
    properties: {
      total: properties.total,
      leased: properties.leased,
      vacant: properties.vacant,
      added_this_month: properties.added_in_period,
    },
    // Distinct tenants holding an active Agreement — not the Ownership Link
    // count, which includes linked tenants with no current Agreement.
    tenants: { active: agreements.active_tenants },
    agreements: { active: agreements.active, ending_within_30_days: agreements.ending_soon },
    revenue: { current_month: monthTotal(current), previous_month: monthTotal(previous) },
  };
};

const DEFAULT_FEED_LIMIT = 10;
const MAX_FEED_LIMIT = 50;

// The cursor is opaque to clients; internally it's the last row's keyset.
const encodeCursor = (c: FeedCursor): string =>
  Buffer.from(JSON.stringify([c.occurredAt, c.eventId])).toString('base64url');

const decodeCursor = (raw: string): FeedCursor => {
  try {
    const [occurredAt, eventId] = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    if (typeof occurredAt !== 'string' || isNaN(Date.parse(occurredAt)) || !isUuid(eventId)) {
      throw new Error();
    }
    return { occurredAt, eventId };
  } catch {
    throw err('cursor is invalid', 400);
  }
};

export interface ActivityFeedItem {
  event_id: string;
  type: string;
  occurred_at: Date;
  subject: { kind: string; id: string };
  context: { property_name: string | null; tenant_name: string | null; amount: number | null };
}

// Activity feed (dashboard spec, P1; ADR-0008), newest first.
export const getActivity = async (
  ownerId: string,
  query: { limit?: number; cursor?: string }
): Promise<{ data: ActivityFeedItem[]; next_cursor: string | null }> => {
  const requested = query.limit !== undefined && Number.isFinite(query.limit) ? Math.trunc(query.limit) : DEFAULT_FEED_LIMIT;
  const limit = Math.min(Math.max(requested, 1), MAX_FEED_LIMIT);
  const cursor = query.cursor ? decodeCursor(query.cursor) : undefined;

  const rows = await activityModel.findFeed(ownerId, limit, cursor);
  const page = rows.slice(0, limit);
  const last = page[page.length - 1];

  return {
    data: page.map((r) => ({
      event_id: r.event_id,
      type: r.type,
      occurred_at: r.occurred_at,
      subject: { kind: r.subject_kind, id: r.subject_id },
      context: {
        property_name: r.context.property_name ?? null,
        tenant_name: r.context.tenant_name ?? null,
        amount: r.context.amount != null ? Number(r.context.amount) : null,
      },
    })),
    next_cursor:
      rows.length > limit && last
        ? encodeCursor({ occurredAt: new Date(last.occurred_at).toISOString(), eventId: last.event_id })
        : null,
  };
};
