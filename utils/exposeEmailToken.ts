// An emailed token (verification, reset, Invite) reaches its user by email
// only. With EXPOSE_EMAIL_TOKENS=true (local development without a mail
// sender) it is also returned in the response: spread this into the body.
export const exposeEmailToken = (token: string): { token?: string } =>
  process.env.EXPOSE_EMAIL_TOKENS === 'true' ? { token } : {};
