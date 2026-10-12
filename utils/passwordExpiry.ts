// A password expires a year after it last changed. Login (authService) and
// GET /tenant/profile (tenantPortalService) both use this, so they agree.

// When the password expires, or null when it has never been recorded as changed.
export const passwordExpiresOn = (lastChanged: Date | null | undefined): Date | null => {
  if (!lastChanged) return null;
  const expiry = new Date(lastChanged);
  expiry.setFullYear(expiry.getFullYear() + 1);
  return expiry;
};

// A password never recorded as changed counts as expired (ticket 02).
export const isPasswordExpired = (lastChanged: Date | null | undefined, now: Date = new Date()): boolean => {
  const expiry = passwordExpiresOn(lastChanged);
  return expiry === null || now > expiry;
};
