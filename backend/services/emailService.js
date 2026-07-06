const nodemailer = require('nodemailer');
const path = require('path');
const { getNext } = require('../models/Counter');

// All outbound mail goes DIRECTLY through Gmail (Nodemailer). Requires a Gmail
// account with 2-Step Verification on and an APP PASSWORD (not the normal
// account password) — otherwise Gmail rejects the login with "Username and
// Password not accepted" / "cannot authenticate".
//
// Gmail shows the 16-char App Password in 4 space-separated groups
// ("abcd efgh ijkl mnop"). If those spaces get saved into the env var, Gmail
// rejects the login. Strip all whitespace so it works either way.
const cleanPass = (v) => String(v || '').replace(/\s+/g, '');
const EMAIL_PASS = cleanPass(process.env.EMAIL_PASS);
const SMTP_PASS = cleanPass(process.env.SMTP_PASS);

const GMAIL_HOST = process.env.SMTP_HOST || 'smtp.gmail.com';
const GMAIL_USER = process.env.SMTP_USER || process.env.EMAIL_USER;
const GMAIL_PASS = SMTP_PASS || EMAIL_PASS;

// Build a Gmail transport for a specific port. 465 = implicit TLS, 587 =
// STARTTLS. Generous timeouts because Gmail's handshake is slow on some hosts.
const buildGmailTransport = (port) => nodemailer.createTransport({
  host: GMAIL_HOST,
  port,
  secure: port === 465,
  requireTLS: port === 587,
  auth: { user: GMAIL_USER, pass: GMAIL_PASS },
  connectionTimeout: 60000,
  greetingTimeout: 30000,
  socketTimeout: 90000,
  tls: { rejectUnauthorized: false },
});

const PREFERRED_PORT = Number(process.env.SMTP_PORT || 587);
const ALT_PORT = PREFERRED_PORT === 465 ? 587 : 465;
const primaryTransport = buildGmailTransport(PREFERRED_PORT);
const fallbackTransport = buildGmailTransport(ALT_PORT);

// "Unexpected socket close" / connection resets happen when one Gmail port is
// blocked or flaky on the host's network. Try the preferred port, then retry on
// the other port before giving up. (If the network blocks BOTH ports — common
// on local dev machines — sending still fails and must be done from a host that
// allows outbound SMTP, e.g. production.)
const CONN_ERR_RX = /socket close|ECONNECTION|ETIMEDOUT|ESOCKET|ECONNRESET|ECONNREFUSED|connection timeout|greeting never received/i;
async function sendViaGmail(mailOptions) {
  try {
    return await primaryTransport.sendMail(mailOptions);
  } catch (err) {
    if (!CONN_ERR_RX.test(String(err && err.message))) throw err;
    console.warn(`Gmail send on port ${PREFERRED_PORT} failed (${err.message}); retrying on ${ALT_PORT}...`);
    return await fallbackTransport.sendMail(mailOptions);
  }
}

// Kept for contact/newsletter emails (use the primary transport directly).
const transporter = primaryTransport;

const invoiceFrom = process.env.SMTP_FROM || `"Cellzen Trading" <${GMAIL_USER}>`;

/**
 * Generate a sequential inquiry number (CZN-DDYYMM-0001, CZN-DDYYMM-0002, ...)
 */
async function generateInquiryNo() {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, '0');
  const yy = now.getFullYear().toString().slice(-2);
  const mm = String(now.getMonth() + 1).padStart(2, '0');
  const num = await getNext('inquiry');
  return `CZN-${dd}${yy}${mm}-${String(num).padStart(4, '0')}`;
}

/**
 * Format date for display
 */
function formatDate(date) {
  return date.toLocaleDateString('en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

/**
 * Send contact form email to Cellzen team
 */
async function sendContactEmail({ name, email, phone, country, message }) {
  const inquiryNo = await generateInquiryNo();
  const date = formatDate(new Date());

  const mailOptions = {
    from: `"Cellzen Trading" <${process.env.EMAIL_USER}>`,
    to: process.env.EMAIL_TO,
    replyTo: email,
    subject: `Inquiry ${inquiryNo} — ${name}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; overflow: hidden;">
        <!-- Header — Logo left, Inquiry right -->
        <div style="background-color: #EAE8E5; padding: 24px 28px;">
          <table role="presentation" style="width: 100%;">
            <tr>
              <td style="vertical-align: middle;">
                <img src="cid:czn-logo" alt="Cellzen" width="36" height="36" style="display: block;" />
              </td>
              <td style="vertical-align: middle; text-align: right;">
                <p style="margin: 0; font-size: 11px; color: #888;">Inquiry No: <span style="color: #412460; font-weight: 600;">${inquiryNo}</span></p>
                <p style="margin: 4px 0 0; font-size: 11px; color: #888;">Date: <span style="color: #2D2D2D;">${date}</span></p>
              </td>
            </tr>
          </table>
        </div>

        <!-- Body -->
        <div style="background-color: #EAE8E5; padding: 0 28px 28px;">
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #d4d0c8; color: #888; font-size: 13px; width: 110px;">Name</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #d4d0c8; color: #2D2D2D; font-size: 15px; font-weight: 600;">${name}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #d4d0c8; color: #888; font-size: 13px;">Email</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #d4d0c8; color: #2D2D2D; font-size: 15px;">
                <a href="mailto:${email}" style="color: #412460; text-decoration: none;">${email}</a>
              </td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #d4d0c8; color: #888; font-size: 13px;">Phone</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #d4d0c8; color: #2D2D2D; font-size: 15px;">
                <a href="tel:${phone}" style="color: #412460; text-decoration: none;">${phone}</a>
              </td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #d4d0c8; color: #888; font-size: 13px;">Country</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #d4d0c8; color: #2D2D2D; font-size: 15px;">${country}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #d4d0c8; color: #888; font-size: 13px;">Message</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #d4d0c8; color: #2D2D2D; font-size: 15px; white-space: pre-wrap;">${message}</td>
            </tr>
          </table>
        </div>

        <!-- Footer -->
        <div style="background-color: #412460; padding: 16px; text-align: center;">
          <p style="color: #E5E1DA; margin: 0; font-size: 12px;">
            This message was sent from the Cellzen Trading.
          </p>
        </div>
      </div>
    `,
    attachments: [
      {
        filename: 'CZNLogo.png',
        path: path.join(__dirname, '..', '..', 'frontend', 'public', 'Images', 'CZNLogo.png'),
        cid: 'czn-logo',
      },
    ],
  };

  return transporter.sendMail(mailOptions);
}

/**
 * Send newsletter subscription email to Cellzen team
 */
async function sendNewsletterEmail({ email }) {
  const date = formatDate(new Date());

  const mailOptions = {
    from: `"Cellzen Trading" <${process.env.EMAIL_USER}>`,
    to: process.env.EMAIL_TO,
    replyTo: email,
    subject: `New newsletter subscription — ${email}`,
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; border: 1px solid #e0e0e0; overflow: hidden;">
        <div style="background-color: #412460; padding: 18px 24px;">
          <h2 style="color: #ffffff; margin: 0; font-size: 20px;">New Newsletter Subscription</h2>
        </div>
        <div style="background-color: #EAE8E5; padding: 24px;">
          <p style="margin: 0 0 14px; color: #2D2D2D; font-size: 15px;">Someone subscribed from the Cellzen Trading website footer.</p>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #d4d0c8; color: #888; font-size: 13px; width: 90px;">Email</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #d4d0c8; color: #2D2D2D; font-size: 15px;">
                <a href="mailto:${email}" style="color: #412460; text-decoration: none;">${email}</a>
              </td>
            </tr>
            <tr>
              <td style="padding: 12px 0; color: #888; font-size: 13px;">Date</td>
              <td style="padding: 12px 0; color: #2D2D2D; font-size: 15px;">${date}</td>
            </tr>
          </table>
        </div>
      </div>
    `,
  };

  return transporter.sendMail(mailOptions);
}

/**
 * Send a generated invoice to the customer with the PDF attached. The admin
 * writes the message in the dashboard; this wraps it in a branded shell and
 * sends it via Gmail SMTP (Nodemailer), the same transporter as the contact form.
 *
 * @param {object} opts
 * @param {string} opts.to            - recipient (customer) email
 * @param {string} [opts.cc]          - optional cc (e.g. a copy to our inbox)
 * @param {string} opts.subject
 * @param {string} opts.message       - admin-authored body (plain text)
 * @param {string} [opts.customerName]
 * @param {string} [opts.invoiceNumber]
 * @param {string} opts.pdfBase64     - the invoice PDF as base64 (no data: prefix)
 * @param {string} [opts.filename]
 */
async function sendInvoiceEmail({ to, cc, subject, message, customerName, invoiceNumber, pdfBase64, filename }) {
  const date = formatDate(new Date());
  const bodyHtml = String(message || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br/>');
  const attachmentName = filename || `${invoiceNumber || 'invoice'}.pdf`;

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; overflow: hidden;">
      <div style="background-color: #412460; padding: 20px 28px;">
        <h1 style="color: #E5E1DA; margin: 0; font-size: 22px; letter-spacing: 0.5px;">Cellzen Trading</h1>
      </div>
      <div style="background-color: #E5E1DA; padding: 24px 28px;">
        <p style="margin: 0 0 14px; font-size: 12px; color: #2D2D2D;">Invoice
          <span style="color: #412460; font-weight: 600;">${invoiceNumber || ''}</span>
          &middot; ${date}
        </p>
        <div style="background: #ffffff; border-radius: 8px; padding: 20px; color: #2D2D2D; font-size: 15px; line-height: 1.6;">
          ${bodyHtml}
        </div>
        <p style="margin: 18px 0 0; font-size: 13px; color: #2D2D2D;">📎 Your invoice <strong>${attachmentName}</strong> is attached as a PDF.</p>
      </div>
      <div style="background-color: #2D2D2D; padding: 16px; text-align: center;">
        <p style="color: #E5E1DA; margin: 0; font-size: 12px;">This email was sent by Cellzen Trading regarding your invoice.</p>
      </div>
    </div>
  `;

  const text = message || '';

  // Send directly via Gmail, with automatic 587<->465 fallback on socket errors.
  const sendPromise = sendViaGmail({
    from: invoiceFrom,
    to,
    ...(cc ? { cc } : {}),
    replyTo: process.env.EMAIL_USER,
    subject,
    text,
    html,
    attachments: pdfBase64 ? [{ filename: attachmentName, content: pdfBase64, encoding: 'base64' }] : [],
  });

  // Hard cap so a truly stuck socket can't hang forever. Set above the SMTP
  // socket timeout (the handshake can take ~100s on restricted networks).
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const e = new Error('The email server did not respond in time. Please try again.');
      e.statusCode = 504;
      reject(e);
    }, 160000);
    if (timer.unref) timer.unref();
  });

  try {
    return await Promise.race([sendPromise, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Send a one-time login verification code (used for a staff member's FIRST
 * login). Sent directly through Gmail (same transporter as the invoice email).
 *
 * @param {object} opts
 * @param {string} opts.to    - recipient email
 * @param {string} opts.code  - the numeric code
 * @param {string} [opts.name]
 * @param {number} [opts.expiryMinutes]
 */
async function sendVerificationCodeEmail({ to, code, name, expiryMinutes = 10 }) {
  const subject = 'Your Cellzen Trading staff verification code';
  const safeName = String(name || 'there').replace(/[<>&]/g, '');
  const text = `Your Cellzen Trading verification code is ${code}. It expires in ${expiryMinutes} minutes.`;
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#2D2D2D;max-width:560px;margin:0 auto;border:1px solid #e0e0e0">
      <div style="background-color:#412460;padding:18px 24px"><h2 style="color:#E5E1DA;margin:0;font-size:20px">Staff Verification</h2></div>
      <div style="background-color:#E5E1DA;padding:24px">
        <p style="margin:0 0 8px">Hello ${safeName},</p>
        <p style="margin:0 0 14px">Use this code to finish signing in to the Cellzen staff portal for the first time:</p>
        <p style="font-size:30px;font-weight:700;letter-spacing:8px;color:#412460;margin:0 0 14px">${code}</p>
        <p style="margin:0;font-size:13px;color:#2D2D2D">This code expires in ${expiryMinutes} minutes. If you did not try to sign in, you can ignore this email.</p>
      </div>
    </div>
  `;

  return sendViaGmail({ from: invoiceFrom, to, subject, text, html });
}

module.exports = { sendContactEmail, sendNewsletterEmail, sendInvoiceEmail, sendVerificationCodeEmail };
