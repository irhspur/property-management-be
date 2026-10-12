// Captures outgoing email instead of sending it. Call once per file, at the
// top; `sent` is emptied before each test.
import { before, after, beforeEach } from 'node:test';
import { setDeliver } from '../../utils/email';

export interface SentMail {
  to: string;
  subject: string;
  html: string;
}

export const useOutbox = (): SentMail[] => {
  const sent: SentMail[] = [];
  let restore = () => {};
  before(() => {
    restore = setDeliver(async (to, subject, html) => {
      sent.push({ to, subject, html });
    });
  });
  beforeEach(() => {
    sent.length = 0;
  });
  after(() => restore());
  return sent;
};

// The token in an email's link (verification, reset or Invite).
export const tokenIn = (mail: SentMail): string => {
  const match = mail.html.match(/[?&]token=([^&"<\s]+)/);
  if (!match) throw new Error(`no token link in: ${mail.html}`);
  return decodeURIComponent(match[1]);
};
