/**
 * LYANN DOM - Production Backend Notification Server
 * Implements secure API endpoints for Twilio SMS & SendGrid Emailing.
 *
 * Requirements:
 * npm install express body-parser @sendgrid/mail twilio dotenv cors
 *
 * Running in production:
 * node server.js
 */

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const sgMail = require('@sendgrid/mail');
const twilio = require('twilio');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS so the static frontend can call this backend
app.use(cors());
app.use(bodyParser.json());

// Serve static frontend files if deployed as a single app
app.use(express.static(__dirname));

// Initialize SendGrid API Key
if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    console.log('📧 SendGrid Mail Service initialized.');
} else {
    console.warn('⚠️ SENDGRID_API_KEY is not defined. Email dispatch will fail in production.');
}

// Initialize Twilio client
let twilioClient;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    console.log('💬 Twilio SMS Service initialized.');
} else {
    console.warn('⚠️ TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN are not defined. SMS dispatch will fail in production.');
}

// ==========================================================================
// API ENDPOINT: SEND EMAIL (SENDGRID)
// ==========================================================================
app.post('/api/notifications/send-email', async (req, res) => {
    const { to, name, subject, html } = req.body;

    if (!to || !subject || !html) {
        return res.status(400).json({ error: 'Missing required parameters (to, subject, html).' });
    }

    if (!process.env.SENDGRID_API_KEY) {
        return res.status(503).json({ error: 'SendGrid is not configured on this server.' });
    }

    const msg = {
        to: to,
        from: process.env.SENDGRID_SENDER_EMAIL || 'no-reply@lyann-dom.com', // Must be verified in SendGrid
        subject: subject,
        html: `
            <div style="font-family: 'Outfit', sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #E5AF2F; border-radius: 12px; background: #FAF9F6;">
                <div style="text-align: center; margin-bottom: 20px;">
                    <h2 style="color: #4A7C59; margin: 0;">LYANN DOM</h2>
                    <p style="font-size: 0.8rem; letter-spacing: 0.1em; color: #8C8A85; margin: 2px 0 0;">LE LIEN QUI COMPTE</p>
                </div>
                <div style="background: #FFFFFF; padding: 24px; border-radius: 8px; border: 1px solid #ECEBE6;">
                    <p>Bonjour <strong>${name || 'Lyanneur'}</strong>,</p>
                    ${html}
                </div>
                <div style="text-align: center; margin-top: 20px; font-size: 0.75rem; color: #A19F9A;">
                    <p>© 2026 LYANN DOM. Tous droits réservés.</p>
                    <p>Pour toute aide, contactez notre équipe de médiation locale.</p>
                </div>
            </div>
        `
    };

    try {
        await sgMail.send(msg);
        console.log(`[Email Sent] To: ${to} | Subject: ${subject}`);
        res.status(200).json({ success: true, message: 'Email sent successfully.' });
    } catch (error) {
        console.error('Error sending email through SendGrid:', error);
        res.status(500).json({ error: 'Failed to send email.', details: error.message });
    }
});

// ==========================================================================
// API ENDPOINT: SEND SMS (TWILIO)
// ==========================================================================
app.post('/api/notifications/send-sms', async (req, res) => {
    const { to, body } = req.body;

    if (!to || !body) {
        return res.status(400).json({ error: 'Missing required parameters (to, body).' });
    }

    if (!twilioClient || !process.env.TWILIO_PHONE_NUMBER) {
        return res.status(503).json({ error: 'Twilio is not configured on this server.' });
    }

    try {
        const message = await twilioClient.messages.create({
            body: `LYANN DOM: ${body}`,
            from: process.env.TWILIO_PHONE_NUMBER,
            to: to
        });
        console.log(`[SMS Sent] To: ${to} | SID: ${message.sid}`);
        res.status(200).json({ success: true, messageSid: message.sid });
    } catch (error) {
        console.error('Error sending SMS through Twilio:', error);
        res.status(500).json({ error: 'Failed to send SMS.', details: error.message });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 LYANN Secure Notification Server running on port ${PORT}`);
});
