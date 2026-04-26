const nodemailer = require('nodemailer');
const path = require('path');
const { getNext } = require('../models/Counter');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

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

module.exports = { sendContactEmail, sendNewsletterEmail };
