/**
 * LYANN admin control center — honest aggregations only.
 * Missing or failed queries stay unavailable. Never coerced to zero.
 */

const CACHE_TTL_MS = 30 * 1000;
const cache = new Map();

const DEFINITIONS = {
    realMembers: 'Profils account_type=real. Ce n’est pas une mesure d’activité.',
    seedMembers: 'Profils maison (account_type=seed).',
    totalProfiles: 'Tous les profils, y compris maison et agents éventuels.',
    newRealMembers: 'Profils réels créés pendant la période filtrée.',
    completedProfiles: 'Profils réels avec prénom, nom et commune renseignés.',
    activeMembers: 'Non mesurable : aucun événement de session fiable n’existe aujourd’hui.',
    openRequests: 'Annonces au statut OPEN.',
    requestsInPeriod: 'Annonces créées pendant la période.',
    unanswered24h: 'Annonces OPEN de plus de 24 h sans devis SENT ou ACCEPTED.',
    unanswered48h: 'Annonces OPEN de plus de 48 h sans devis SENT ou ACCEPTED.',
    quotesSent: 'Devis au statut SENT créés pendant la période.',
    quotesAccepted: 'Devis au statut ACCEPTED créés ou acceptés pendant la période (filtre created_at).',
    missionsCreated: 'Missions créées pendant la période.',
    missionsCompleted: 'Missions au statut COMPLETED créées pendant la période (proxy si completed_at absent).',
    medianFirstQuoteHours: 'Médiane en heures entre created_at de l’annonce et created_at du premier devis. Échantillon limité. Ne lit pas le contenu des messages.',
    bokantajApproved: 'Publications Bokantaj approuvées (public_moderation_status=approved).',
    bokantajPending: 'Publications Bokantaj en attente de modération.',
    editorialPending: 'Tâches agents en approval_status=PENDING, hors CANCELLED.',
    agentTaskApprovals: 'Tâches lyann_agent_tasks en WAITING_APPROVAL (moteur d’agents, distinct de l’éditorial).',
    openReports: 'Signalements user_reports au statut OPEN.',
    openDisputes: 'Litiges disputes au statut OPEN.',
    gmvPeriod: 'Somme customer_total_cents des paiements SUCCEEDED dont created_at est dans la période, en euros. Lecture seule.',
    collectedCommissions: 'Somme lyann_revenue_cents des mêmes paiements. Ce n’est pas un MRR.',
    conversionRequestToQuote: 'Devis SENT de la période / annonces créées dans la période.',
    conversionQuoteToAccept: 'Devis ACCEPTED / devis SENT de la période.'
};

function periodBounds(period) {
    const now = new Date();
    const end = now.toISOString();
    const days = { '7d': 7, '30d': 30, '90d': 90, month: 30 }[period];
    if (!days) return { start: null, end, label: 'toutes périodes' };
    const startDate = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
    return { start: startDate.toISOString(), end, label: period === 'month' ? '30 derniers jours' : `${days} derniers jours` };
}

function metric(result, extra = {}) {
    if (!result || result.available === false) {
        return { value: null, available: false, error: result && result.error ? result.error : 'indisponible', ...extra };
    }
    return { value: result.value, available: true, ...extra };
}

function cacheKey(name, query) {
    return `${name}:${JSON.stringify(query || {})}`;
}

function readCache(key) {
    const hit = cache.get(key);
    if (!hit) return null;
    if (Date.now() - hit.at > CACHE_TTL_MS) {
        cache.delete(key);
        return null;
    }
    return hit.value;
}

function writeCache(key, value) {
    cache.set(key, { at: Date.now(), value });
    return value;
}

async function counted(builder) {
    try {
        const { count, error } = await builder;
        if (error) return { available: false, error: error.message, value: null };
        return { available: true, value: Number(count || 0) };
    } catch (error) {
        return { available: false, error: error.message, value: null };
    }
}

function applyCreatedAt(builder, start) {
    return start ? builder.gte('created_at', start) : builder;
}

function applyTerritory(builder, territory, column = 'territory') {
    return territory && territory !== 'all' ? builder.eq(column, territory) : builder;
}

function median(values) {
    if (!values.length) return null;
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function ratio(num, den) {
    if (num == null || den == null || !den) return { value: null, available: num != null && den != null, reason: den === 0 ? 'dénominateur nul' : undefined };
    return { value: Number((num / den).toFixed(3)), available: true };
}

function registerAdminControlCenter(app, { supabaseAdmin, verifyAdminPermission }) {
    async function requireAdmin(req, res) {
        const auth = await verifyAdminPermission(req);
        if (!auth.authorized) {
            res.status(auth.status).json({ success: false, error: auth.error });
            return null;
        }
        return auth;
    }

    async function computeKpis(query) {
        const period = query.period || '30d';
        const territory = query.territory || 'all';
        const key = cacheKey('kpis', { period, territory });
        const cached = readCache(key);
        if (cached) return cached;

        const bounds = periodBounds(period);
        const start = bounds.start;
        const db = supabaseAdmin;

        const [
            totalProfiles,
            realMembers,
            seedMembers,
            newRealMembers,
            kycVerified,
            lyanneurs,
            openRequests,
            requestsInPeriod,
            quotesSent,
            quotesAccepted,
            missionsCreated,
            missionsCompleted,
            bokantajApproved,
            bokantajPending,
            editorialPending,
            agentApprovals,
            openReports,
            openDisputes,
            openConversations
        ] = await Promise.all([
            counted(db.from('profiles').select('*', { count: 'exact', head: true })),
            counted(applyTerritory(db.from('profiles').select('*', { count: 'exact', head: true }).eq('account_type', 'real'), territory)),
            counted(db.from('profiles').select('*', { count: 'exact', head: true }).eq('account_type', 'seed')),
            counted(applyTerritory(applyCreatedAt(db.from('profiles').select('*', { count: 'exact', head: true }).eq('account_type', 'real'), start), territory)),
            counted(applyTerritory(db.from('profiles').select('*', { count: 'exact', head: true }).eq('account_type', 'real').eq('kyc_verified', true), territory)),
            counted(applyTerritory(db.from('profiles').select('*', { count: 'exact', head: true }).eq('is_pro', true).eq('account_type', 'real'), territory)),
            counted(applyTerritory(db.from('requests').select('*', { count: 'exact', head: true }).eq('status', 'OPEN'), territory)),
            counted(applyTerritory(applyCreatedAt(db.from('requests').select('*', { count: 'exact', head: true }), start), territory)),
            counted(applyCreatedAt(db.from('quotes').select('*', { count: 'exact', head: true }).eq('status', 'SENT'), start)),
            counted(applyCreatedAt(db.from('quotes').select('*', { count: 'exact', head: true }).eq('status', 'ACCEPTED'), start)),
            counted(applyCreatedAt(db.from('missions').select('*', { count: 'exact', head: true }), start)),
            counted(applyCreatedAt(db.from('missions').select('*', { count: 'exact', head: true }).eq('status', 'COMPLETED'), start)),
            counted(applyTerritory(db.from('bokantaj_posts').select('*', { count: 'exact', head: true }).eq('public_moderation_status', 'approved'), territory)),
            counted(db.from('bokantaj_posts').select('*', { count: 'exact', head: true }).eq('public_moderation_status', 'pending')),
            counted(db.from('lyann_agent_tasks').select('*', { count: 'exact', head: true }).eq('approval_status', 'PENDING').neq('status', 'CANCELLED')),
            counted(db.from('lyann_agent_tasks').select('*', { count: 'exact', head: true }).eq('status', 'WAITING_APPROVAL')),
            counted(db.from('user_reports').select('*', { count: 'exact', head: true }).eq('status', 'OPEN')),
            counted(db.from('disputes').select('*', { count: 'exact', head: true }).eq('status', 'OPEN')),
            counted(db.from('conversations').select('*', { count: 'exact', head: true }))
        ]);

        let payments = { available: false, gmv: null, commissions: null, error: null };
        try {
            let payQuery = db.from('payments').select('customer_total_cents, lyann_revenue_cents, created_at').eq('payment_status', 'SUCCEEDED');
            if (start) payQuery = payQuery.gte('created_at', start);
            const { data, error } = await payQuery;
            if (error) {
                payments = { available: false, gmv: null, commissions: null, error: error.message };
            } else {
                const rows = data || [];
                payments = {
                    available: true,
                    gmv: rows.reduce((sum, row) => sum + Number(row.customer_total_cents || 0), 0) / 100,
                    commissions: rows.reduce((sum, row) => sum + Number(row.lyann_revenue_cents || 0), 0) / 100,
                    error: null
                };
            }
        } catch (error) {
            payments = { available: false, gmv: null, commissions: null, error: error.message };
        }

        let completedProfiles = { available: false, value: null, error: null };
        try {
            let profileQuery = db.from('profiles').select('id, first_name, last_name, city, account_type').eq('account_type', 'real');
            profileQuery = applyTerritory(profileQuery, territory);
            const { data, error } = await profileQuery.limit(4000);
            if (error) completedProfiles = { available: false, value: null, error: error.message };
            else {
                const rows = data || [];
                completedProfiles = {
                    available: true,
                    value: rows.filter((row) => row.first_name && row.last_name && row.city).length
                };
            }
        } catch (error) {
            completedProfiles = { available: false, value: null, error: error.message };
        }

        let unanswered = { h24: null, h48: null, available: false, error: null, medianFirstQuoteHours: null };
        try {
            let reqQuery = db.from('requests').select('id, created_at, status, territory').eq('status', 'OPEN').order('created_at', { ascending: false }).limit(400);
            reqQuery = applyTerritory(reqQuery, territory);
            const { data: openRows, error: reqErr } = await reqQuery;
            if (reqErr) throw reqErr;
            const ids = (openRows || []).map((row) => row.id);
            let quoted = new Set();
            if (ids.length) {
                const { data: quoteRows, error: qErr } = await db.from('quotes').select('request_id, created_at, status').in('request_id', ids).in('status', ['SENT', 'ACCEPTED']);
                if (qErr) throw qErr;
                quoted = new Set((quoteRows || []).map((row) => row.request_id));
            }
            const now = Date.now();
            const without = (openRows || []).filter((row) => !quoted.has(row.id));
            unanswered = {
                available: true,
                h24: without.filter((row) => now - new Date(row.created_at).getTime() >= 24 * 3600 * 1000).length,
                h48: without.filter((row) => now - new Date(row.created_at).getTime() >= 48 * 3600 * 1000).length,
                medianFirstQuoteHours: null,
                error: null
            };

            let firstQuoteQuery = db.from('quotes').select('request_id, created_at').in('status', ['SENT', 'ACCEPTED']).order('created_at', { ascending: true }).limit(800);
            const { data: earlyQuotes, error: earlyErr } = await firstQuoteQuery;
            if (!earlyErr && earlyQuotes && earlyQuotes.length) {
                const firstByRequest = new Map();
                earlyQuotes.forEach((row) => {
                    if (!firstByRequest.has(row.request_id)) firstByRequest.set(row.request_id, row.created_at);
                });
                const requestIds = [...firstByRequest.keys()];
                const { data: reqTimes } = await db.from('requests').select('id, created_at').in('id', requestIds.slice(0, 400));
                const hours = [];
                (reqTimes || []).forEach((row) => {
                    const first = firstByRequest.get(row.id);
                    if (!first) return;
                    const delta = (new Date(first).getTime() - new Date(row.created_at).getTime()) / 3600000;
                    if (Number.isFinite(delta) && delta >= 0) hours.push(delta);
                });
                unanswered.medianFirstQuoteHours = median(hours);
            }
        } catch (error) {
            unanswered = { available: false, h24: null, h48: null, medianFirstQuoteHours: null, error: error.message };
        }

        const payload = {
            success: true,
            data_available: true,
            generated_at: new Date().toISOString(),
            period: bounds.label,
            period_key: period,
            territory,
            definitions: DEFINITIONS,
            metrics: {
                totalProfiles: metric(totalProfiles, { definition: DEFINITIONS.totalProfiles }),
                realMembers: metric(realMembers, { definition: DEFINITIONS.realMembers }),
                seedMembers: metric(seedMembers, { definition: DEFINITIONS.seedMembers }),
                newRealMembers: metric(newRealMembers, { definition: DEFINITIONS.newRealMembers }),
                completedProfiles: metric(completedProfiles, { definition: DEFINITIONS.completedProfiles }),
                activeMembers: { value: null, available: false, definition: DEFINITIONS.activeMembers },
                kycVerified: metric(kycVerified),
                lyanneurs: metric(lyanneurs),
                openRequests: metric(openRequests, { definition: DEFINITIONS.openRequests }),
                requestsInPeriod: metric(requestsInPeriod, { definition: DEFINITIONS.requestsInPeriod }),
                unanswered24h: { value: unanswered.h24, available: unanswered.available, error: unanswered.error, definition: DEFINITIONS.unanswered24h },
                unanswered48h: { value: unanswered.h48, available: unanswered.available, error: unanswered.error, definition: DEFINITIONS.unanswered48h },
                medianFirstQuoteHours: { value: unanswered.medianFirstQuoteHours, available: unanswered.available && unanswered.medianFirstQuoteHours != null, definition: DEFINITIONS.medianFirstQuoteHours },
                quotesSent: metric(quotesSent, { definition: DEFINITIONS.quotesSent }),
                quotesAccepted: metric(quotesAccepted, { definition: DEFINITIONS.quotesAccepted }),
                missionsCreated: metric(missionsCreated, { definition: DEFINITIONS.missionsCreated }),
                missionsCompleted: metric(missionsCompleted, { definition: DEFINITIONS.missionsCompleted }),
                conversionRequestToQuote: { ...ratio(quotesSent.value, requestsInPeriod.value), definition: DEFINITIONS.conversionRequestToQuote },
                conversionQuoteToAccept: { ...ratio(quotesAccepted.value, quotesSent.value), definition: DEFINITIONS.conversionQuoteToAccept },
                bokantajApproved: metric(bokantajApproved, { definition: DEFINITIONS.bokantajApproved }),
                bokantajPending: metric(bokantajPending, { definition: DEFINITIONS.bokantajPending }),
                editorialPending: metric(editorialPending, { definition: DEFINITIONS.editorialPending }),
                agentTaskApprovals: metric(agentApprovals, { definition: DEFINITIONS.agentTaskApprovals }),
                openReports: metric(openReports, { definition: DEFINITIONS.openReports }),
                openDisputes: metric(openDisputes, { definition: DEFINITIONS.openDisputes }),
                conversations: metric(openConversations),
                gmvPeriod: { value: payments.gmv, available: payments.available, error: payments.error, definition: DEFINITIONS.gmvPeriod, readonly: true },
                collectedCommissions: { value: payments.commissions, available: payments.available, error: payments.error, definition: DEFINITIONS.collectedCommissions, readonly: true }
            },
            // Backward-compatible aliases with honest meaning (not the old misleading labels).
            realMembers: realMembers.available ? realMembers.value : null,
            seedMembers: seedMembers.available ? seedMembers.value : null,
            kycVerified: kycVerified.available ? kycVerified.value : null,
            openRequests: openRequests.available ? openRequests.value : null,
            openDisputes: openDisputes.available ? openDisputes.value : null,
            openReports: openReports.available ? openReports.value : null,
            pendingApprovals: editorialPending.available ? editorialPending.value : null,
            activeAgents: null,
            bokantajPosts: bokantajApproved.available ? bokantajApproved.value : null,
            conversations: openConversations.available ? openConversations.value : null,
            gmvMonth: payments.available ? payments.gmv : null,
            mrrCommissions: payments.available ? payments.commissions : null,
            activeMembers: realMembers.available ? realMembers.value : null,
            activeMissions: missionsCreated.available ? missionsCreated.value : null,
            unavailable: {
                activeMembersReason: DEFINITIONS.activeMembers,
                gmvIsPeriodNotCalendarMonth: true,
                commissionsAreNotMrr: true
            }
        };
        return writeCache(key, payload);
    }

    async function computeActions() {
        const key = cacheKey('actions', {});
        const cached = readCache(key);
        if (cached) return cached;
        const items = [];

        const add = (item) => {
            if (item.count > 0) items.push(item);
        };

        const [pendingPosts, editorial, reports, disputes] = await Promise.all([
            counted(supabaseAdmin.from('bokantaj_posts').select('*', { count: 'exact', head: true }).eq('public_moderation_status', 'pending')),
            counted(supabaseAdmin.from('lyann_agent_tasks').select('*', { count: 'exact', head: true }).eq('approval_status', 'PENDING').neq('status', 'CANCELLED')),
            counted(supabaseAdmin.from('user_reports').select('*', { count: 'exact', head: true }).eq('status', 'OPEN')),
            counted(supabaseAdmin.from('disputes').select('*', { count: 'exact', head: true }).eq('status', 'OPEN'))
        ]);

        if (pendingPosts.available) add({ id: 'moderation-posts', title: 'Publications en attente de modération', count: pendingPosts.value, section: 'sec-content', priority: 1, kind: 'moderation' });
        if (editorial.available) add({ id: 'editorial-pending', title: 'Propositions éditoriales à valider', count: editorial.value, section: 'sec-editorial', priority: 1, kind: 'editorial' });
        if (reports.available) add({ id: 'open-reports', title: 'Signalements ouverts', count: reports.value, section: 'sec-content', priority: 2, kind: 'trust' });
        if (disputes.available) add({ id: 'open-disputes', title: 'Litiges ouverts', count: disputes.value, section: 'sec-disputes', priority: 2, kind: 'trust' });

        try {
            const { data: failed } = await supabaseAdmin.from('lyann_agent_tasks').select('id, agent_name, status, metadata, created_at').in('status', ['FAILED']).order('created_at', { ascending: false }).limit(8);
            (failed || []).forEach((row) => {
                items.push({
                    id: `collect-fail-${row.id}`,
                    title: `Échec de collecte ${row.agent_name || 'agent'}`,
                    count: 1,
                    section: 'sec-editorial',
                    priority: 3,
                    kind: 'ops',
                    resourceId: row.id
                });
            });
        } catch (_error) {
            /* keep other actions */
        }

        try {
            const { data: openRows } = await supabaseAdmin.from('requests').select('id, title, created_at').eq('status', 'OPEN').order('created_at', { ascending: true }).limit(80);
            const ids = (openRows || []).map((row) => row.id);
            let quoted = new Set();
            if (ids.length) {
                const { data: quoteRows } = await supabaseAdmin.from('quotes').select('request_id').in('request_id', ids).in('status', ['SENT', 'ACCEPTED']);
                quoted = new Set((quoteRows || []).map((row) => row.request_id));
            }
            const stale = (openRows || []).filter((row) => !quoted.has(row.id) && Date.now() - new Date(row.created_at).getTime() >= 48 * 3600 * 1000);
            if (stale.length) {
                add({ id: 'unanswered-48h', title: 'Annonces sans devis depuis 48 h', count: stale.length, section: 'sec-requests', priority: 3, kind: 'marketplace' });
            }
        } catch (_error) {
            /* optional */
        }

        items.sort((a, b) => a.priority - b.priority || b.count - a.count);
        const payload = {
            success: true,
            generated_at: new Date().toISOString(),
            items: items.slice(0, 20)
        };
        return writeCache(key, payload);
    }

    app.get('/v1/admin/kpis', async (req, res) => {
        if (!(await requireAdmin(req, res))) return;
        try {
            res.json(await computeKpis(req.query || {}));
        } catch (error) {
            console.error('Admin KPIs v3:', error);
            res.status(503).json({ success: false, data_available: false, error: 'Données temporairement indisponibles' });
        }
    });

    app.get('/v1/admin/control-center', async (req, res) => {
        if (!(await requireAdmin(req, res))) return;
        try {
            const [kpis, actions] = await Promise.all([computeKpis(req.query || {}), computeActions()]);
            res.json({
                success: true,
                generated_at: new Date().toISOString(),
                kpis,
                actions: actions.items,
                financeLocked: true
            });
        } catch (error) {
            console.error('control-center:', error);
            res.status(503).json({ success: false, data_available: false, error: 'Données temporairement indisponibles' });
        }
    });

    app.get('/v1/admin/action-queue', async (req, res) => {
        if (!(await requireAdmin(req, res))) return;
        try {
            res.json(await computeActions());
        } catch (error) {
            res.status(503).json({ success: false, error: 'File d’action indisponible' });
        }
    });

    app.get('/v1/admin/marketplace-stats', async (req, res) => {
        if (!(await requireAdmin(req, res))) return;
        try {
            const kpis = await computeKpis(req.query || {});
            const m = kpis.metrics;
            let byTerritory = [];
            try {
                const { data, error } = await supabaseAdmin.from('requests').select('territory, city, category, status, created_at').limit(800);
                if (!error && data) {
                    const map = {};
                    data.forEach((row) => {
                        const key = row.territory || 'non renseigné';
                        map[key] = map[key] || { territory: key, requests: 0, open: 0 };
                        map[key].requests += 1;
                        if (row.status === 'OPEN') map[key].open += 1;
                    });
                    byTerritory = Object.values(map);
                }
            } catch (_error) {
                byTerritory = [];
            }
            res.json({
                success: true,
                generated_at: kpis.generated_at,
                period: kpis.period,
                territory: kpis.territory,
                metrics: {
                    realMembers: m.realMembers,
                    newRealMembers: m.newRealMembers,
                    completedProfiles: m.completedProfiles,
                    activeMembers: m.activeMembers,
                    requestsInPeriod: m.requestsInPeriod,
                    openRequests: m.openRequests,
                    unanswered24h: m.unanswered24h,
                    unanswered48h: m.unanswered48h,
                    medianFirstQuoteHours: m.medianFirstQuoteHours,
                    quotesSent: m.quotesSent,
                    quotesAccepted: m.quotesAccepted,
                    missionsCreated: m.missionsCreated,
                    missionsCompleted: m.missionsCompleted,
                    conversionRequestToQuote: m.conversionRequestToQuote,
                    conversionQuoteToAccept: m.conversionQuoteToAccept
                },
                byTerritory,
                missingInstrumentation: [
                    { event: 'session_started', why: 'Mesurer un membre réellement actif sans déduire depuis l’existence du profil.' },
                    { event: 'request_first_viewed', why: 'Mesurer le délai avant première lecture, distinct du premier devis.' },
                    { event: 'quote_accepted_at', why: 'Filtrer les acceptations sur la date d’acceptation plutôt que created_at.' }
                ]
            });
        } catch (error) {
            res.status(503).json({ success: false, error: 'Statistiques marketplace indisponibles' });
        }
    });
}

module.exports = { registerAdminControlCenter, DEFINITIONS, periodBounds };
