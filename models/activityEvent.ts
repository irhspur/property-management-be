import pool from '../config/database';
import { DbClient } from '../types';

export type ActivityEventType =
  | 'property.created'
  | 'property.deleted'
  | 'tenant.linked'
  | 'tenant.unlinked'
  | 'agreement.created'
  | 'agreement.ended'
  | 'payment.recorded'
  | 'payment.updated'
  | 'payment.deleted';

export type SubjectKind = 'property' | 'tenant' | 'agreement' | 'payment';

export interface ActivityContext {
  property_name: string | null;
  tenant_name: string | null;
  amount: number | null;
}

export interface ActivityEventInput {
  ownerId: string;
  type: ActivityEventType;
  subjectKind: SubjectKind;
  subjectId: string;
  context: Partial<ActivityContext>;
}

export interface FeedCursor {
  occurredAt: string; // ISO timestamp
  eventId: string;
}

export const displayName = (first?: string | null, last?: string | null): string | null =>
  [first, last].filter(Boolean).join(' ') || null;

// ADR-0008: call with the mutation's own transaction client, never the pool,
// so the event commits or rolls back with the change it describes.
export const record = async (e: ActivityEventInput, client: DbClient): Promise<void> => {
  const context: ActivityContext = {
    property_name: e.context.property_name ?? null,
    tenant_name: e.context.tenant_name ?? null,
    amount: e.context.amount ?? null,
  };
  await client.query(
    `INSERT INTO activity_event (owner_id, type, subject_kind, subject_id, context)
     VALUES ($1, $2, $3, $4, $5)`,
    [e.ownerId, e.type, e.subjectKind, e.subjectId, JSON.stringify(context)]
  );
};

// Keyset pagination on (occurred_at, event_id), newest first. Fetches one
// extra row so the service can tell whether another page exists.
export const findFeed = async (
  ownerId: string,
  limit: number,
  cursor?: FeedCursor
): Promise<Record<string, any>[]> => {
  const params: any[] = [ownerId];
  let clause = 'WHERE owner_id = $1';
  if (cursor) {
    params.push(cursor.occurredAt, cursor.eventId);
    clause += ` AND (occurred_at, event_id) < ($2::timestamptz, $3::uuid)`;
  }
  params.push(limit + 1);
  const { rows } = await pool.query(
    `SELECT event_id, type, occurred_at, subject_kind, subject_id, context
     FROM activity_event
     ${clause}
     ORDER BY occurred_at DESC, event_id DESC
     LIMIT $${params.length}`,
    params
  );
  return rows;
};
