// Identity Review: an admin's verdict on a Property Owner's identity, from
// their details and personal Documents. One row per reviewed owner, replaced
// on each review; no row means unreviewed. Separate from `users.is_verified`,
// which only records email verification. Expand-only: the previous release
// never reads the table.

exports.up = (pgm) => {
  pgm.sql(`
    CREATE TABLE public.identity_review (
        user_id uuid PRIMARY KEY REFERENCES public.users(user_id) ON DELETE CASCADE,
        status character varying(10) NOT NULL CHECK (status IN ('verified', 'rejected')),
        rejection_reason character varying(500),
        reviewed_by uuid REFERENCES public.users(user_id) ON DELETE SET NULL,
        reviewed_at timestamp with time zone DEFAULT date_trunc('milliseconds'::text, now()) NOT NULL,
        CHECK ((status = 'rejected') = (rejection_reason IS NOT NULL))
    );
  `);
};

exports.down = (pgm) => {
  pgm.sql(`
    DROP TABLE public.identity_review;
  `);
};
