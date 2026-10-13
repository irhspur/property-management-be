// Tenant Invite: a Property Owner no longer chooses a Tenant's password; the
// Tenant sets it from an Invite email. `invite_pending` is true until they do.
//
// Tenants created before this were stored with the owner-chosen password in
// plaintext and unverified, so none of them can log in. Mark them invite
// pending and overwrite the plaintext with a marker that is not a bcrypt hash,
// so it can never match a password. Owners activate them by resending the
// Invite. Expand-only: the previous release ignores the column.

exports.up = (pgm) => {
  pgm.sql(`
    ALTER TABLE public.users ADD COLUMN invite_pending boolean NOT NULL DEFAULT false;

    UPDATE public.users
    SET invite_pending = true, password = '!invite-pending', updated_at = NOW()
    WHERE user_type_id = 3 AND password NOT LIKE '$2%';
  `);
};

// The plaintext passwords are gone for good; dropping the column is still safe.
exports.down = (pgm) => {
  pgm.sql(`
    ALTER TABLE public.users DROP COLUMN invite_pending;
  `);
};
