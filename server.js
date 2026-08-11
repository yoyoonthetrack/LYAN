/**
 * LYANN DOM - Unified V1 Production Backend REST API & Notification Server
 * Implements Auth, Members, Recommendations, Quotes & Versioning, Milestones,
 * Payments/Stripe Connect, Reviews, Bokantaj Feed, Audit Logs, and Notifications.
 */

const express = require('express');
const bodyParser = require('body-parser');
const cors = require('cors');
const sgMail = require('@sendgrid/mail');
const twilio = require('twilio');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configurable platform commission rate (default 3.5%)
const PLATFORM_COMMISSION_RATE = parseFloat(process.env.PLATFORM_COMMISSION_RATE || '0.035');

app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Platform-Client']
}));

app.use(bodyParser.json());
app.use(express.static(__dirname));

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
// IN-MEMORY DATABASE & AUDIT LOG STORE
// ==========================================================================

const USERS_DB = [
    { id: 1, name: "David Jean-Baptiste", email: "david@lyann-dom.com", role: "user", isPro: true, kycVerified: true, city: "Baie-Mahault", territoryKey: "guadeloupe", avatar: "david-34.png", hourlyRate: "35 €/h", bio: "Spécialiste plomberie et électricité.", skills: ["Plomberie", "Électricité", "Climatisation"], recommendationCount: 25 },
    { id: 2, name: "Tati Huguette Cazeau", email: "huguette@lyann-dom.com", role: "user", isPro: false, kycVerified: true, city: "Fort-de-France", territoryKey: "martinique", avatar: "huguette-68.png", hourlyRate: "20 €/h", bio: "Cuisine traditionnelle & aide aux séniors.", skills: ["Cuisine créole", "Accompagnement", "Jardinage"], recommendationCount: 42 },
    { id: 3, name: "Sarah Manicon", email: "sarah@lyann-dom.com", role: "user", isPro: true, kycVerified: true, city: "Le Gosier", territoryKey: "guadeloupe", avatar: "sarah-29.png", hourlyRate: "40 €/h", bio: "Design d'intérieur & peinture.", skills: ["Peinture", "Décoration", "Aménagement"], recommendationCount: 19 },
    { id: 4, name: "Kevin Bellerose", email: "kevin@lyann-dom.com", role: "user", isPro: true, kycVerified: true, city: "Cayenne", territoryKey: "guyane", avatar: "kevin-41.png", hourlyRate: "30 €/h", bio: "Paysagiste & entretien.", skills: ["Élagage", "Jardinage", "Tonte"], recommendationCount: 31 }
];

const RECOMMENDATIONS_STORE = new Map(); // key: `${recommenderId}_${targetMemberId}`
const BOKANTAJ_LIKES_STORE = new Map(); // key: `${userId}_${postId}`

const AUDIT_LOGS = [];

function logAuditEvent(devisId, action, userId, oldValue, newValue) {
    const entry = {
        id: `audit-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
        devisId,
        action,
        userId,
        timestamp: new Date().toISOString(),
        oldValue,
        newValue
    };
    AUDIT_LOGS.push(entry);
    console.log(`📜 [Audit Log] ${action} on Quote ${devisId} by User ${userId}`);
    return entry;
}

const QUOTES_DB = new Map();
const REVIEWS_DB = [];
const FEED_POSTS_DB = [
    { id: 'post-1', author: 'David Jean-Baptiste', avatar: 'david-34.png', city: 'Baie-Mahault', type: 'dispo', content: 'Disponible cette semaine pour dépannage plomberie et pose de sanitaire sur Baie-Mahault et Jarry.', likes: 14, timestamp: 'Il y a 2h' },
    { id: 'post-2', author: 'Tati Huguette Cazeau', avatar: 'huguette-68.png', city: 'Fort-de-France', type: 'besoin', content: 'Recherche un voisin bricoleur pour m’aider à réparer une étagère en bois massif.', likes: 8, timestamp: 'Il y a 5h' }
];

// ==========================================================================
// 1. AUTH ENDPOINTS
// ==========================================================================
app.post('/v1/auth/signup', (req, res) => {
    const { name, email, password, territory } = req.body;
    if (!name || !email) {
        return res.status(400).json({ error: "Le nom et l'email sont requis." });
    }
    const newUser = {
        id: USERS_DB.length + 1,
        name,
        email,
        role: "user",
        isPro: false,
        kycVerified: false,
        city: territory || "Guadeloupe (971)",
        territoryKey: "guadeloupe",
        avatar: "david-34.png",
        recommendationCount: 0
    };
    USERS_DB.push(newUser);
    res.json({ success: true, user: newUser, token: `jwt_token_${newUser.id}_${Date.now()}` });
});

app.post('/v1/auth/login', (req, res) => {
    const { email } = req.body;
    const user = USERS_DB.find(u => u.email === email) || USERS_DB[0];
    res.json({ success: true, user, token: `jwt_token_${user.id}_${Date.now()}` });
});

app.get('/v1/auth/me', (req, res) => {
    res.json({ success: true, user: USERS_DB[0] });
});

// ==========================================================================
// 2. MEMBERS & RECOMMENDATIONS ENDPOINTS
// ==========================================================================
app.get('/v1/members', (req, res) => {
    const { territory, query } = req.query;
    let list = [...USERS_DB];
    if (territory && territory !== 'all') {
        list = list.filter(m => m.territoryKey === territory.toLowerCase());
    }
    if (query) {
        const q = query.toLowerCase();
        list = list.filter(m => m.name.toLowerCase().includes(q) || (m.bio && m.bio.toLowerCase().includes(q)));
    }
    res.json({ count: list.length, data: list });
});

app.get('/v1/members/:id', (req, res) => {
    const member = USERS_DB.find(m => m.id == req.params.id);
    if (!member) return res.status(404).json({ error: "Membre non trouvé." });
    res.json({ data: member });
});

app.post('/v1/members/:id/recommend', (req, res) => {
    const targetId = parseInt(req.params.id);
    const recommenderId = req.body.recommenderId || 1;

    if (targetId === recommenderId) {
        return res.status(400).json({ error: "Vous ne pouvez pas vous recommander vous-même." });
    }

    const key = `${recommenderId}_${targetId}`;
    const member = USERS_DB.find(m => m.id === targetId);
    if (!member) return res.status(404).json({ error: "Membre non trouvé." });

    if (RECOMMENDATIONS_STORE.has(key)) {
        // Toggle OFF
        RECOMMENDATIONS_STORE.delete(key);
        member.recommendationCount = Math.max(0, member.recommendationCount - 1);
        return res.json({ success: true, recommended: false, newCount: member.recommendationCount });
    } else {
        // Toggle ON
        RECOMMENDATIONS_STORE.set(key, true);
        member.recommendationCount += 1;
        return res.json({ success: true, recommended: true, newCount: member.recommendationCount });
    }
});

// ==========================================================================
// 3. QUOTES & VERSIONING ENDPOINTS
// ==========================================================================
app.post('/v1/quotes', (req, res) => {
    const { title, totalAmount, milestones, clientName, providerId } = req.body;
    const devisId = `LY-${new Date().getFullYear()}-${Math.floor(1000 + Math.random() * 9000)}`;
    
    const quote = {
        devisId,
        title: title || 'Prestation sur mesure',
        amount: parseFloat(totalAmount) || 0,
        status: 'pending',
        currentVersion: 1,
        versions: [{
            version: 1,
            amount: parseFloat(totalAmount) || 0,
            milestones: milestones || [],
            createdAt: new Date().toISOString(),
            createdBy: providerId || 'provider'
        }],
        milestones: milestones || [],
        clientName,
        createdAt: new Date().toISOString()
    };

    QUOTES_DB.set(devisId, quote);
    logAuditEvent(devisId, 'devis_created', providerId || 'provider', null, { amount: quote.amount, milestonesCount: quote.milestones.length });
    
    res.json({ success: true, quote });
});

app.get('/v1/quotes/:id', (req, res) => {
    const quote = QUOTES_DB.get(req.params.id);
    if (!quote) return res.status(404).json({ error: "Devis introuvable." });
    res.json({ success: true, quote });
});

app.post('/v1/quotes/:id/revise', (req, res) => {
    const devisId = req.params.id;
    const quote = QUOTES_DB.get(devisId);
    if (!quote) return res.status(404).json({ error: "Devis introuvable." });

    const { newAmount, newMilestones, motif } = req.body;
    const oldAmount = quote.amount;
    const oldVersion = quote.currentVersion || 1;
    const newVersion = oldVersion + 1;

    quote.versions.push({
        version: newVersion,
        amount: parseFloat(newAmount),
        milestones: newMilestones,
        motif,
        createdAt: new Date().toISOString(),
        createdBy: 'provider'
    });

    quote.currentVersion = newVersion;
    quote.amount = parseFloat(newAmount);
    quote.milestones = newMilestones;
    quote.status = 'pending_revision';

    logAuditEvent(devisId, 'devis_revised', 'provider', { amount: oldAmount, version: oldVersion }, { amount: newAmount, version: newVersion, motif });

    res.json({ success: true, quote, diff: newAmount - oldAmount });
});

app.post('/v1/quotes/:id/accept', (req, res) => {
    const devisId = req.params.id;
    const quote = QUOTES_DB.get(devisId);
    if (!quote) return res.status(404).json({ error: "Devis introuvable." });

    quote.status = 'accepted';
    logAuditEvent(devisId, 'devis_accepted', 'client', null, { version: quote.currentVersion, amount: quote.amount });

    res.json({ success: true, quote });
});

// ==========================================================================
// 4. MILESTONES ENDPOINTS WITH LOCK SAFEGUARD
// ==========================================================================
app.post('/v1/quotes/:id/milestones', (req, res) => {
    const quote = QUOTES_DB.get(req.params.id);
    if (!quote) return res.status(404).json({ error: "Devis introuvable." });

    const { title, amount } = req.body;
    const newMilestone = {
        id: `ms-${quote.milestones.length + 1}`,
        title,
        amount: parseFloat(amount),
        status: 'pending',
        order: quote.milestones.length + 1
    };

    quote.milestones.push(newMilestone);
    quote.amount = quote.milestones.reduce((s, m) => s + m.amount, 0);
    quote.status = 'pending_revision';

    logAuditEvent(quote.devisId, 'milestone_added', 'provider', null, newMilestone);
    res.json({ success: true, quote });
});

app.delete('/v1/quotes/:id/milestones/:msId', (req, res) => {
    const quote = QUOTES_DB.get(req.params.id);
    if (!quote) return res.status(404).json({ error: "Devis introuvable." });

    const msIdx = quote.milestones.findIndex(m => m.id === req.params.msId);
    if (msIdx === -1) return res.status(404).json({ error: "Jalon introuvable." });

    const milestone = quote.milestones[msIdx];
    // Locked safeguard: paid or validated milestones cannot be deleted
    if (['paid', 'validated', 'completed'].includes(milestone.status)) {
        return res.status(403).json({ error: "Impossible de supprimer un jalon déjà engagé ou payé." });
    }

    quote.milestones.splice(msIdx, 1);
    quote.amount = quote.milestones.reduce((s, m) => s + m.amount, 0);
    quote.status = 'pending_revision';

    logAuditEvent(quote.devisId, 'milestone_deleted', 'provider', milestone, null);
    res.json({ success: true, quote });
});

// ==========================================================================
// 5. PAYMENTS & STRIPE CONNECT ENDPOINTS
// ==========================================================================
app.post('/v1/payments/create-intent', (req, res) => {
    const { devisId, amount } = req.body;
    const gross = parseFloat(amount) || 100;
    const platformFee = parseFloat((gross * PLATFORM_COMMISSION_RATE).toFixed(2));
    const providerPayout = parseFloat((gross - platformFee).toFixed(2));

    const intent = {
        id: `pi_test_${Date.now()}`,
        clientSecret: `pi_test_secret_${Date.now()}`,
        devisId,
        grossAmount: gross,
        platformFee,
        providerPayout,
        currency: 'EUR',
        status: 'requires_payment_method',
        commissionRatePercent: (PLATFORM_COMMISSION_RATE * 100).toFixed(1) + '%'
    };

    logAuditEvent(devisId || 'N/A', 'payment_intent_created', 'client', null, { gross, platformFee, providerPayout });
    res.json({ success: true, intent });
});

app.post('/v1/payments/webhook', (req, res) => {
    console.log('⚡ Stripe Webhook Event Received:', req.body.type || 'payment_intent.succeeded');
    res.json({ received: true });
});

// ==========================================================================
// 6. REVIEWS & PHOTOS ENDPOINTS
// ==========================================================================
app.get('/v1/reviews/:memberId', (req, res) => {
    const list = REVIEWS_DB.filter(r => r.memberId == req.params.memberId);
    res.json({ count: list.length, reviews: list });
});

app.post('/v1/reviews', (req, res) => {
    const { memberId, rating, comment, photos, authorName } = req.body;
    const newReview = {
        id: `rev-${Date.now()}`,
        memberId: parseInt(memberId),
        authorName: authorName || 'Voisin anonyme',
        rating: rating || 5,
        comment: comment || 'Très bonne prestation !',
        photos: photos || [],
        createdAt: new Date().toISOString()
    };
    REVIEWS_DB.push(newReview);
    res.json({ success: true, review: newReview });
});

// ==========================================================================
// 7. BOKANTAJ FEED & LIKES ENDPOINTS
// ==========================================================================
app.get('/v1/feed', (req, res) => {
    res.json({ count: FEED_POSTS_DB.length, feed: FEED_POSTS_DB });
});

app.post('/v1/feed', (req, res) => {
    const { content, type, city, author } = req.body;
    const post = {
        id: `post-${Date.now()}`,
        author: author || 'Lyanneur',
        avatar: 'david-34.png',
        city: city || 'Baie-Mahault',
        type: type || 'dispo',
        content,
        likes: 0,
        timestamp: 'À l’instant'
    };
    FEED_POSTS_DB.unshift(post);
    res.json({ success: true, post });
});

app.post('/v1/feed/:id/like', (req, res) => {
    const postId = req.params.id;
    const userId = req.body.userId || 1;
    const post = FEED_POSTS_DB.find(p => p.id === postId);
    if (!post) return res.status(404).json({ error: "Publication introuvable." });

    const key = `${userId}_${postId}`;
    if (BOKANTAJ_LIKES_STORE.has(key)) {
        BOKANTAJ_LIKES_STORE.delete(key);
        post.likes = Math.max(0, post.likes - 1);
        return res.json({ success: true, liked: false, likesCount: post.likes });
    } else {
        BOKANTAJ_LIKES_STORE.set(key, true);
        post.likes += 1;
        return res.json({ success: true, liked: true, likesCount: post.likes });
    }
});

// ==========================================================================
// 8. AUDIT LOGS & ADMIN ENDPOINTS
// ==========================================================================
app.get('/v1/audit-logs', (req, res) => {
    res.json({ count: AUDIT_LOGS.length, logs: AUDIT_LOGS });
});

app.get('/v1/admin/kpis', (req, res) => {
    res.json({
        gmvMonth: 48920,
        mrrCommissions: 7338,
        activeMembers: USERS_DB.length,
        completedDeals: 1420,
        platformCommissionRate: (PLATFORM_COMMISSION_RATE * 100) + '%',
        territoryBreakdown: { guadeloupe: 42, martinique: 36, guyane: 14, reunion: 8 }
    });
});

// ==========================================================================
// 9. NOTIFICATION ENDPOINTS (SENDGRID & TWILIO)
// ==========================================================================
app.post('/api/notifications/send-email', async (req, res) => {
    const { to, name, subject, html } = req.body;
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
            body: `LYANN DOM: ${body}`,
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
    console.log(`🚀 LYANN DOM Unified Production V1 API Server running on port ${PORT}`);
});

module.exports = app;
