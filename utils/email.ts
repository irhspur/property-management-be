import nodemailer from 'nodemailer';

export type Deliver = (to: string, subject: string, htmlContent: string) => Promise<void>;

const gmail: Deliver = async (to, subject, htmlContent) => {
  const { EMAIL_USER, EMAIL_PASS } = process.env;
  if (!EMAIL_USER || !EMAIL_PASS) throw new Error('Email credentials not configured');

  const transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: { user: EMAIL_USER, pass: EMAIL_PASS },
  });

  try {
    await transporter.sendMail({ from: EMAIL_USER, to, subject, html: htmlContent });
  } catch (error) {
    throw new Error(`Failed to send email to ${to}: ${(error as Error).message}`);
  }
};

let deliver: Deliver = gmail;

// Swaps how mail leaves the app (tests capture it instead of sending). Returns
// a function that restores the previous one.
export const setDeliver = (next: Deliver): (() => void) => {
  const previous = deliver;
  deliver = next;
  return () => {
    deliver = previous;
  };
};

const sendEmail: Deliver = (to, subject, htmlContent) => deliver(to, subject, htmlContent);

export default sendEmail;
