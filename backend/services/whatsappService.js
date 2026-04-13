const axios = require('axios');

const WHATSAPP_API_URL = `https://graph.facebook.com/v21.0/${process.env.WHATSAPP_PHONE_ID}/messages`;

/**
 * Send a WhatsApp message to the business number when a contact form is submitted.
 * Uses the Meta WhatsApp Cloud API.
 *
 * Required env vars:
 *   WHATSAPP_PHONE_ID   — Your WhatsApp Business phone number ID
 *   WHATSAPP_TOKEN       — Permanent access token from Meta Business
 *   WHATSAPP_RECIPIENT   — The WhatsApp number to receive notifications (with country code, e.g. 8613073040201)
 */
async function sendContactWhatsApp({ name, email, phone, country, message }) {
  if (!process.env.WHATSAPP_PHONE_ID || !process.env.WHATSAPP_TOKEN || !process.env.WHATSAPP_RECIPIENT) {
    console.warn('WhatsApp env vars not configured — skipping WhatsApp notification');
    return null;
  }

  const text = [
    `📩 *New Contact Inquiry*`,
    ``,
    `*Name:* ${name}`,
    `*Email:* ${email}`,
    `*Phone:* ${phone || 'N/A'}`,
    `*Country:* ${country || 'N/A'}`,
    ``,
    `*Message:*`,
    message,
  ].join('\n');

  const response = await axios.post(
    WHATSAPP_API_URL,
    {
      messaging_product: 'whatsapp',
      to: process.env.WHATSAPP_RECIPIENT,
      type: 'text',
      text: { body: text },
    },
    {
      headers: {
        Authorization: `Bearer ${process.env.WHATSAPP_TOKEN}`,
        'Content-Type': 'application/json',
      },
    }
  );

  return response.data;
}

module.exports = { sendContactWhatsApp };
