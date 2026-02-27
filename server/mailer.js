// server/mailer.js
// Minimal SMTP mail helper for Town Capture

const nodemailer = require("nodemailer");

function getTransporter() {
  const host = process.env.SMTP_HOST || "smtp.gmail.com";
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = port === 465; // true for 465, false for 587

  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!user || !pass) {
    throw new Error("SMTP_USER / SMTP_PASS missing in .env");
  }

  return nodemailer.createTransport({
    host,
    port,
    secure,
    auth: { user, pass },
  });
}

/**
 * Send an email
 * @param {string} to
 * @param {string} subject
 * @param {string} html
 */
async function sendMail(to, subject, html) {
  const from =
    process.env.MAIL_FROM ||
    process.env.SMTP_USER ||
    "no-reply@towncapture.local";

  const transporter = getTransporter();

  await transporter.sendMail({
    from,
    to,
    subject,
    html,
  });
}

module.exports = { sendMail };
