/**
 * LYANN DOM - Unified V1 Production Backend REST API & Notification Server
 * Implements Stripe Connect, Secure Webhooks, and Notifications.
 * Note: CRUD operations are handled directly via Supabase on the frontend.
 */

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const sgMail = require('@sendgrid/mail');
const twilio = require('twilio');
const Stripe = require('stripe');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configurable platform commission rate (default 3.5%)
const PLATFORM_COMMISSION_RATE = parseFloat(process.env.PLATFORM_COMMISSION_RATE || '0.035');

// Stripe Init
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
const endpointSecret = process.env.STRIPE_WEBHOOK_SECRET;

// Supabase Init (Service Role for admin operations)
const supabase = createClient(
    process.env.SUPABASE_URL || 'https://placeholder.supabase.co',
    process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder_service_key'
);

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Platform-Client']
}));

// Use raw body for Stripe Webhook signature verification
app.use('/v1/payments/webhook', express.raw({ type: 'application/json' }));
app.use(bodyParser.json());
app.use(express.static(__dirname, { dotfiles: 'allow' }));

// SendGrid Mail Service Init
if (process.env.SENDGRID_API_KEY) {
    sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    console.log('📧 SendGrid Mail Service initialized.');
} else {
    console.warn('⚠️ SENDGRID_API_KEY is not defined. Email dispatch will simulate locally.');
}

// Twilio SMS Service Init
let twilioClient;
if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    twilioClient = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
    console.log('💬 Twilio SMS Service initialized.');
} else {
    console.warn('⚠️ TWILIO_ACCOUNT_SID / TWILIO_AUTH_TOKEN are not defined. SMS dispatch will simulate locally.');
}

// ==========================================================================
// 1. STRIPE CONNECT & PAYMENTS ENDPOINTS
// ==========================================================================

// Create a Stripe Connect Account for a User
app.post('/v1/payments/create-connect-account', async (req, res) => {
    try {
        const { userId, email } = req.body;
        
        if (!userId) return res.status(400).json({ error: 'userId is required' });

        // Check if user already has an account
        const { data: profile } = await supabase.from('profiles').select('stripe_account_id').eq('id', userId).single();
        
        if (profile?.stripe_account_id) {
            return res.json({ success: true, accountId: profile.stripe_account_id });
        }

        const account = await stripe.accounts.create({
            type: 'express',
            country: 'FR',
            email: email,
            capabilities: {
                card_payments: { requested: true },
                transfers: { requested: true },
            },
        });

        // Save account ID to Supabase
        await supabase.from('profiles').update({ stripe_account_id: account.id }).eq('id', userId);

        res.json({ success: true, accountId: account.id });
    } catch (error) {
        console.error('Stripe Account Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// Get Stripe Onboarding Link
app.post('/v1/payments/onboarding-link', async (req, res) => {
    try {
        const { accountId, refreshUrl, returnUrl } = req.body;
        
        const accountLink = await stripe.accountLinks.create({
            account: accountId,
            refresh_url: refreshUrl || `${process.env.CLIENT_URL}/payment-portal.html`,
            return_url: returnUrl || `${process.env.CLIENT_URL}/profile.html`,
            type: 'account_onboarding',
        });

        res.json({ success: true, url: accountLink.url });
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
});

// Create Payment Intent (Legacy Destination Charge - @deprecated, use /v1/payments/create-milestone-intent)
app.post('/v1/payments/create-intent', async (req, res) => {
    console.warn("⚠️ [DEPRECATED] /v1/payments/create-intent is deprecated. Use /v1/payments/create-milestone-intent on api/server.js.");
    try {
        const { missionId, amount, destinationAccountId } = req.body;

        if (!missionId || !amount || !destinationAccountId) {
            return res.status(400).json({ error: 'Missing parameters' });
        }

        const amountCents = Math.round(parseFloat(amount) * 100);
        const platformFeeCents = Math.round(amountCents * PLATFORM_COMMISSION_RATE);

        const paymentIntent = await stripe.paymentIntents.create({
            amount: amountCents,
            currency: 'eur',
            application_fee_amount: platformFeeCents,
            transfer_data: {
                destination: destinationAccountId,
            },
            metadata: {
                missionId: missionId
            }
        });

        res.json({ 
            success: true, 
            deprecated: true,
            clientSecret: paymentIntent.client_secret,
            grossAmount: amount,
            platformFee: platformFeeCents / 100
        });
    } catch (error) {
        console.error('Payment Intent Error:', error);
        res.status(500).json({ error: error.message });
    }
});

// ==========================================================================
// 2. STRIPE WEBHOOKS
// ==========================================================================
app.post('/v1/payments/webhook', async (req, res) => {
    const sig = req.headers['stripe-signature'];
    let event;

    try {
        event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
    } catch (err) {
        console.error('⚠️  Webhook signature verification failed.', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    // Handle the event
    try {
        switch (event.type) {
            case 'payment_intent.succeeded':
                const paymentIntent = event.data.object;
                const missionId = paymentIntent.metadata.missionId;
                console.log(`💰 PaymentIntent for ${paymentIntent.amount} was successful!`);
                
                // Update Mission Status and Payment Record in Supabase
                if (missionId) {
                    await supabase.from('missions').update({ status: 'IN_PROGRESS' }).eq('id', missionId);
                    await supabase.from('payments').update({ status: 'SUCCEEDED' }).eq('stripe_payment_intent_id', paymentIntent.id);
                }
                break;
            case 'payment_method.attached':
                const paymentMethod = event.data.object;
                console.log('💳 PaymentMethod was attached to a Customer!');
                break;
            default:
                console.log(`🤷‍♀️ Unhandled event type ${event.type}`);
        }
        res.json({ received: true });
    } catch (error) {
        console.error('Webhook Handling Error:', error);
        res.status(500).send(`Webhook Handler Error: ${error.message}`);
    }
});

// ==========================================================================
// 3. NOTIFICATION ENDPOINTS (SENDGRID & TWILIO)
// ==========================================================================
app.post('/api/notifications/send-email', async (req, res) => {
    const { to, subject, html } = req.body;
    if (!to || !subject || !html) {
        return res.status(400).json({ error: 'Missing required parameters.' });
    }
    if (!process.env.SENDGRID_API_KEY) {
        console.log(`[Email Simulated] To: ${to} | Subject: ${subject}`);
        return res.status(200).json({ success: true, simulated: true, message: 'Email simulated locally.' });
    }
    try {
        await sgMail.send({
            to,
            from: process.env.SENDGRID_SENDER_EMAIL || 'no-reply@lyann-dom.com',
            subject,
            html
        });
        res.status(200).json({ success: true, message: 'Email sent.' });
    } catch (err) {
        res.status(500).json({ error: 'Failed to send email.', details: err.message });
    }
});

app.post('/api/notifications/send-sms', async (req, res) => {
    const { to, body } = req.body;
    if (!to || !body) return res.status(400).json({ error: 'Missing parameters.' });
    if (!twilioClient || !process.env.TWILIO_PHONE_NUMBER) {
        console.log(`[SMS Simulated] To: ${to} | Body: ${body}`);
        return res.status(200).json({ success: true, simulated: true, message: 'SMS simulated locally.' });
    }
    try {
        const msg = await twilioClient.messages.create({
            body: `LYANN: ${body}`,
            from: process.env.TWILIO_PHONE_NUMBER,
            to
        });
        res.status(200).json({ success: true, messageSid: msg.sid });
    } catch (err) {
        res.status(500).json({ error: 'Failed to send SMS.', details: err.message });
    }
});

// Start Server
app.listen(PORT, () => {
    console.log(`🚀 LYANN V1 API Server running on port ${PORT}`);
});

module.exports = app;
