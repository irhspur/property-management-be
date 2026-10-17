import pool from '../config/database';

export type IdentityStatus = 'unreviewed' | 'verified' | 'rejected';

export interface IdentityReview {
  status: IdentityStatus;
  rejection_reason: string | null;
  reviewed_at: Date | null;
  reviewed_by_email: string | null;
}

export interface OwnerReviewSummary {
  user_id: string;
  email: string;
  first_name: string | null;
  middle_name: string | null;
  last_name: string | null;
  mobile_number: string | null;
  is_verified: boolean;
  is_active: boolean;
  created_at: Date;
  has_profile: boolean;
  document_count: number;
  identity_status: IdentityStatus;
  reviewed_at: Date | null;
}

const OWNERS = `FROM users u
  JOIN user_type ut ON ut.id = u.user_type_id AND ut.name = 'property_owner'
  LEFT JOIN user_details ud ON ud.user_id = u.user_id
  LEFT JOIN identity_review ir ON ir.user_id = u.user_id`;

const SUMMARY = `u.user_id, u.email, ud.first_name, ud.middle_name, ud.last_name, ud.mobile_number,
  u.is_verified, u.is_active, u.created_at,
  ud.user_id IS NOT NULL AS has_profile,
  (SELECT COUNT(*)::int FROM files f WHERE f.user_id = u.user_id AND f.file_category_id IS NOT NULL) AS document_count,
  COALESCE(ir.status, 'unreviewed') AS identity_status,
  ir.reviewed_at`;

// Every Property Owner, with or without a profile, newest first.
export const findOwners = async (): Promise<OwnerReviewSummary[]> => {
  const { rows } = await pool.query<OwnerReviewSummary>(`SELECT ${SUMMARY} ${OWNERS} ORDER BY u.created_at DESC, u.email`);
  return rows;
};

export const findOwner = async (userId: string): Promise<OwnerReviewSummary | null> => {
  const { rows } = await pool.query<OwnerReviewSummary>(`SELECT ${SUMMARY} ${OWNERS} WHERE u.user_id = $1`, [userId]);
  return rows[0] || null;
};

// The owner's details and address with lookup names, for the reviewer to read;
// null without a profile.
export const findDetails = async (userId: string): Promise<Record<string, any> | null> => {
  const { rows } = await pool.query(
    `SELECT ud.first_name, ud.middle_name, ud.last_name, g.name AS gender, ud.dob,
      c.name AS country, bd.name AS birth_district, ud.father_full_name, ud.nin_number, ud.mobile_number,
      ud.citizenship_number, cd.name AS citizenship_issue_district, ud.citizenship_issue_date,
      ud.bank_account_number, ud.bank_name,
      ac.name AS address_country, p.name AS province, ad.name AS address_district, m.name AS municipality,
      a.ward_number, a.street_name, a.house_number, a.contact_number_1, a.contact_number_2, a.contact_address
    FROM user_details ud
    LEFT JOIN gender g ON g.id = ud.gender_id
    LEFT JOIN country c ON c.id = ud.country_id
    LEFT JOIN district bd ON bd.id = ud.birth_district_id
    LEFT JOIN district cd ON cd.id = ud.citizenship_issue_district_id
    LEFT JOIN address a ON a.user_id = ud.user_id
    LEFT JOIN country ac ON ac.id = a.country_id
    LEFT JOIN province p ON p.id = a.province_id
    LEFT JOIN district ad ON ad.id = a.district_id
    LEFT JOIN municipality m ON m.id = a.municipality_id
    WHERE ud.user_id = $1`,
    [userId]
  );
  return rows[0] || null;
};

export const findReview = async (userId: string): Promise<IdentityReview> => {
  const { rows } = await pool.query<IdentityReview>(
    `SELECT ir.status, ir.rejection_reason, ir.reviewed_at, r.email AS reviewed_by_email
    FROM identity_review ir LEFT JOIN users r ON r.user_id = ir.reviewed_by
    WHERE ir.user_id = $1`,
    [userId]
  );
  return rows[0] || { status: 'unreviewed', rejection_reason: null, reviewed_at: null, reviewed_by_email: null };
};

// Replaces any earlier review.
export const upsert = async (fields: {
  userId: string;
  status: 'verified' | 'rejected';
  rejectionReason: string | null;
  reviewedBy: string;
}): Promise<void> => {
  await pool.query(
    `INSERT INTO identity_review (user_id, status, rejection_reason, reviewed_by)
    VALUES ($1, $2, $3, $4)
    ON CONFLICT (user_id) DO UPDATE SET
      status = EXCLUDED.status, rejection_reason = EXCLUDED.rejection_reason,
      reviewed_by = EXCLUDED.reviewed_by, reviewed_at = date_trunc('milliseconds', now())`,
    [fields.userId, fields.status, fields.rejectionReason, fields.reviewedBy]
  );
};
