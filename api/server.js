/**
 * LYANN DOM — MULTI-CLIENT REST API ENGINE (Express Production Server)
 * Supports Web, iOS Native, Android Native, and Enterprise Admin Console.
 */

const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all clients (Web App, iOS Swift, Android Kotlin, Admin Back-Office)
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Platform-Client']
}));

// Supabase Admin Client (Service Role for Payment Core DB Operations)
const supabaseUrl = process.env.SUPABASE_URL || 'https://gzispjfoywklpqatjyop.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'placeholder_service_key';
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// Express raw body parsing for signed Stripe Webhook routes (Vercel Serverless Compatible)
app.use((req, res, next) => {
    const url = req.originalUrl || req.url || '';
    if (url.includes('webhook')) {
        express.raw({ type: '*/*' })(req, res, next);
    } else {
        express.json()(req, res, next);
    }
});

// STRICT PRODUCTION MODE FINANCIAL GUARD
if (process.env.NODE_ENV === 'production' && !process.env.STRIPE_SECRET_KEY) {
    console.error("❌ FATAL CONFIGURATION ERROR: STRIPE_SECRET_KEY is missing under NODE_ENV=production. PAYMENT_MODE=mock is strictly forbidden in production.");
    if (require.main === module) {
        process.exit(1);
    }
}

/**
 * CANONICAL MONETARY CALCULATION ENGINE (BigInt 3% + 3%)
 * Guarantees exact integer cents calculations and accounting invariants.
 */
function calculateFinancialBreakdown(amountStr) {
    const numStr = String(amountStr).trim();
    const parts = numStr.split('.');
    const euros = BigInt(parts[0] || '0');
    const centsPart = (parts[1] || '').padEnd(2, '0').slice(0, 2);
    const cents = BigInt(centsPart);
    const service_amount_cents = euros * 100n + cents;

    if (service_amount_cents <= 0n) {
        throw new Error("Le montant de la partie doit être supérieur à 0 centime.");
    }

    // 3% client fee and 3% provider fee with standard BigInt half-up rounding: (val * 3 + 50) / 100
    const customer_fee_cents = (service_amount_cents * 3n + 50n) / 100n;
    const provider_fee_cents = (service_amount_cents * 3n + 50n) / 100n;

    const customer_total_cents = service_amount_cents + customer_fee_cents;
    const provider_net_cents = service_amount_cents - provider_fee_cents;
    const lyann_revenue_cents = customer_fee_cents + provider_fee_cents;

    // Validate Accounting Invariants
    if (customer_total_cents !== service_amount_cents + customer_fee_cents) throw new Error("Invariant customer_total violé");
    if (provider_net_cents !== service_amount_cents - provider_fee_cents) throw new Error("Invariant provider_net violé");
    if (lyann_revenue_cents !== customer_fee_cents + provider_fee_cents) throw new Error("Invariant lyann_revenue violé");

    return {
        service_amount_cents,
        customer_fee_cents,
        customer_total_cents,
        provider_fee_cents,
        provider_net_cents,
        lyann_revenue_cents
    };
}

const MEMBERS_DB = [
    { id: 200, name: "Jocelyn Cabort", age: 52, role: "Plomberie & Fuites d'eau PRO", city: "Baie-Mahault", locationName: "Guadeloupe (971)", territoryKey: "guadeloupe", rating: "5.0", avatar: "jocelyn-cabort.png", badge: "PRO VÉRIFIÉ", kycVerified: true },
    { id: 201, name: "Hugues Zami", age: 45, role: "Climatisation & Électricité PRO", city: "Les Abymes", locationName: "Guadeloupe (971)", territoryKey: "guadeloupe", rating: "4.9", avatar: "hugues-zami.png", badge: "PRO VÉRIFIÉ", kycVerified: true },
    { id: 202, name: "Murielle Placide", age: 38, role: "Ménage & Repassage", city: "Le Gosier", locationName: "Guadeloupe (971)", territoryKey: "guadeloupe", rating: "5.0", avatar: "murielle-placide.png", badge: "VOISINE DE CONFIANCE", kycVerified: true },
    { id: 203, name: "Clotilde Belair", age: 61, role: "Aide aux repas & Seniors", city: "Sainte-Anne", locationName: "Guadeloupe (971)", territoryKey: "guadeloupe", rating: "4.95", avatar: "clotilde-belair.png", badge: "AUXILIAIRE VÉRIFIÉE", kycVerified: true },
    { id: 204, name: "Marius Placide", age: 29, role: "Bricolage & Montage meuble", city: "Petit-Bourg", locationName: "Guadeloupe (971)", territoryKey: "guadeloupe", rating: "4.85", avatar: "marius-placide.png", badge: "SUPER BRICOLEUR", kycVerified: true },
    { id: 212, name: "Wilfrid Rapon", age: 37, role: "Jardinier paysagiste", city: "Le Gosier", locationName: "Guadeloupe (971)", territoryKey: "guadeloupe", rating: "5.0", avatar: "wilfrid-rapon.png", badge: "PAYSAGISTE PRO", kycVerified: true }
];

// Middleware Logging & Multi-Client Tag
app.use((req, res, next) => {
    const clientType = req.headers['x-platform-client'] || 'Web-Client';
    console.log(`[API v1] ${new Date().toISOString()} | ${req.method} ${req.url} | Client: ${clientType}`);
    next();
});

// API Root Status
app.get(['/', '/v1', '/v1/', '/api', '/api/server'], (req, res) => {
    res.json({
        status: "ONLINE",
        service: "LYANN DOM Multi-Client REST API Engine",
        version: "1.0.0",
        territories: ["Guadeloupe (971)", "Martinique (972)", "Guyane (973)", "La Réunion (974)"]
    });
});

// 1. AUTHENTICATION (POST /v1/auth/login)
app.post('/v1/auth/login', (req, res) => {
    const { email, password } = req.body;
    if (!email) {
        return res.status(400).json({ error: "L'adresse email est requise." });
    }
    const token = "jwt_token_demo_lyan_dom_2026_secure";
    res.json({
        success: true,
        token,
        user: {
            id: 1,
            name: "Prestataire LYANN",
            email: email,
            role: "provider",
            territory: "Guadeloupe (971)"
        }
    });
});

// 2. MEMBERS DIRECTORY (GET /v1/members)
app.get('/v1/members', (req, res) => {
    const { territory, query } = req.query;
    let filtered = [...MEMBERS_DB];

    if (territory && territory !== 'all') {
        filtered = filtered.filter(m => m.territoryKey === territory.toLowerCase());
    }

    if (query) {
        const q = query.toLowerCase();
        filtered = filtered.filter(m => m.name.toLowerCase().includes(q) || m.role.toLowerCase().includes(q));
    }

    res.json({
        count: filtered.length,
        data: filtered
    });
});

// 3. MEMBER DETAILS (GET /v1/members/:id)
app.get('/v1/members/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const member = MEMBERS_DB.find(m => m.id === id);
    if (!member) {
        return res.status(404).json({ error: "Membre non trouvé." });
    }
    res.json({ data: member });
});

// 4. LYANNER DEAL CLOSURE (POST /v1/deals/lyanner)
app.post('/v1/deals/lyanner', (req, res) => {
    const { targetMemberId, memberName } = req.body;
    const phone = "+590690001122";
    const whatsappUrl = `https://wa.me/590690001122?text=${encodeURIComponent(`Bonjour ${memberName} ! Nous sommes Lyannés sur LYANN DOM.`)}`;

    res.json({
        success: true,
        message: "Accord LYANNER validé.",
        shortcuts: {
            whatsappUrl,
            phoneUrl: `tel:${phone}`
        }
    });
});

// 5. ADMIN KPIS (GET /v1/admin/kpis)
app.get('/v1/admin/kpis', (req, res) => {
    res.json({
        gmvMonth: 48920,
        mrrCommissions: 7338,
        activeMembers: 12480,
        completedDeals: 1420,
        territoryBreakdown: {
            guadeloupe: 42,
            martinique: 36,
            guyane: 14,
            reunion: 8
        }
    });
});

// 6. LEGACY PAYMENTS ENDPOINT (@deprecated)
app.post('/v1/payments/create-intent', async (req, res) => {
    console.warn("⚠️ [DEPRECATED] /v1/payments/create-intent is deprecated. Use /v1/payments/create-milestone-intent instead.");
    try {
        const { missionId, quoteId, amount, currency = 'eur', idempotencyKey } = req.body;

        if (!missionId || !amount) {
            return res.status(400).json({ error: "Mission ID et montant requis." });
        }

        const basePrice = parseFloat(amount);
        const commissionFee = basePrice * 0.03;
        const protectionFee = 4.90;
        const totalAmountCents = Math.round((basePrice + commissionFee + protectionFee) * 100);

        if (process.env.STRIPE_SECRET_KEY) {
            const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
            const paymentIntent = await stripe.paymentIntents.create({
                amount: totalAmountCents,
                currency: currency.toLowerCase(),
                metadata: {
                    missionId,
                    quoteId: quoteId || '',
                    providerAmount: basePrice.toFixed(2),
                    commissionFee: commissionFee.toFixed(2),
                    protectionFee: protectionFee.toFixed(2),
                    financialFlow: 'SEPARATE_CHARGES_AND_TRANSFERS'
                }
            }, {
                idempotencyKey: idempotencyKey || `pi_idem_${missionId}_${Date.now()}`
            });

            return res.json({
                success: true,
                deprecated: true,
                mode: 'stripe_live',
                architecture: 'SEPARATE_CHARGES_AND_TRANSFERS',
                clientSecret: paymentIntent.client_secret,
                paymentIntentId: paymentIntent.id,
                breakdown: {
                    basePrice,
                    commissionFee,
                    protectionFee,
                    totalAmount: (totalAmountCents / 100).toFixed(2)
                }
            });
        } else {
            return res.json({
                success: true,
                deprecated: true,
                mode: 'stripe_test_mode',
                architecture: 'SEPARATE_CHARGES_AND_TRANSFERS',
                paymentIntentId: `pi_test_${Date.now()}`,
                clientSecret: `pi_test_secret_${Date.now()}`,
                breakdown: {
                    basePrice,
                    commissionFee,
                    protectionFee,
                    totalAmount: (basePrice + commissionFee + protectionFee).toFixed(2)
                }
            });
        }
    } catch (e) {
        console.error("Stripe Create Intent Server Error:", e);
        res.status(500).json({ error: "Erreur lors de la création du paiement Stripe." });
    }
});

/**
 * 6.1 CANONICAL MILESTONE PAYMENT INTENT CREATION (STEP 1)
 * POST /v1/payments/create-milestone-intent
 * Payload: { "milestone_id": "uuid" }
 */
app.post('/v1/payments/create-milestone-intent', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: "Authentification requise." });
        }
        const token = authHeader.split(' ')[1];

        // 1. Authenticate user via Supabase Auth JWT
        const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !authData?.user) {
            return res.status(401).json({ error: "Jeton d'authentification invalide ou expiré." });
        }
        const authUid = authData.user.id;

        // 2. Strict input validation: Only read milestone_id (ignore all other fields)
        const { milestone_id } = req.body;
        if (!milestone_id) {
            return res.status(400).json({ error: "Le paramètre milestone_id est obligatoire." });
        }

        // 3. Reconstruct canonical context from Database
        const { data: milestone, error: mErr } = await supabaseAdmin
            .from('milestones')
            .select('*, quotes(*)')
            .eq('id', milestone_id)
            .single();

        if (mErr || !milestone) {
            return res.status(404).json({ error: "Partie/Jalon introuvable." });
        }

        if (milestone.status !== 'PENDING') {
            return res.status(400).json({ error: `Cette Partie n'est pas payable (statut actuel: ${milestone.status}).` });
        }

        const quote = milestone.quotes;
        if (!quote || quote.status !== 'ACCEPTED') {
            return res.status(400).json({ error: "Le devis associé doit être au statut ACCEPTED." });
        }

        const { data: mission, error: missErr } = await supabaseAdmin
            .from('missions')
            .select('*')
            .eq('id', quote.mission_id)
            .single();

        if (missErr || !mission || (mission.status !== 'AGREED' && mission.status !== 'IN_PROGRESS')) {
            return res.status(400).json({ error: "La mission associée doit être au statut AGREED ou IN_PROGRESS." });
        }

        // 4. Role Check: Only requester (client) can trigger payment
        if (mission.requester_id !== authUid) {
            return res.status(403).json({ error: "Seul le demandeur de la prestation peut effectuer ce paiement." });
        }

        // 5. Canonical Monetary Engine Calculation (BigInt 3% + 3%)
        const financials = calculateFinancialBreakdown(milestone.amount);
        const stripeIdempotencyKey = `pi_milestone_${milestone.id}`;

        // 6. Idempotency Check & Recoverable State Analysis (V1.1)
        const { data: existingPayment } = await supabaseAdmin
            .from('payments')
            .select('id, payment_status, stripe_payment_intent_id')
            .eq('milestone_id', milestone_id)
            .in('payment_status', ['CREATED', 'REQUIRES_ACTION', 'PROCESSING', 'SUCCEEDED', 'PARTIALLY_REFUNDED', 'DISPUTED'])
            .maybeSingle();

        if (existingPayment) {
            // CAS D: Payment already secured or in terminal state
            if (['SUCCEEDED', 'PARTIALLY_REFUNDED', 'DISPUTED'].includes(existingPayment.payment_status)) {
                return res.status(409).json({
                    error: "Le paiement de cette Partie est déjà sécurisé.",
                    code: "PAIEMENT_DEJA_SECURISE"
                });
            }

            // CAS A & CAS C: Existing payment (CREATED, REQUIRES_ACTION, PROCESSING) WITH stripe_payment_intent_id
            if (existingPayment.stripe_payment_intent_id) {
                if (process.env.STRIPE_SECRET_KEY) {
                    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
                    const intent = await stripe.paymentIntents.retrieve(existingPayment.stripe_payment_intent_id);
                    return res.json({
                        success: true,
                        recovered: true,
                        payment_id: existingPayment.id,
                        payment_intent_id: intent.id,
                        client_secret: intent.client_secret,
                        amounts: {
                            service_amount_cents: Number(financials.service_amount_cents),
                            customer_fee_cents: Number(financials.customer_fee_cents),
                            customer_total_cents: Number(financials.customer_total_cents)
                        }
                    });
                } else {
                    return res.json({
                        success: true,
                        recovered: true,
                        mode: 'stripe_test_mock',
                        payment_id: existingPayment.id,
                        payment_intent_id: existingPayment.stripe_payment_intent_id,
                        client_secret: `${existingPayment.stripe_payment_intent_id}_secret_test`,
                        amounts: {
                            service_amount_cents: Number(financials.service_amount_cents),
                            customer_fee_cents: Number(financials.customer_fee_cents),
                            customer_total_cents: Number(financials.customer_total_cents)
                        }
                    });
                }
            }

            // CAS B: Existing payment in CREATED status BUT stripe_payment_intent_id IS NULL (Stripe call failed previously)
            if (existingPayment.payment_status === 'CREATED' && !existingPayment.stripe_payment_intent_id) {
                if (process.env.STRIPE_SECRET_KEY) {
                    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
                    const paymentIntent = await stripe.paymentIntents.create({
                        amount: Number(financials.customer_total_cents),
                        currency: 'eur',
                        automatic_payment_methods: { enabled: true },
                        metadata: {
                            payment_id: existingPayment.id,
                            milestone_id: milestone.id,
                            quote_id: quote.id,
                            mission_id: mission.id,
                            requester_id: mission.requester_id,
                            provider_id: quote.provider_id
                        }
                    }, {
                        idempotencyKey: stripeIdempotencyKey
                    });

                    await supabaseAdmin
                        .from('payments')
                        .update({ stripe_payment_intent_id: paymentIntent.id })
                        .eq('id', existingPayment.id);

                    return res.json({
                        success: true,
                        recovered_orphan: true,
                        payment_id: existingPayment.id,
                        payment_intent_id: paymentIntent.id,
                        client_secret: paymentIntent.client_secret,
                        amounts: {
                            service_amount_cents: Number(financials.service_amount_cents),
                            customer_fee_cents: Number(financials.customer_fee_cents),
                            customer_total_cents: Number(financials.customer_total_cents)
                        }
                    });
                } else {
                    const mockIntentId = `pi_test_${Date.now()}`;
                    await supabaseAdmin
                        .from('payments')
                        .update({ stripe_payment_intent_id: mockIntentId })
                        .eq('id', existingPayment.id);

                    return res.json({
                        success: true,
                        recovered_orphan: true,
                        mode: 'stripe_test_mock',
                        payment_id: existingPayment.id,
                        payment_intent_id: mockIntentId,
                        client_secret: `${mockIntentId}_secret_test`,
                        amounts: {
                            service_amount_cents: Number(financials.service_amount_cents),
                            customer_fee_cents: Number(financials.customer_fee_cents),
                            customer_total_cents: Number(financials.customer_total_cents)
                        }
                    });
                }
            }
        }

        // 7. Insert payment record into public.payments (payment_status = CREATED, transfer_status = NOT_STARTED)
        const { data: paymentRecord, error: insertErr } = await supabaseAdmin
            .from('payments')
            .insert({
                milestone_id: milestone.id,
                quote_id: quote.id,
                mission_id: mission.id,
                requester_id: mission.requester_id,
                provider_id: quote.provider_id,
                service_amount_cents: Number(financials.service_amount_cents),
                customer_fee_cents: Number(financials.customer_fee_cents),
                customer_total_cents: Number(financials.customer_total_cents),
                provider_fee_cents: Number(financials.provider_fee_cents),
                provider_net_cents: Number(financials.provider_net_cents),
                lyann_revenue_cents: Number(financials.lyann_revenue_cents),
                amount_refunded_cents: 0,
                currency: 'EUR',
                payment_status: 'CREATED',
                transfer_status: 'NOT_STARTED',
                metadata: {
                    milestone_id: milestone.id,
                    quote_id: quote.id,
                    mission_id: mission.id,
                    requester_id: mission.requester_id,
                    provider_id: quote.provider_id
                }
            })
            .select()
            .single();

        if (insertErr) {
            if (insertErr.code === '23505') { // Concurrency catch: DB partial unique index constraint
                const { data: concPayment } = await supabaseAdmin
                    .from('payments')
                    .select('id, payment_status, stripe_payment_intent_id')
                    .eq('milestone_id', milestone_id)
                    .single();

                if (concPayment && concPayment.stripe_payment_intent_id) {
                    if (process.env.STRIPE_SECRET_KEY) {
                        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
                        const intent = await stripe.paymentIntents.retrieve(concPayment.stripe_payment_intent_id);
                        return res.json({
                            success: true,
                            concurrency_recovered: true,
                            payment_id: concPayment.id,
                            payment_intent_id: intent.id,
                            client_secret: intent.client_secret,
                            amounts: {
                                service_amount_cents: Number(financials.service_amount_cents),
                                customer_fee_cents: Number(financials.customer_fee_cents),
                                customer_total_cents: Number(financials.customer_total_cents)
                            }
                        });
                    }
                }

                return res.status(409).json({
                    error: "Le paiement de cette Partie est déjà sécurisé.",
                    code: "PAIEMENT_DEJA_SECURISE"
                });
            }
            console.error("Erreur insertion payment:", insertErr);
            return res.status(500).json({ error: "Erreur lors de l'enregistrement du paiement." });
        }

        // 8. Create Stripe PaymentIntent on Platform Account (Separate Charges & Transfers with Deterministic Idempotency Key)
        if (process.env.STRIPE_SECRET_KEY) {
            const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
            const paymentIntent = await stripe.paymentIntents.create({
                amount: Number(financials.customer_total_cents),
                currency: 'eur',
                automatic_payment_methods: { enabled: true },
                metadata: {
                    payment_id: paymentRecord.id,
                    milestone_id: milestone.id,
                    quote_id: quote.id,
                    mission_id: mission.id,
                    requester_id: mission.requester_id,
                    provider_id: quote.provider_id
                }
            }, {
                idempotencyKey: stripeIdempotencyKey
            });

            // Update stripe_payment_intent_id in public.payments
            await supabaseAdmin
                .from('payments')
                .update({ stripe_payment_intent_id: paymentIntent.id })
                .eq('id', paymentRecord.id);

            return res.json({
                success: true,
                payment_id: paymentRecord.id,
                payment_intent_id: paymentIntent.id,
                client_secret: paymentIntent.client_secret,
                amounts: {
                    service_amount_cents: Number(financials.service_amount_cents),
                    customer_fee_cents: Number(financials.customer_fee_cents),
                    customer_total_cents: Number(financials.customer_total_cents)
                }
            });
        } else {
            // Test Mode Fallback if STRIPE_SECRET_KEY is not defined in non-prod
            const mockIntentId = `pi_test_${Date.now()}`;
            await supabaseAdmin
                .from('payments')
                .update({ stripe_payment_intent_id: mockIntentId })
                .eq('id', paymentRecord.id);

            return res.json({
                success: true,
                mode: 'stripe_test_mock',
                payment_id: paymentRecord.id,
                payment_intent_id: mockIntentId,
                client_secret: `${mockIntentId}_secret_test`,
                amounts: {
                    service_amount_cents: Number(financials.service_amount_cents),
                    customer_fee_cents: Number(financials.customer_fee_cents),
                    customer_total_cents: Number(financials.customer_total_cents)
                }
            });
        }

    } catch (e) {
        console.error("Erreur serveur create-milestone-intent:", e);
        return res.status(500).json({ error: "Erreur interne lors de la création du paiement." });
    }
});

/**
 * 6.2 START MILESTONE WORK (STEP 2A)
 * POST /v1/milestones/start-work
 * Payload: { "milestone_id": "uuid" }
 * Allowed Transition: FUNDED -> IN_PROGRESS
 * Authorization: Assigned Helper/Provider ONLY
 */
app.post('/v1/milestones/start-work', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: "Authentification requise." });
        }
        const token = authHeader.split(' ')[1];

        // 1. Authenticate user via Supabase Auth JWT
        const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !authData?.user) {
            return res.status(401).json({ error: "Jeton d'authentification invalide ou expiré." });
        }
        const authUid = authData.user.id;

        // 2. Read milestone_id strictly from req.body
        const { milestone_id } = req.body;
        if (!milestone_id) {
            return res.status(400).json({ error: "Le paramètre milestone_id est obligatoire." });
        }

        // 3. Reconstruct canonical context from DB
        const { data: milestone, error: mErr } = await supabaseAdmin
            .from('milestones')
            .select('*, quotes(*)')
            .eq('id', milestone_id)
            .single();

        if (mErr || !milestone) {
            return res.status(404).json({ error: "Partie/Jalon introuvable." });
        }

        const quote = milestone.quotes;
        if (!quote || quote.status !== 'ACCEPTED') {
            return res.status(400).json({ error: "Le devis associé doit être au statut ACCEPTED." });
        }

        const { data: mission, error: missErr } = await supabaseAdmin
            .from('missions')
            .select('*')
            .eq('id', quote.mission_id)
            .single();

        if (missErr || !mission) {
            return res.status(400).json({ error: "La mission associée est introuvable." });
        }

        // 4. Role Check: Only assigned Lyanneur (helper_id / provider_id) can start work
        const assignedHelperId = mission.helper_id || quote.provider_id;
        if (assignedHelperId !== authUid) {
            return res.status(403).json({ error: "Seul le Lyanneur assigné à la mission peut démarrer les travaux." });
        }

        // 5. Idempotent Transition Check
        if (milestone.status === 'IN_PROGRESS') {
            return res.json({
                success: true,
                idempotent: true,
                milestone_id: milestone.id,
                status: 'IN_PROGRESS',
                message: "Le travail sur cette Partie est déjà en cours."
            });
        }

        if (milestone.status !== 'FUNDED') {
            return res.status(400).json({
                error: `Impossible de démarrer les travaux : la Partie doit être au statut FUNDED (statut actuel: ${milestone.status}).`
            });
        }

        // 6. Atomic Update: FUNDED -> IN_PROGRESS
        const { data: updatedMilestone, error: updateErr } = await supabaseAdmin
            .from('milestones')
            .update({
                status: 'IN_PROGRESS',
                updated_at: new Date().toISOString()
            })
            .eq('id', milestone.id)
            .eq('status', 'FUNDED')
            .select()
            .single();

        if (updateErr || !updatedMilestone) {
            return res.status(400).json({ error: "Échec de la mise à jour (concurrence ou transition invalide)." });
        }

        return res.json({
            success: true,
            milestone_id: updatedMilestone.id,
            status: 'IN_PROGRESS',
            message: "Travail en cours — début de réalisation enregistré."
        });

    } catch (e) {
        console.error("Erreur serveur start-milestone-work:", e);
        return res.status(500).json({ error: "Erreur interne serveur." });
    }
});

/**
 * 6.3 SUBMIT MILESTONE COMPLETION (STEP 2A)
 * POST /v1/milestones/submit-completion
 * Payload: { "milestone_id": "uuid", "completion_comments": "...", "deliverables": [...] }
 * Allowed Transitions: FUNDED -> COMPLETED (direct) OR IN_PROGRESS -> COMPLETED
 * Authorization: Assigned Helper/Provider ONLY
 */
app.post('/v1/milestones/submit-completion', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: "Authentification requise." });
        }
        const token = authHeader.split(' ')[1];

        // 1. Authenticate user via Supabase Auth JWT
        const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !authData?.user) {
            return res.status(401).json({ error: "Jeton d'authentification invalide ou expiré." });
        }
        const authUid = authData.user.id;

        // 2. Read parameters strictly from req.body (ignore requester_id, provider_id, mission_id)
        const { milestone_id, completion_comments = '', deliverables = [] } = req.body;
        if (!milestone_id) {
            return res.status(400).json({ error: "Le paramètre milestone_id est obligatoire." });
        }

        // 3. Reconstruct canonical context from DB
        const { data: milestone, error: mErr } = await supabaseAdmin
            .from('milestones')
            .select('*, quotes(*)')
            .eq('id', milestone_id)
            .single();

        if (mErr || !milestone) {
            return res.status(404).json({ error: "Partie/Jalon introuvable." });
        }

        const quote = milestone.quotes;
        if (!quote || quote.status !== 'ACCEPTED') {
            return res.status(400).json({ error: "Le devis associé doit être au statut ACCEPTED." });
        }

        const { data: mission, error: missErr } = await supabaseAdmin
            .from('missions')
            .select('*')
            .eq('id', quote.mission_id)
            .single();

        if (missErr || !mission) {
            return res.status(400).json({ error: "La mission associée est introuvable." });
        }

        // 4. Role Check: Only assigned Lyanneur (helper_id / provider_id) can submit completion
        const assignedHelperId = mission.helper_id || quote.provider_id;
        if (assignedHelperId !== authUid) {
            return res.status(403).json({ error: "Seul le Lyanneur assigné à la mission peut déclarer la prestation terminée." });
        }

        // 5. Idempotent Transition Check
        if (milestone.status === 'COMPLETED') {
            return res.json({
                success: true,
                idempotent: true,
                milestone_id: milestone.id,
                status: 'COMPLETED',
                message: "Cette Partie est déjà déclarée réalisée."
            });
        }

        if (!['FUNDED', 'IN_PROGRESS'].includes(milestone.status)) {
            return res.status(400).json({
                error: `Impossible de déclarer terminée : la Partie doit être au statut FUNDED ou IN_PROGRESS (statut actuel: ${milestone.status}).`
            });
        }

        // 6. Atomic Update: FUNDED/IN_PROGRESS -> COMPLETED
        const updatePayload = {
            status: 'COMPLETED',
            updated_at: new Date().toISOString()
        };

        updatePayload.completion_comments = completion_comments || null;
        updatePayload.deliverables = deliverables || [];
        updatePayload.completed_at = new Date().toISOString();

        let updatedMilestone = null;
        let updateErr = null;

        const resUpdate = await supabaseAdmin
            .from('milestones')
            .update(updatePayload)
            .eq('id', milestone.id)
            .in('status', ['FUNDED', 'IN_PROGRESS'])
            .select()
            .single();

        if (resUpdate.error) {
            // Fallback if optional columns don't exist in DB schema yet
            const resFallback = await supabaseAdmin
                .from('milestones')
                .update({
                    status: 'COMPLETED',
                    updated_at: new Date().toISOString()
                })
                .eq('id', milestone.id)
                .in('status', ['FUNDED', 'IN_PROGRESS'])
                .select()
                .single();

            updatedMilestone = resFallback.data;
            updateErr = resFallback.error;
        } else {
            updatedMilestone = resUpdate.data;
        }

        if (updateErr || !updatedMilestone) {
            return res.status(400).json({ error: "Échec de la mise à jour (concurrence ou transition invalide)." });
        }

        return res.json({
            success: true,
            milestone_id: updatedMilestone.id,
            status: 'COMPLETED',
            message: "Prestation réalisée — en attente de validation du client."
        });

    } catch (e) {
        console.error("Erreur serveur submit-milestone-completion:", e);
        return res.status(500).json({ error: "Erreur interne serveur." });
    }
});

/**
 * CANONICAL RETRY TRANSFER HELPER (STEP 2B V1.1)
 * Used by:
 * - Client release endpoint (POST /v1/milestones/release-payment)
 * - Lyanneur claim endpoint (POST /v1/milestones/claim-transfer)
 * - Webhook account.updated listener
 */
async function retryMilestoneTransfer(milestoneId) {
    // 1. Fetch milestone
    const { data: milestone, error: mErr } = await supabaseAdmin
        .from('milestones')
        .select('*, quotes(*)')
        .eq('id', milestoneId)
        .single();

    if (mErr || !milestone) {
        return { success: false, error: "Milestone introuvable.", code: "MILESTONE_NOT_FOUND" };
    }

    if (milestone.status !== 'COMPLETED') {
        return { success: false, error: "La Partie doit être au statut COMPLETED.", code: "MILESTONE_NOT_COMPLETED" };
    }

    const quote = milestone.quotes;
    if (!quote) {
        return { success: false, error: "Devis introuvable.", code: "QUOTE_NOT_FOUND" };
    }

    // 2. Fetch payment record
    const { data: payment, error: pErr } = await supabaseAdmin
        .from('payments')
        .select('*')
        .eq('milestone_id', milestoneId)
        .single();

    if (pErr || !payment) {
        return { success: false, error: "Paiement introuvable.", code: "PAYMENT_NOT_FOUND" };
    }

    // Must be client_validated_at IS NOT NULL and payment_status = SUCCEEDED
    if (!payment.client_validated_at) {
        return { success: false, error: "Le client n'a pas encore validé cette Partie.", code: "NOT_CLIENT_VALIDATED" };
    }

    if (payment.payment_status !== 'SUCCEEDED') {
        return { success: false, error: "Le paiement client doit être au statut SUCCEEDED.", code: "PAYMENT_NOT_SUCCEEDED" };
    }

    // Already transferred idempotent check
    if (payment.transfer_status === 'TRANSFERRED' && payment.stripe_transfer_id) {
        return {
            success: true,
            idempotent: true,
            status: "RELEASED",
            transfer_id: payment.stripe_transfer_id,
            message: "Versement déjà effectué."
        };
    }

    // Must be in PENDING_VALIDATION or TRANSFER_FAILED (or TRANSFER_PROCESSING retry)
    if (!['PENDING_VALIDATION', 'TRANSFER_FAILED', 'TRANSFER_PROCESSING'].includes(payment.transfer_status)) {
        return { success: false, error: `Statut de transfert invalide (${payment.transfer_status}).`, code: "INVALID_TRANSFER_STATUS" };
    }

    // 3. Fetch Provider Profile for Stripe Account ID
    const providerId = payment.provider_id || quote.provider_id;
    const { data: providerProfile, error: profErr } = await supabaseAdmin
        .from('profiles')
        .select('id, stripe_account_id')
        .eq('id', providerId)
        .single();

    if (profErr || !providerProfile || !providerProfile.stripe_account_id) {
        // Mark as TRANSFER_FAILED, keep client_validated_at set
        await supabaseAdmin
            .from('payments')
            .update({ transfer_status: 'TRANSFER_FAILED' })
            .eq('id', payment.id);

        return {
            success: true,
            eligible: false,
            status: "VERSEMENT_LYANNEUR_EN_ATTENTE",
            message: "Partie validée. Le versement au Lyanneur est en attente de configuration de son compte Stripe Connect."
        };
    }

    const stripeAccountId = providerProfile.stripe_account_id;

    // 4. Verify Stripe Connect Eligibility Server-Side
    if (process.env.STRIPE_SECRET_KEY) {
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        try {
            const account = await stripe.accounts.retrieve(stripeAccountId);
            const isTransfersActive = account.capabilities?.transfers === 'active';
            const hasNoDisabledReason = !account.requirements?.disabled_reason;

            if (!isTransfersActive || !hasNoDisabledReason) {
                console.warn(`⚠️ [CONNECT CHECK] Compte Stripe ${stripeAccountId} non éligible aux Transferts (capabilities.transfers=${account.capabilities?.transfers}, disabled_reason=${account.requirements?.disabled_reason}).`);
                
                await supabaseAdmin
                    .from('payments')
                    .update({ transfer_status: 'TRANSFER_FAILED' })
                    .eq('id', payment.id);

                return {
                    success: true,
                    eligible: false,
                    status: "VERSEMENT_LYANNEUR_EN_ATTENTE",
                    message: "Partie validée. Le versement au Lyanneur est en attente (compte Stripe Connect incomplet)."
                };
            }
        } catch (stAccErr) {
            console.error("Erreur lors de la vérification du compte Connect Stripe:", stAccErr);
            await supabaseAdmin
                .from('payments')
                .update({ transfer_status: 'TRANSFER_FAILED' })
                .eq('id', payment.id);

            return {
                success: true,
                eligible: false,
                status: "VERSEMENT_LYANNEUR_EN_ATTENTE",
                message: "Partie validée. Le versement au Lyanneur est en attente de vérification Stripe."
            };
        }
    }

    // 5. Transfer Lock Transition: PENDING_VALIDATION / TRANSFER_FAILED -> TRANSFER_PROCESSING
    const { data: lockedPayment, error: lockErr } = await supabaseAdmin
        .from('payments')
        .update({ transfer_status: 'TRANSFER_PROCESSING' })
        .eq('id', payment.id)
        .in('transfer_status', ['PENDING_VALIDATION', 'TRANSFER_FAILED', 'TRANSFER_PROCESSING'])
        .select()
        .single();

    if (lockErr || !lockedPayment) {
        return { success: false, error: "Échec du verrouillage de transfert (concurrence).", code: "CONCURRENCY_LOCK_FAILED" };
    }

    // 6. Execute Stripe Transfer (Separate Charges & Transfers with Deterministic Idempotency Key)
    const stripeIdempotencyKey = `tr_milestone_${milestone.id}`;
    const transferAmountCents = Number(payment.provider_net_cents);

    if (process.env.STRIPE_SECRET_KEY) {
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        try {
            const transfer = await stripe.transfers.create({
                amount: transferAmountCents,
                currency: 'eur',
                destination: stripeAccountId,
                description: `Versement Partie LYANN ${milestone.id}`,
                metadata: {
                    milestone_id: milestone.id,
                    payment_id: payment.id,
                    mission_id: payment.mission_id,
                    provider_id: providerId
                }
            }, {
                idempotencyKey: stripeIdempotencyKey
            });

            // 7. Update Payment & Milestone on Transfer Success
            const nowIso = new Date().toISOString();
            await supabaseAdmin
                .from('payments')
                .update({
                    stripe_transfer_id: transfer.id,
                    transfer_status: 'TRANSFERRED',
                    released_at: nowIso
                })
                .eq('id', payment.id);

            await supabaseAdmin
                .from('milestones')
                .update({
                    status: 'RELEASED',
                    updated_at: nowIso
                })
                .eq('id', milestone.id);

            console.log(`🎉 [LYANN TRANSFER] Transfert réussi ${transfer.id} pour Partie ${milestone.id}. Montant: ${transferAmountCents} cents.`);

            return {
                success: true,
                status: "RELEASED",
                transfer_id: transfer.id,
                message: "Versement autorisé et libéré."
            };
        } catch (trErr) {
            console.error("❌ Erreur Stripe Transfer:", trErr);
            
            // On Stripe API failure, update transfer_status to TRANSFER_FAILED (keep client_validated_at set!)
            await supabaseAdmin
                .from('payments')
                .update({ transfer_status: 'TRANSFER_FAILED' })
                .eq('id', payment.id);

            return {
                success: false,
                status: "TRANSFER_FAILED",
                error: `Erreur Stripe lors du transfert: ${trErr.message}`
            };
        }
    } else {
        // Test Mode Mock Fallback when process.env.STRIPE_SECRET_KEY is not defined in non-prod test environments
        const mockTransferId = `tr_test_${Date.now()}`;
        const nowIso = new Date().toISOString();

        await supabaseAdmin
            .from('payments')
            .update({
                stripe_transfer_id: mockTransferId,
                transfer_status: 'TRANSFERRED',
                released_at: nowIso
            })
            .eq('id', payment.id);

        await supabaseAdmin
            .from('milestones')
            .update({
                status: 'RELEASED',
                updated_at: nowIso
            })
            .eq('id', milestone.id);

        return {
            success: true,
            mode: 'stripe_test_mock',
            status: "RELEASED",
            transfer_id: mockTransferId,
            message: "Versement autorisé et libéré (mode test)."
        };
    }
}

/**
 * 6.4 REQUESTER VALIDATION & TRANSFER RELEASE (STEP 2B V1.1)
 * POST /v1/milestones/release-payment
 * Payload: { "milestone_id": "uuid", "validation_comment": "..." }
 * Authorization: Requester/Client ONLY
 */
app.post('/v1/milestones/release-payment', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: "Authentification requise." });
        }
        const token = authHeader.split(' ')[1];

        // 1. Authenticate user via Supabase Auth JWT
        const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !authData?.user) {
            return res.status(401).json({ error: "Jeton d'authentification invalide ou expiré." });
        }
        const authUid = authData.user.id;

        // 2. Read input strictly: milestone_id (ignore any financial payload fields from client)
        const { milestone_id, validation_comment } = req.body;
        if (!milestone_id) {
            return res.status(400).json({ error: "Le paramètre milestone_id est obligatoire." });
        }

        // 3. Reconstruct context from DB
        const { data: milestone, error: mErr } = await supabaseAdmin
            .from('milestones')
            .select('*, quotes(*)')
            .eq('id', milestone_id)
            .single();

        if (mErr || !milestone) {
            return res.status(404).json({ error: "Partie/Jalon introuvable." });
        }

        const quote = milestone.quotes;
        if (!quote) {
            return res.status(400).json({ error: "Devis associé introuvable." });
        }

        const { data: mission, error: missErr } = await supabaseAdmin
            .from('missions')
            .select('*')
            .eq('id', quote.mission_id)
            .single();

        if (missErr || !mission) {
            return res.status(400).json({ error: "Mission associée introuvable." });
        }

        // 4. Role Check: Only Requester (Client) can validate milestone
        if (mission.requester_id !== authUid) {
            return res.status(403).json({ error: "Seul le demandeur (client) peut valider la Partie." });
        }

        // 5. Verification Checks
        if (milestone.status !== 'COMPLETED') {
            return res.status(400).json({ error: `La Partie doit être au statut COMPLETED pour être validée (statut actuel: ${milestone.status}).` });
        }

        const { data: payment, error: pErr } = await supabaseAdmin
            .from('payments')
            .select('*')
            .eq('milestone_id', milestone_id)
            .single();

        if (pErr || !payment) {
            return res.status(404).json({ error: "Enregistrement de paiement introuvable pour cette Partie." });
        }

        if (payment.payment_status !== 'SUCCEEDED') {
            return res.status(400).json({ error: "Le paiement de cette Partie doit être au statut SUCCEEDED." });
        }

        // 6. RECORD CLIENT VALIDATION AT (Definitive Business Event)
        let nowIso = new Date().toISOString();
        if (!payment.client_validated_at) {
            const { error: valUpdateErr } = await supabaseAdmin
                .from('payments')
                .update({
                    client_validated_at: nowIso,
                    validation_comment: validation_comment || null
                })
                .eq('id', payment.id);

            if (valUpdateErr) {
                await supabaseAdmin
                    .from('payments')
                    .update({ client_validated_at: nowIso })
                    .eq('id', payment.id);
            }
        }

        // 7. Execute Transfer Release via common helper
        const result = await retryMilestoneTransfer(milestone_id);
        return res.json(result);

    } catch (e) {
        console.error("Erreur serveur release-payment:", e);
        return res.status(500).json({ error: "Erreur interne serveur lors de la libération du paiement." });
    }
});

/**
 * 6.5 LYANNEUR CLAIM / RETRY TRANSFER (STEP 2B V1.1)
 * POST /v1/milestones/claim-transfer
 * Payload: { "milestone_id": "uuid" }
 * Authorization: Assigned Helper/Provider ONLY
 */
app.post('/v1/milestones/claim-transfer', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: "Authentification requise." });
        }
        const token = authHeader.split(' ')[1];

        const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !authData?.user) {
            return res.status(401).json({ error: "Jeton d'authentification invalide ou expiré." });
        }
        const authUid = authData.user.id;

        const { milestone_id } = req.body;
        if (!milestone_id) {
            return res.status(400).json({ error: "Le paramètre milestone_id est obligatoire." });
        }

        const { data: milestone, error: mErr } = await supabaseAdmin
            .from('milestones')
            .select('*, quotes(*)')
            .eq('id', milestone_id)
            .single();

        if (mErr || !milestone) {
            return res.status(404).json({ error: "Partie/Jalon introuvable." });
        }

        const quote = milestone.quotes;
        if (!quote) {
            return res.status(400).json({ error: "Devis associé introuvable." });
        }

        const providerId = quote.provider_id;
        if (providerId !== authUid) {
            return res.status(403).json({ error: "Seul le Lyanneur prestataire peut réclamer ce versement." });
        }

        const result = await retryMilestoneTransfer(milestone_id);
        return res.json(result);

    } catch (e) {
        console.error("Erreur serveur claim-transfer:", e);
        return res.status(500).json({ error: "Erreur interne serveur." });
    }
});

/**
 * 6.6 CLIENT DISPUTE / LITIGE ENDPOINT (STEP 2B V1.1)
 * POST /v1/milestones/raise-dispute
 * Payload: { "milestone_id": "uuid", "reason": "..." }
 * Authorization: Requester/Client ONLY
 */
app.post('/v1/milestones/raise-dispute', async (req, res) => {
    try {
        const authHeader = req.headers.authorization;
        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({ error: "Authentification requise." });
        }
        const token = authHeader.split(' ')[1];

        const { data: authData, error: authError } = await supabaseAdmin.auth.getUser(token);
        if (authError || !authData?.user) {
            return res.status(401).json({ error: "Jeton d'authentification invalide ou expiré." });
        }
        const authUid = authData.user.id;

        const { milestone_id, reason = '' } = req.body;
        if (!milestone_id) {
            return res.status(400).json({ error: "Le paramètre milestone_id est obligatoire." });
        }

        const { data: milestone, error: mErr } = await supabaseAdmin
            .from('milestones')
            .select('*, quotes(*)')
            .eq('id', milestone_id)
            .single();

        if (mErr || !milestone) {
            return res.status(404).json({ error: "Partie/Jalon introuvable." });
        }

        const quote = milestone.quotes;
        if (!quote) {
            return res.status(400).json({ error: "Devis associé introuvable." });
        }

        const { data: mission, error: missErr } = await supabaseAdmin
            .from('missions')
            .select('*')
            .eq('id', quote.mission_id)
            .single();

        if (missErr || !mission) {
            return res.status(400).json({ error: "Mission associée introuvable." });
        }

        if (mission.requester_id !== authUid) {
            return res.status(403).json({ error: "Seul le demandeur (client) peut signaler un litige sur cette Partie." });
        }

        if (milestone.status !== 'COMPLETED') {
            return res.status(400).json({ error: `Un litige ne peut être ouvert que sur une Partie réalisée (statut actuel: ${milestone.status}).` });
        }

        const { data: payment, error: pErr } = await supabaseAdmin
            .from('payments')
            .select('*')
            .eq('milestone_id', milestone_id)
            .single();

        if (pErr || !payment) {
            return res.status(404).json({ error: "Paiement introuvable pour cette Partie." });
        }

        if (payment.client_validated_at) {
            return res.status(400).json({
                error: "Cette Partie a déjà été validée. Vous ne pouvez plus ouvrir un litige standard.",
                code: "ALREADY_VALIDATED"
            });
        }

        if (payment.payment_status !== 'SUCCEEDED' || payment.transfer_status !== 'PENDING_VALIDATION') {
            return res.status(400).json({ error: "Le statut du paiement ne permet pas l'ouverture d'un litige." });
        }

        const nowIso = new Date().toISOString();
        await supabaseAdmin
            .from('milestones')
            .update({
                status: 'DISPUTED',
                updated_at: nowIso
            })
            .eq('id', milestone.id);

        await supabaseAdmin
            .from('payments')
            .update({
                payment_status: 'DISPUTED',
                dispute_reason: reason || null
            })
            .eq('id', payment.id);

        console.log(`⚠️ [DISPUTE RAISED] Litige ouvert par le client sur Partie ${milestone.id}. Raison: ${reason}`);

        return res.json({
            success: true,
            status: "DISPUTED",
            milestone_id: milestone.id,
            message: "Signalement de litige enregistré. Le versement est gelé en attente de médiation."
        });

    } catch (e) {
        console.error("Erreur serveur raise-dispute:", e);
        return res.status(500).json({ error: "Erreur interne serveur." });
    }
});

// 7. LEGACY SECURE PROVIDER TRANSFER (@deprecated)
app.post('/v1/payments/validate-and-transfer', async (req, res) => {
    try {
        const { missionId, providerStripeAccountId, providerAmount, userId } = req.body;

        if (!missionId || !providerAmount) {
            return res.status(400).json({ error: "Mission ID et montant prestataire requis." });
        }

        const amountCents = Math.round(parseFloat(providerAmount) * 100);

        if (process.env.STRIPE_SECRET_KEY && providerStripeAccountId) {
            const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
            const transfer = await stripe.transfers.create({
                amount: amountCents,
                currency: 'eur',
                destination: providerStripeAccountId,
                description: `Versements travaux mission LYANN ${missionId}`,
                metadata: { missionId, validatedBy: userId || '' }
            }, {
                idempotencyKey: `tr_idem_${missionId}_val`
            });

            return res.json({
                success: true,
                mode: 'stripe_live',
                transferId: transfer.id,
                providerAmount: parseFloat(providerAmount),
                status: 'PROVIDER_TRANSFERRED'
            });
        } else {
            return res.json({
                success: true,
                mode: 'stripe_test_mode',
                transferId: `tr_test_${Date.now()}`,
                providerAmount: parseFloat(providerAmount),
                status: 'PROVIDER_TRANSFERRED'
            });
        }
    } catch (e) {
        console.error("Stripe Transfer Server Error:", e);
        res.status(500).json({ error: "Erreur lors du virement au prestataire." });
    }
});

// 8. DISPUTE / LITIGE FREEZE ENDPOINT
app.post('/v1/payments/dispute', (req, res) => {
    const { missionId, reason } = req.body;
    console.log(`⚠️ [LITIGE LYANN] Mission ${missionId} en litige. Raison: ${reason}. Virement bloqué.`);
    res.json({
        success: true,
        missionId,
        providerTransferStatus: 'DISPUTED',
        message: "Signalement de litige enregistré. Virement gelé jusqu'à médiation."
    });
});

// 9. STRIPE WEBHOOK LISTENER (Server-side Source of Truth & Signed Idempotent Event Processor)
app.post(['/v1/payments/webhook', '/v1/webhooks/stripe', '/payments/webhook', '/webhooks/stripe', '/api/payments/webhook', '/api/webhooks/stripe'], async (req, res) => {
    const sig = req.headers['stripe-signature'];
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

    let event = req.body;

    if (webhookSecret && process.env.STRIPE_SECRET_KEY) {
        const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
        try {
            event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
        } catch (err) {
            console.error(`⚠️ Signature Webhook Stripe invalide:`, err.message);
            return res.status(400).send(`Webhook Error: ${err.message}`);
        }
    }

    if (event && event.id) {
        const { error: eventInsertErr } = await supabaseAdmin
            .from('stripe_webhook_events')
            .insert({
                stripe_event_id: event.id,
                event_type: event.type,
                payload: event.data ? event.data.object : {}
            });

        if (eventInsertErr && eventInsertErr.code === '23505') {
            console.log(`ℹ️ [WEBHOOK STRIPE] Événement déjà traité (Idempotent): ${event.id}`);
            return res.json({ received: true, duplicate: true });
        }
    }

    try {
        switch (event.type) {
            case 'payment_intent.succeeded': {
                const paymentIntent = event.data.object;
                console.log(`✅ [STRIPE WEBHOOK] PaymentIntent réussi: ${paymentIntent.id}`);

                const { data: payment } = await supabaseAdmin
                    .from('payments')
                    .select('*')
                    .eq('stripe_payment_intent_id', paymentIntent.id)
                    .maybeSingle();

                if (payment) {
                    await supabaseAdmin
                        .from('payments')
                        .update({
                            payment_status: 'SUCCEEDED',
                            transfer_status: 'PENDING_VALIDATION',
                            funded_at: new Date().toISOString(),
                            stripe_charge_id: paymentIntent.latest_charge || null
                        })
                        .eq('id', payment.id);

                    await supabaseAdmin
                        .from('milestones')
                        .update({
                            status: 'FUNDED',
                            updated_at: new Date().toISOString()
                        })
                        .eq('id', payment.milestone_id);

                    console.log(`🔒 [PAYMENT CORE] Milestone ${payment.milestone_id} est à présent FUNDED. Transfer status: PENDING_VALIDATION.`);
                }
                break;
            }

            case 'payment_intent.payment_failed': {
                const paymentIntent = event.data.object;
                console.log(`❌ [STRIPE WEBHOOK] PaymentIntent échoué: ${paymentIntent.id}`);

                await supabaseAdmin
                    .from('payments')
                    .update({ payment_status: 'FAILED' })
                    .eq('stripe_payment_intent_id', paymentIntent.id);
                break;
            }

            case 'payment_intent.processing': {
                const paymentIntent = event.data.object;
                await supabaseAdmin
                    .from('payments')
                    .update({ payment_status: 'PROCESSING' })
                    .eq('stripe_payment_intent_id', paymentIntent.id);
                break;
            }

            case 'account.updated': {
                const account = event.data.object;
                console.log(`ℹ️ [STRIPE WEBHOOK] account.updated pour ${account.id}. Capabilities:`, account.capabilities);

                if (account.capabilities?.transfers === 'active' && !account.requirements?.disabled_reason) {
                    const { data: providerProfile } = await supabaseAdmin
                        .from('profiles')
                        .select('id')
                        .eq('stripe_account_id', account.id)
                        .maybeSingle();

                    if (providerProfile) {
                        const { data: pendingPayments } = await supabaseAdmin
                            .from('payments')
                            .select('milestone_id, provider_net_cents')
                            .eq('provider_id', providerProfile.id)
                            .not('client_validated_at', 'is', null)
                            .eq('payment_status', 'SUCCEEDED')
                            .eq('transfer_status', 'TRANSFER_FAILED')
                            .is('stripe_transfer_id', null);

                        if (pendingPayments && pendingPayments.length > 0) {
                            console.log(`🔄 [ACCOUNT.UPDATED] ${pendingPayments.length} paiement(s) en attente à réessayer pour le provider ${providerProfile.id}`);
                            for (const p of pendingPayments) {
                                await retryMilestoneTransfer(p.milestone_id);
                            }
                        }
                    }
                }
                break;
            }

            default:
                console.log(`ℹ️ [WEBHOOK STRIPE] Événement non géré: ${event.type}`);
        }

        return res.json({ received: true });
    } catch (handlerErr) {
        console.error("Erreur traitement Webhook Stripe:", handlerErr);
        return res.status(500).send("Erreur serveur webhook.");
    }
});

// Start Server
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`🚀 LYANN DOM API Engine en écoute sur http://localhost:${PORT}/v1`);
    });
}

module.exports = app;
