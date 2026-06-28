import nodemailer from 'nodemailer';

const sendEmail = async (to: string, subject: string, htmlContent: string): Promise<void> => {
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

export default sendEmail;
