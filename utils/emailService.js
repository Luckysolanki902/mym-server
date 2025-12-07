const nodemailer = require('nodemailer');
require('dotenv').config();

// Configure transporter
const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: Number(process.env.MAIL_PORT),
  secure: false, // true for 465, false for other ports
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

/**
 * Sends an email notification.
 * 
 * @param {Object} params
 * @param {string} params.to - Recipient email
 * @param {string} params.subject - Email subject
 * @param {string} params.text - Email plain text content
 */
const sendNotification = async ({ to, subject, text }) => {
  try {
    if (!to) {
      console.warn('[Email Service] Missing recipient email');
      return { success: false, error: 'Missing recipient' };
    }

    const mailOptions = {
      from: `"${process.env.MAIL_FROM_NAME}" <${process.env.MAIL_FROM_EMAIL}>`,
      to: to,
      subject: subject,
      text: text,
    };

    const info = await transporter.sendMail(mailOptions);
    // console.log(`[Email Service] ✅ Sent to ${to} (MsgID: ${info.messageId})`);
    return { success: true, messageId: info.messageId };

  } catch (error) {
    console.error(`[Email Service] ❌ Error sending to ${to}:`, error.message);
    return { success: false, error: error.message };
  }
};

module.exports = { sendNotification };
