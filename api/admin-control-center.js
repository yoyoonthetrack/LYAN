/**
 * LYANN admin control center — honest aggregations only.
 * Truncated, failed or incomplete queries stay unavailable. Never coerced to zero.
 * No Stripe calls. Finance figures stay read-only and RBAC-gated.
 */

const CACHE_TTL_MS = 30 * 1000;
const DEFAULT_PAGE = 1000;
const DEFAULT_CAP = 5000;
const ADMISSIBLE_QUOTE = ['SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED'];
const ISSUED_QUOTE = ['SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED', 'CANCELLED'];

const DEFINITIONS = {
    realMembers: 'Instantané. Profils account_type=real. Pas une mesure d’activité.',
    seedMembers: 'Instantané. Profils maison (account_type=seed), distincts des membres réels.',
    editorialAgents: 'Instantané. Agents lyann_agents, distincts des membres et des profils maison.',
    totalProfiles: 'Instantané. Tous les profils (réels, maison, autres). Ne pas lire comme activité organique.',
    newRealMembers: 'Période. Profils réels créés dans la fenêtre filtrée.',
    completedProfiles: 'Instantané. Profils réels avec prénom, nom et commune non vides. Comptage exact, pas un échantillon.',
    activeMembers: 'Indisponible. Aucun événement de session fiable.',
    openRequests: 'Instantané. Annonces au statut OPEN.',
    requestsInPeriod: 'Période. Annonces créées dans la fenêtre.',
    unanswered24h: 'Instantané. Annonces OPEN de plus de 24 h sans devis admissible (SENT/ACCEPTED/REJECTED/EXPIRED). Indisponible si le jeu est tronqué.',
    unanswered48h: 'Instantané. Même définition à 48 h. Distinct d’un premier contact ou d’une mission.',
    noFirstContact: 'Indisponible. Aucun événement request_first_viewed ni contact vérifiable sans lire les messages.',
    noConfirmedMission: 'Instantané. Annonces OPEN sans mission liée (related_request_id). Indisponible si le jeu est tronqué.',
    quotesIssued: 'Période. Devis créés dans la fenêtre qui ont quitté DRAFT. Un devis ensuite accepté reste compté.',
    quotesCurrentlyAccepted: 'Instantané. Devis au statut ACCEPTED. Ce n’est pas une acceptation datée.',
    quotesAcceptedInPeriod: 'Indisponible. Pas de colonne accepted_at fiable.',
    missionsCreated: 'Période. Missions dont created_at est dans la fenêtre.',
    missionsCompleted: 'Période. Missions dont completed_at est dans la fenêtre. Pas un proxy sur created_at.',
    medianFirstQuoteHours: 'Cohorte. Médiane des délais (premier devis admissible − création d’annonce) sur les annonces de la période qui ont au moins un devis. Indisponible si le jeu est incomplet.',
    bokantajApproved: 'Instantané. Publications approved, tous auteurs confondus.',
    bokantajOrganic: 'Instantané. Publications approved dont l’auteur est un profil réel, hors agents. Un auteur inconnu n’est jamais classé organique.',
    bokantajAdministered: 'Instantané. Publications approved dont l’auteur est un profil maison, hors agents.',
    bokantajEditorial: 'Instantané. Publications approved dont l’auteur est linked_profile_id d’un agent éditorial.',
    bokantajUnknown: 'Instantané. Publications approved sans auteur identifiable (ni réel, ni maison, ni agent).',
    bokantajPending: 'Instantané. Publications en attente de modération.',
    editorialPending: 'Instantané. Tâches agents approval_status=PENDING hors CANCELLED.',
    agentTaskApprovals: 'Instantané. Tâches WAITING_APPROVAL, distinctes de la file éditoriale.',
    openReports: 'Instantané. Signalements OPEN.',
    openDisputes: 'Instantané. Litiges OPEN.',
    gmvPeriod: 'Période. Somme customer_total_cents des paiements SUCCEEDED dans la fenêtre, en euros. Lecture seule. Indisponible si pagination incomplète, filtre territoire, ou droits finance absents.',
    collectedCommissions: 'Période. Somme lyann_revenue_cents des mêmes paiements. Pas un MRR.',
    conversionRequestToQuote: 'Cohorte. Part des annonces créées dans la période qui ont reçu au moins un devis admissible. Plusieurs devis sur une annonce comptent pour une seule conversion.',
    conversionQuoteToAccept: 'Cohorte. Devis créés dans la période (hors DRAFT), y compris sur des annonces plus anciennes. Un devis = une ligne. Statut actuel ACCEPTED, pas une date d’acceptation.'
};

function periodBounds(period, nowInput) {
    const now = nowInput ? new Date(nowInput) : new Date();
    const end = now.toISOString();
    if (period === 'month') {
        const start = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));
        return { start: start.toISOString(), end, label: 'mois civil en cours', kind: 'calendar_month' };
    }
    const days = { '7d': 7, '30d': 30, '90d': 90 }[period];
    if (!days) return { start: null, end, label: 'toutes périodes', kind: 'unbounded' };
    return {
        start: new Date(now.getTime() - days * 24 * 60 * 60 * 1000).toISOString(),
        end,
        label: `${days} derniers jours`,
        kind: 'rolling_window'
    };
}

function metric(result, extra = {}) {
    if (!result || result.available === false) {
        return {
            value: null,
            available: false,
            error: result && result.error ? result.error : 'indisponible',
            ...extra
        };
    }
    return { value: result.value, available: true, ...extra };
}

function unavailable(reason, extra = {}) {
    return { value: null, available: false, error: reason, ...extra };
}

function cacheKey(name, query) {
    return `${name}:${JSON.stringify(query || {})}`;
}

function median(values) {
    if (!values.length) return null;
    const sorted = values.slice().sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function ratio(num, den) {
    if (num == null || den == null) return { value: null, available: false, error: 'données manquantes' };
    if (!den) return { value: null, available: true, reason: 'dénominateur nul' };
    return { value: Number((num / den).toFixed(3)), available: true };
}

function applyCreatedAt(builder, start) {
    return start ? builder.gte('created_at', start) : builder;
}

function applyTerritory(builder, territory, column = 'territory') {
    return territory && territory !== 'all' ? builder.eq(column, territory) : builder;
}

function chunk(list, size) {
    const out = [];
    for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
    return out;
}

function createControlCenter({ supabaseAdmin, verifyAdminPermission, now = () => new Date(), pageSize = DEFAULT_PAGE, hardCap = DEFAULT_CAP, cacheTtlMs = CACHE_TTL_MS } = {}) {
    const cache = new Map();

    function readCache(key) {
        const hit = cache.get(key);
        if (!hit) return null;
        if (Date.now() - hit.at > cacheTtlMs) {
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
            if (error) return { available: false, error: error.message || error.details || error.hint || error.code || 'erreur supabase', value: null };
            return { available: true, value: Number(count || 0) };
        } catch (error) {
            return { available: false, error: error.message, value: null };
        }
    }

    async function fetchAll(startBuilder, { cap = hardCap } = {}) {
        const rows = [];
        let from = 0;
        try {
            while (from < cap) {
                const to = Math.min(from + pageSize - 1, cap - 1);
                const { data, error } = await startBuilder().range(from, to);
                if (error) return { available: false, complete: false, error: error.message, rows: [] };
                const page = data || [];
                rows.push(...page);
                if (page.length < pageSize) return { available: true, complete: true, error: null, rows };
                from += pageSize;
            }
            return { available: false, complete: false, truncated: true, error: 'jeu tronqué : trop d’enregistrements pour un total fiable', rows };
        } catch (error) {
            return { available: false, complete: false, error: error.message, rows: [] };
        }
    }

    async function requireAdmin(req, res) {
        const auth = await verifyAdminPermission(req);
        if (!auth.authorized) {
            res.status(auth.status).json({ success: false, error: auth.error });
            return null;
        }
        return auth;
    }

    async function canSeeFinance(_req, auth) {
        // No finance.read permission exists. Do not reuse finance.refund (mutation).
        return !!(auth && ['SUPER_ADMIN', 'OWNER'].includes(auth.role));
    }

    async function computeFunnel({ start, territory }) {
        const db = supabaseAdmin;
        const requestCount = await counted(
            applyTerritory(applyCreatedAt(db.from('requests').select('*', { count: 'exact', head: true }), start), territory)
        );
        if (!requestCount.available) {
            return { available: false, error: requestCount.error };
        }
        if (requestCount.value > hardCap) {
            return { available: false, error: 'jeu tronqué : trop d’annonces pour calculer les conversions', requestCount };
        }

        const requestFetch = await fetchAll(() =>
            applyTerritory(applyCreatedAt(db.from('requests').select('id, created_at, status, territory'), start), territory).order('created_at', { ascending: true })
        );
        if (!requestFetch.available) return { available: false, error: requestFetch.error, requestCount };

        const requestIds = requestFetch.rows.map((row) => row.id);
        const quotesOnCohort = [];
        for (const ids of chunk(requestIds, 200)) {
            if (!ids.length) continue;
            const part = await fetchAll(() =>
                db.from('quotes').select('id, request_id, created_at, status').in('request_id', ids).in('status', ISSUED_QUOTE).order('created_at', { ascending: true })
            );
            if (!part.available) return { available: false, error: part.error, requestCount };
            quotesOnCohort.push(...part.rows);
        }

        const firstQuote = new Map();
        const quotedRequests = new Set();
        quotesOnCohort.forEach((row) => {
            if (!ADMISSIBLE_QUOTE.includes(row.status)) return;
            quotedRequests.add(row.request_id);
            if (!firstQuote.has(row.request_id)) firstQuote.set(row.request_id, row.created_at);
        });

        const hours = [];
        requestFetch.rows.forEach((row) => {
            const first = firstQuote.get(row.id);
            if (!first) return;
            const delta = (new Date(first).getTime() - new Date(row.created_at).getTime()) / 3600000;
            if (Number.isFinite(delta) && delta >= 0) hours.push(delta);
        });

        const quoteCohort = await computeQuoteCohort({ start, territory });
        return {
            available: true,
            error: null,
            requestCount,
            requests: requestFetch.rows,
            quotedRequests,
            issuedInPeriod: quoteCohort.issued || [],
            quoteCohortAvailable: quoteCohort.available,
            quoteCohortError: quoteCohort.error,
            conversionRequestToQuote: ratio(quotedRequests.size, requestFetch.rows.length),
            conversionQuoteToAccept: quoteCohort.available
                ? ratio(quoteCohort.accepted, quoteCohort.issued.length)
                : { value: null, available: false, error: quoteCohort.error },
            medianFirstQuoteHours: hours.length ? median(hours) : null,
            sampleSize: hours.length
        };
    }

    async function computeQuoteCohort({ start, territory }) {
        const db = supabaseAdmin;
        const issuedCount = await counted(
            applyCreatedAt(db.from('quotes').select('*', { count: 'exact', head: true }).in('status', ISSUED_QUOTE), start)
        );
        if (!issuedCount.available) return { available: false, error: issuedCount.error, issued: [], accepted: 0 };
        if (issuedCount.value > hardCap) {
            return { available: false, error: 'jeu tronqué : trop de devis pour une cohorte fiable', issued: [], accepted: 0 };
        }
        const fetched = await fetchAll(() =>
            applyCreatedAt(db.from('quotes').select('id, request_id, created_at, status').in('status', ISSUED_QUOTE), start)
                .order('created_at', { ascending: true })
        );
        if (!fetched.available) return { available: false, error: fetched.error, issued: [], accepted: 0 };

        const unique = new Map();
        fetched.rows.forEach((row) => {
            if (row && row.id && !unique.has(row.id)) unique.set(row.id, row);
        });
        let issued = [...unique.values()];

        if (territory && territory !== 'all') {
            const requestIds = [...new Set(issued.map((row) => row.request_id).filter(Boolean))];
            const allowed = new Set();
            for (const ids of chunk(requestIds, 200)) {
                const part = await fetchAll(() =>
                    db.from('requests').select('id, territory').in('id', ids).eq('territory', territory)
                );
                if (!part.available) return { available: false, error: part.error, issued: [], accepted: 0 };
                part.rows.forEach((row) => allowed.add(row.id));
            }
            issued = issued.filter((row) => allowed.has(row.request_id));
        }

        return {
            available: true,
            error: null,
            issued,
            accepted: issued.filter((row) => row.status === 'ACCEPTED').length
        };
    }

    async function computeUnanswered(territory) {
        const db = supabaseAdmin;
        const openCount = await counted(applyTerritory(db.from('requests').select('*', { count: 'exact', head: true }).eq('status', 'OPEN'), territory));
        if (!openCount.available) return { available: false, error: openCount.error };
        if (openCount.value > hardCap) {
            return { available: false, error: 'jeu tronqué : trop d’annonces ouvertes pour un total sans devis' };
        }
        const openFetch = await fetchAll(() =>
            applyTerritory(db.from('requests').select('id, created_at, status, territory').eq('status', 'OPEN'), territory).order('created_at', { ascending: true })
        );
        if (!openFetch.available) return { available: false, error: openFetch.error };

        const quoted = new Set();
        for (const ids of chunk(openFetch.rows.map((row) => row.id), 200)) {
            if (!ids.length) continue;
            const part = await fetchAll(() =>
                db.from('quotes').select('request_id, status').in('request_id', ids).in('status', ADMISSIBLE_QUOTE)
            );
            if (!part.available) return { available: false, error: part.error };
            part.rows.forEach((row) => quoted.add(row.request_id));
        }

        const nowMs = now().getTime();
        const without = openFetch.rows.filter((row) => !quoted.has(row.id));
        return {
            available: true,
            h24: without.filter((row) => nowMs - new Date(row.created_at).getTime() >= 24 * 3600 * 1000).length,
            h48: without.filter((row) => nowMs - new Date(row.created_at).getTime() >= 48 * 3600 * 1000).length,
            withoutQuote: without.length,
            openIds: openFetch.rows.map((row) => row.id)
        };
    }

    async function computeNoMission(openIds) {
        if (!openIds) return unavailable('annonces ouvertes indisponibles', { kind: 'snapshot' });
        if (!openIds.length) return { value: 0, available: true, kind: 'snapshot', definition: DEFINITIONS.noConfirmedMission };
        const linked = new Set();
        for (const ids of chunk(openIds, 200)) {
            const part = await fetchAll(() =>
                supabaseAdmin.from('missions').select('related_request_id').in('related_request_id', ids)
            );
            if (!part.available) return unavailable(part.error, { kind: 'snapshot', definition: DEFINITIONS.noConfirmedMission });
            part.rows.forEach((row) => {
                if (row.related_request_id) linked.add(row.related_request_id);
            });
        }
        return {
            value: openIds.filter((id) => !linked.has(id)).length,
            available: true,
            kind: 'snapshot',
            definition: DEFINITIONS.noConfirmedMission
        };
    }

    async function computePayments(start, territory, allowed) {
        if (!allowed) return { available: false, gmv: null, commissions: null, error: 'droits finance insuffisants' };
        if (territory && territory !== 'all') {
            return { available: false, gmv: null, commissions: null, error: 'paiements non territorialisés : filtre territoire refusé' };
        }
        const fetched = await fetchAll(() => {
            let query = supabaseAdmin.from('payments').select('customer_total_cents, lyann_revenue_cents, created_at').eq('payment_status', 'SUCCEEDED');
            if (start) query = query.gte('created_at', start);
            return query.order('created_at', { ascending: true });
        });
        if (!fetched.available) {
            return { available: false, gmv: null, commissions: null, error: fetched.error };
        }
        const gmv = fetched.rows.reduce((sum, row) => sum + Number(row.customer_total_cents || 0), 0) / 100;
        const commissions = fetched.rows.reduce((sum, row) => sum + Number(row.lyann_revenue_cents || 0), 0) / 100;
        return { available: true, gmv, commissions, error: null, rows: fetched.rows.length };
    }

    async function computeContentSplit(territory) {
        const unavailableSplit = (reason, approved) => ({
            approved,
            organic: unavailable(reason),
            administered: unavailable(reason),
            editorial: unavailable(reason),
            unknown: unavailable(reason)
        });
        const approved = await counted(
            applyTerritory(supabaseAdmin.from('bokantaj_posts').select('*', { count: 'exact', head: true }).eq('public_moderation_status', 'approved'), territory)
        );
        if (!approved.available) return unavailableSplit(approved.error, approved);
        if (approved.value > hardCap) return unavailableSplit('jeu tronqué : trop de publications pour classer les auteurs', approved);

        const [reals, seeds, agents, posts] = await Promise.all([
            fetchAll(() => supabaseAdmin.from('profiles').select('id, account_type').eq('account_type', 'real')),
            fetchAll(() => supabaseAdmin.from('profiles').select('id, account_type').eq('account_type', 'seed')),
            fetchAll(() => supabaseAdmin.from('lyann_agents').select('id, linked_profile_id')),
            fetchAll(() =>
                applyTerritory(supabaseAdmin.from('bokantaj_posts').select('id, author_id, source_name').eq('public_moderation_status', 'approved'), territory)
            )
        ]);
        if (!reals.available || !seeds.available || !agents.available || !posts.available) {
            return unavailableSplit(reals.error || seeds.error || agents.error || posts.error, approved);
        }

        const realIds = new Set(reals.rows.map((row) => row.id));
        const seedIds = new Set(seeds.rows.map((row) => row.id));
        const agentIds = new Set(agents.rows.map((row) => row.linked_profile_id).filter(Boolean));
        let organic = 0;
        let administered = 0;
        let editorial = 0;
        let unknown = 0;
        posts.rows.forEach((row) => {
            const author = row.author_id;
            if (author && agentIds.has(author)) editorial += 1;
            else if (author && seedIds.has(author)) administered += 1;
            else if (author && realIds.has(author)) organic += 1;
            else unknown += 1;
        });
        return {
            approved,
            organic: { available: true, value: organic },
            administered: { available: true, value: administered },
            editorial: { available: true, value: editorial },
            unknown: { available: true, value: unknown }
        };
    }

    async function computeKpis(query, { includeFinance = false } = {}) {
        const period = query.period || '30d';
        const territory = query.territory || 'all';
        const key = cacheKey('kpis', { period, territory, includeFinance });
        const cached = readCache(key);
        if (cached) return cached;

        const bounds = periodBounds(period, now());
        const start = bounds.start;
        const db = supabaseAdmin;

        const [
            totalProfiles,
            realMembers,
            seedMembers,
            editorialAgents,
            newRealMembers,
            kycVerified,
            lyanneurs,
            openRequests,
            requestsInPeriod,
            missionsCreated,
            missionsCompleted,
            bokantajPending,
            editorialPending,
            agentApprovals,
            openReports,
            openDisputes,
            openConversations,
            completedProfiles,
            quotesCurrentlyAccepted
        ] = await Promise.all([
            counted(db.from('profiles').select('*', { count: 'exact', head: true })),
            counted(applyTerritory(db.from('profiles').select('*', { count: 'exact', head: true }).eq('account_type', 'real'), territory)),
            counted(db.from('profiles').select('*', { count: 'exact', head: true }).eq('account_type', 'seed')),
            counted(db.from('lyann_agents').select('*', { count: 'exact', head: true })),
            counted(applyTerritory(applyCreatedAt(db.from('profiles').select('*', { count: 'exact', head: true }).eq('account_type', 'real'), start), territory)),
            counted(applyTerritory(db.from('profiles').select('*', { count: 'exact', head: true }).eq('account_type', 'real').eq('kyc_verified', true), territory)),
            counted(applyTerritory(db.from('profiles').select('*', { count: 'exact', head: true }).eq('is_pro', true).eq('account_type', 'real'), territory)),
            counted(applyTerritory(db.from('requests').select('*', { count: 'exact', head: true }).eq('status', 'OPEN'), territory)),
            counted(applyTerritory(applyCreatedAt(db.from('requests').select('*', { count: 'exact', head: true }), start), territory)),
            counted(applyCreatedAt(db.from('missions').select('*', { count: 'exact', head: true }), start)),
            counted(start
                ? db.from('missions').select('id', { count: 'exact', head: true }).gte('completed_at', start)
                : db.from('missions').select('id', { count: 'exact', head: true }).not('completed_at', 'is', null)),
            counted(db.from('bokantaj_posts').select('*', { count: 'exact', head: true }).eq('public_moderation_status', 'pending')),
            counted(db.from('lyann_agent_tasks').select('*', { count: 'exact', head: true }).eq('approval_status', 'PENDING').neq('status', 'CANCELLED')),
            counted(db.from('lyann_agent_tasks').select('*', { count: 'exact', head: true }).eq('status', 'WAITING_APPROVAL')),
            counted(db.from('user_reports').select('*', { count: 'exact', head: true }).eq('status', 'OPEN')),
            counted(db.from('disputes').select('*', { count: 'exact', head: true }).eq('status', 'OPEN')),
            counted(db.from('conversations').select('*', { count: 'exact', head: true })),
            counted(
                applyTerritory(
                    db.from('profiles').select('*', { count: 'exact', head: true })
                        .eq('account_type', 'real')
                        .neq('first_name', '')
                        .neq('last_name', '')
                        .neq('city', '')
                        .not('first_name', 'is', null)
                        .not('last_name', 'is', null)
                        .not('city', 'is', null),
                    territory
                )
            ),
            counted(db.from('quotes').select('*', { count: 'exact', head: true }).eq('status', 'ACCEPTED'))
        ]);

        if (!missionsCompleted.available) {
            missionsCompleted.error = /completed_at|column|42703/i.test(missionsCompleted.error || '')
                ? 'colonne completed_at absente : missions terminées dans la période indisponibles'
                : (missionsCompleted.error || 'colonne completed_at absente ou illisible');
        }

        const [funnel, unanswered, content, payments] = await Promise.all([
            computeFunnel({ start, territory }),
            computeUnanswered(territory),
            computeContentSplit(territory),
            computePayments(start, territory, includeFinance)
        ]);

        const noMission = await computeNoMission(unanswered.available ? unanswered.openIds : null);
        const quotesIssued = funnel.quoteCohortAvailable
            ? { available: true, value: funnel.issuedInPeriod.length }
            : unavailable(funnel.quoteCohortError || 'cohorte devis indisponible');

        const payload = {
            success: true,
            data_available: true,
            generated_at: now().toISOString(),
            period: bounds.label,
            period_key: period,
            period_kind: bounds.kind,
            territory,
            financeIncluded: includeFinance && payments.available,
            definitions: DEFINITIONS,
            metrics: {
                totalProfiles: metric(totalProfiles, { kind: 'snapshot', definition: DEFINITIONS.totalProfiles }),
                realMembers: metric(realMembers, { kind: 'snapshot', definition: DEFINITIONS.realMembers }),
                seedMembers: metric(seedMembers, { kind: 'snapshot', definition: DEFINITIONS.seedMembers }),
                editorialAgents: metric(editorialAgents, { kind: 'snapshot', definition: DEFINITIONS.editorialAgents }),
                newRealMembers: metric(newRealMembers, { kind: 'period', definition: DEFINITIONS.newRealMembers }),
                completedProfiles: metric(completedProfiles, { kind: 'snapshot', definition: DEFINITIONS.completedProfiles }),
                activeMembers: unavailable(DEFINITIONS.activeMembers, { kind: 'unavailable', definition: DEFINITIONS.activeMembers }),
                kycVerified: metric(kycVerified, { kind: 'snapshot' }),
                lyanneurs: metric(lyanneurs, { kind: 'snapshot' }),
                openRequests: metric(openRequests, { kind: 'snapshot', definition: DEFINITIONS.openRequests }),
                requestsInPeriod: metric(requestsInPeriod, { kind: 'period', definition: DEFINITIONS.requestsInPeriod }),
                unanswered24h: unanswered.available
                    ? { value: unanswered.h24, available: true, kind: 'snapshot', definition: DEFINITIONS.unanswered24h }
                    : unavailable(unanswered.error, { kind: 'snapshot', definition: DEFINITIONS.unanswered24h }),
                unanswered48h: unanswered.available
                    ? { value: unanswered.h48, available: true, kind: 'snapshot', definition: DEFINITIONS.unanswered48h }
                    : unavailable(unanswered.error, { kind: 'snapshot', definition: DEFINITIONS.unanswered48h }),
                noFirstContact: unavailable(DEFINITIONS.noFirstContact, { kind: 'unavailable', definition: DEFINITIONS.noFirstContact }),
                noConfirmedMission: noMission,
                quotesIssued: { ...quotesIssued, kind: 'period', definition: DEFINITIONS.quotesIssued },
                quotesSent: { ...quotesIssued, kind: 'period', definition: DEFINITIONS.quotesIssued },
                quotesAccepted: unavailable(DEFINITIONS.quotesAcceptedInPeriod, { kind: 'unavailable', definition: DEFINITIONS.quotesAcceptedInPeriod }),
                quotesCurrentlyAccepted: metric(quotesCurrentlyAccepted, { kind: 'snapshot', definition: DEFINITIONS.quotesCurrentlyAccepted }),
                quotesAcceptedInPeriod: unavailable(DEFINITIONS.quotesAcceptedInPeriod, { kind: 'unavailable', definition: DEFINITIONS.quotesAcceptedInPeriod }),
                missionsCreated: metric(missionsCreated, { kind: 'period', definition: DEFINITIONS.missionsCreated }),
                missionsCompleted: metric(missionsCompleted, { kind: 'period', definition: DEFINITIONS.missionsCompleted }),
                medianFirstQuoteHours: funnel.available && funnel.medianFirstQuoteHours != null
                    ? { value: funnel.medianFirstQuoteHours, available: true, kind: 'cohort', sampleSize: funnel.sampleSize, definition: DEFINITIONS.medianFirstQuoteHours }
                    : unavailable(funnel.available ? 'aucune annonce de la période avec devis admissible' : (funnel.error || 'médiane indisponible'), { kind: 'cohort', definition: DEFINITIONS.medianFirstQuoteHours }),
                bokantajApproved: metric(content.approved, { kind: 'snapshot', definition: DEFINITIONS.bokantajApproved }),
                bokantajOrganic: metric(content.organic, { kind: 'snapshot', definition: DEFINITIONS.bokantajOrganic }),
                bokantajAdministered: metric(content.administered, { kind: 'snapshot', definition: DEFINITIONS.bokantajAdministered }),
                bokantajEditorial: metric(content.editorial, { kind: 'snapshot', definition: DEFINITIONS.bokantajEditorial }),
                bokantajUnknown: metric(content.unknown, { kind: 'snapshot', definition: DEFINITIONS.bokantajUnknown }),
                bokantajPending: metric(bokantajPending, { kind: 'snapshot', definition: DEFINITIONS.bokantajPending }),
                editorialPending: metric(editorialPending, { kind: 'snapshot', definition: DEFINITIONS.editorialPending }),
                agentTaskApprovals: metric(agentApprovals, { kind: 'snapshot', definition: DEFINITIONS.agentTaskApprovals }),
                openReports: metric(openReports, { kind: 'snapshot', definition: DEFINITIONS.openReports }),
                openDisputes: metric(openDisputes, { kind: 'snapshot', definition: DEFINITIONS.openDisputes }),
                conversations: metric(openConversations, { kind: 'snapshot' }),
                conversionRequestToQuote: funnel.available
                    ? { ...funnel.conversionRequestToQuote, kind: 'cohort', definition: DEFINITIONS.conversionRequestToQuote }
                    : unavailable(funnel.error, { kind: 'cohort', definition: DEFINITIONS.conversionRequestToQuote }),
                conversionQuoteToAccept: funnel.conversionQuoteToAccept && funnel.conversionQuoteToAccept.available !== false
                    ? { ...funnel.conversionQuoteToAccept, kind: 'cohort', definition: DEFINITIONS.conversionQuoteToAccept }
                    : unavailable((funnel.conversionQuoteToAccept && funnel.conversionQuoteToAccept.error) || funnel.quoteCohortError, { kind: 'cohort', definition: DEFINITIONS.conversionQuoteToAccept }),
                gmvPeriod: {
                    value: payments.available ? payments.gmv : null,
                    available: payments.available,
                    error: payments.error || null,
                    kind: 'period',
                    definition: DEFINITIONS.gmvPeriod,
                    readonly: true
                },
                collectedCommissions: {
                    value: payments.available ? payments.commissions : null,
                    available: payments.available,
                    error: payments.error || null,
                    kind: 'period',
                    definition: DEFINITIONS.collectedCommissions,
                    readonly: true
                }
            },
            realMembers: realMembers.available ? realMembers.value : null,
            seedMembers: seedMembers.available ? seedMembers.value : null,
            kycVerified: kycVerified.available ? kycVerified.value : null,
            openRequests: openRequests.available ? openRequests.value : null,
            openDisputes: openDisputes.available ? openDisputes.value : null,
            openReports: openReports.available ? openReports.value : null,
            pendingApprovals: editorialPending.available ? editorialPending.value : null,
            activeAgents: editorialAgents.available ? editorialAgents.value : null,
            bokantajPosts: content.approved.available ? content.approved.value : null,
            conversations: openConversations.available ? openConversations.value : null,
            gmvMonth: payments.available ? payments.gmv : null,
            mrrCommissions: payments.available ? payments.commissions : null,
            activeMembers: null,
            activeMissions: missionsCreated.available ? missionsCreated.value : null,
            unavailable: {
                activeMembersReason: DEFINITIONS.activeMembers,
                gmvIsPeriodNotCalendarMonth: period !== 'month',
                calendarMonth: period === 'month',
                commissionsAreNotMrr: true,
                quotesAcceptedAtMissing: true
            }
        };
        return writeCache(key, payload);
    }

    async function computeActions() {
        const key = cacheKey('actions', {});
        const cached = readCache(key);
        if (cached) return cached;

        const errors = [];
        const items = [];
        const add = (item) => {
            if (item && item.count > 0) items.push(item);
        };

        const [pendingPosts, editorial, reports, disputes] = await Promise.all([
            counted(supabaseAdmin.from('bokantaj_posts').select('*', { count: 'exact', head: true }).eq('public_moderation_status', 'pending')),
            counted(supabaseAdmin.from('lyann_agent_tasks').select('*', { count: 'exact', head: true }).eq('approval_status', 'PENDING').neq('status', 'CANCELLED')),
            counted(supabaseAdmin.from('user_reports').select('*', { count: 'exact', head: true }).eq('status', 'OPEN')),
            counted(supabaseAdmin.from('disputes').select('*', { count: 'exact', head: true }).eq('status', 'OPEN'))
        ]);

        const pushCount = (result, item) => {
            if (!result.available) errors.push({ id: item.id, error: result.error });
            else add({ ...item, count: result.value });
        };
        pushCount(pendingPosts, { id: 'moderation-posts', title: 'Publications en attente de modération', section: 'sec-content', priority: 1, kind: 'moderation' });
        pushCount(editorial, { id: 'editorial-pending', title: 'Propositions éditoriales à valider', section: 'sec-editorial', priority: 1, kind: 'editorial' });
        pushCount(reports, { id: 'open-reports', title: 'Signalements ouverts', section: 'sec-content', priority: 2, kind: 'trust' });
        pushCount(disputes, { id: 'open-disputes', title: 'Litiges ouverts', section: 'sec-disputes', priority: 2, kind: 'trust' });

        const failed = await fetchAll(() =>
            supabaseAdmin.from('lyann_agent_tasks').select('id, status, created_at').eq('status', 'FAILED').order('created_at', { ascending: false })
        );
        if (!failed.available) errors.push({ id: 'collect-fail', error: failed.error });
        else {
            failed.rows.slice(0, 8).forEach((row) => {
                items.push({
                    id: `collect-fail-${row.id}`,
                    title: `Échec de collecte agent`,
                    count: 1,
                    section: 'sec-editorial',
                    priority: 3,
                    kind: 'ops',
                    resourceId: row.id
                });
            });
        }

        const unanswered = await computeUnanswered('all');
        if (!unanswered.available) errors.push({ id: 'unanswered-48h', error: unanswered.error });
        else add({
            id: 'unanswered-48h',
            title: 'Annonces sans devis depuis 48 h',
            count: unanswered.h48,
            section: 'sec-requests',
            filter: 'unanswered',
            priority: 3,
            kind: 'marketplace'
        });

        items.sort((a, b) => a.priority - b.priority || b.count - a.count);
        const payload = {
            success: true,
            generated_at: now().toISOString(),
            available: errors.length === 0,
            partial: errors.length > 0 && items.length > 0,
            errors,
            items: items.slice(0, 20)
        };
        return writeCache(key, payload);
    }

    async function computeTerritoryBreakdown(start, territory) {
        if (territory && territory !== 'all') {
            const count = await counted(applyTerritory(applyCreatedAt(supabaseAdmin.from('requests').select('*', { count: 'exact', head: true }), start), territory));
            if (!count.available) return { available: false, rows: [], error: count.error };
            return {
                available: true,
                rows: [{ territory, requests: count.value, open: null, note: 'ouvertures : voir openRequests' }]
            };
        }
        const count = await counted(applyCreatedAt(supabaseAdmin.from('requests').select('*', { count: 'exact', head: true }), start));
        if (!count.available) return { available: false, rows: [], error: count.error };
        if (count.value > hardCap) return { available: false, rows: [], error: 'jeu tronqué : trop d’annonces pour la répartition territoriale' };
        const fetched = await fetchAll(() =>
            applyCreatedAt(supabaseAdmin.from('requests').select('territory, status, created_at'), start).order('created_at', { ascending: true })
        );
        if (!fetched.available) return { available: false, rows: [], error: fetched.error };
        const map = {};
        fetched.rows.forEach((row) => {
            const key = row.territory || 'non renseigné';
            map[key] = map[key] || { territory: key, requests: 0, open: 0 };
            map[key].requests += 1;
            if (row.status === 'OPEN') map[key].open += 1;
        });
        return { available: true, rows: Object.values(map) };
    }

    function register(app) {
        app.get('/v1/admin/kpis', async (req, res) => {
            const auth = await requireAdmin(req, res);
            if (!auth) return;
            try {
                const includeFinance = await canSeeFinance(req, auth);
                res.json(await computeKpis(req.query || {}, { includeFinance }));
            } catch (error) {
                console.error('Admin KPIs v3.1:', error);
                res.status(503).json({ success: false, data_available: false, error: 'Données temporairement indisponibles' });
            }
        });

        app.get('/v1/admin/control-center', async (req, res) => {
            const auth = await requireAdmin(req, res);
            if (!auth) return;
            try {
                const includeFinance = await canSeeFinance(req, auth);
                const [kpis, actions] = await Promise.all([
                    computeKpis(req.query || {}, { includeFinance }),
                    computeActions()
                ]);
                res.json({
                    success: true,
                    generated_at: now().toISOString(),
                    kpis,
                    actions: actions.items,
                    actionQueue: actions,
                    financeLocked: true,
                    financeIncluded: includeFinance
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
                res.status(503).json({ success: false, available: false, error: 'File d’action indisponible' });
            }
        });

        app.get('/v1/admin/marketplace-stats', async (req, res) => {
            const auth = await requireAdmin(req, res);
            if (!auth) return;
            try {
                const includeFinance = await canSeeFinance(req, auth);
                const kpis = await computeKpis(req.query || {}, { includeFinance });
                const m = kpis.metrics;
                const byTerritory = await computeTerritoryBreakdown(periodBounds(req.query.period || '30d', now()).start, req.query.territory || 'all');
                res.json({
                    success: true,
                    generated_at: kpis.generated_at,
                    period: kpis.period,
                    period_kind: kpis.period_kind,
                    territory: kpis.territory,
                    metrics: {
                        realMembers: m.realMembers,
                        seedMembers: m.seedMembers,
                        editorialAgents: m.editorialAgents,
                        newRealMembers: m.newRealMembers,
                        completedProfiles: m.completedProfiles,
                        activeMembers: m.activeMembers,
                        requestsInPeriod: m.requestsInPeriod,
                        openRequests: m.openRequests,
                        unanswered24h: m.unanswered24h,
                        unanswered48h: m.unanswered48h,
                        noFirstContact: m.noFirstContact,
                        noConfirmedMission: m.noConfirmedMission,
                        medianFirstQuoteHours: m.medianFirstQuoteHours,
                        quotesIssued: m.quotesIssued,
                        quotesSent: m.quotesSent,
                        quotesAccepted: m.quotesAccepted,
                        quotesAcceptedInPeriod: m.quotesAcceptedInPeriod,
                        missionsCreated: m.missionsCreated,
                        missionsCompleted: m.missionsCompleted,
                        conversionRequestToQuote: m.conversionRequestToQuote,
                        conversionQuoteToAccept: m.conversionQuoteToAccept,
                        bokantajOrganic: m.bokantajOrganic,
                        bokantajAdministered: m.bokantajAdministered,
                        bokantajEditorial: m.bokantajEditorial,
                        bokantajUnknown: m.bokantajUnknown
                    },
                    byTerritory: byTerritory.available ? byTerritory.rows : [],
                    byTerritoryAvailable: byTerritory.available,
                    byTerritoryError: byTerritory.error || null,
                    missingInstrumentation: [
                        { event: 'session_started', why: 'Mesurer un membre réellement actif sans déduire depuis l’existence du profil.' },
                        { event: 'request_first_viewed', why: 'Mesurer un premier contact vérifiable, distinct d’un devis.' },
                        { event: 'quote_accepted_at', why: 'Filtrer les acceptations sur la date d’acceptation plutôt que le statut actuel.' }
                    ]
                });
            } catch (error) {
                res.status(503).json({ success: false, error: 'Statistiques marketplace indisponibles' });
            }
        });
    }

    return {
        register,
        computeKpis,
        computeActions,
        computePayments,
        computeFunnel,
        computeUnanswered,
        canSeeFinance,
        clearCache: () => cache.clear()
    };
}

function registerAdminControlCenter(app, deps) {
    createControlCenter(deps).register(app);
}

module.exports = {
    registerAdminControlCenter,
    createControlCenter,
    DEFINITIONS,
    periodBounds,
    ADMISSIBLE_QUOTE
};
