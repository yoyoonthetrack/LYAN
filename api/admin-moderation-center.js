'use strict';

const SUBJECT_TABLES = Object.freeze({
    post: 'bokantaj_posts',
    comment: 'bokantaj_comments',
    request: 'requests'
});

const REPORT_LABELS = Object.freeze({
    OPEN: 'Nouveau',
    PENDING: 'Nouveau',
    IN_REVIEW: 'En cours d’examen',
    RESOLVED: 'Résolu',
    DISMISSED: 'Classé sans suite'
});

const USER_REPORT_STATUSES = ['OPEN', 'IN_REVIEW', 'RESOLVED', 'DISMISSED'];
const BOK_REPORT_STATUSES = ['PENDING', 'IN_REVIEW', 'RESOLVED', 'DISMISSED'];

function normalizeDecision(raw) {
    const value = String(raw || '').toLowerCase();
    if (value === 'approve' || value === 'approved') return 'approved';
    if (value === 'reject' || value === 'rejected') return 'rejected';
    if (value === 'hide' || value === 'hidden') return 'hide';
    if (value === 'restore' || value === 'restored') return 'restore';
    return null;
}

function displayStatus(row) {
    const status = row && row.public_moderation_status;
    const decision = row && row.human_decision;
    if (decision === 'hide') return { key: 'hidden', label: 'Masqué', visible: false };
    if (status === 'approved') return { key: 'approved', label: 'Approuvé', visible: true };
    if (status === 'pending') return { key: 'pending', label: 'À vérifier', visible: false };
    if (status === 'rejected') return { key: 'rejected', label: 'Refusé', visible: false };
    return { key: status || 'unknown', label: status || 'Inconnu', visible: false };
}

function excerpt(value, max = 180) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    return text.length > max ? `${text.slice(0, max)}…` : text;
}

function profileName(row) {
    if (!row) return '—';
    const name = `${row.first_name || ''} ${row.last_name || ''}`.trim();
    return name || 'Membre';
}

function parseDurationHours(raw) {
    if (raw === '24h' || raw === 24) return 24;
    if (raw === '7d' || raw === 168) return 168;
    if (raw === '30d' || raw === 720) return 720;
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0 && n <= 24 * 365) return Math.round(n);
    return null;
}

function authBanDuration(kind, hours) {
    if (kind === 'ban') return '876000h';
    if (kind === 'suspend') return `${Math.max(1, hours || 24)}h`;
    if (kind === 'lift') return 'none';
    return null;
}

const RESTRICTION_LABELS = Object.freeze({
    none: 'Normal',
    warned: 'Averti',
    suspended: 'Suspendu',
    banned: 'Banni',
    expired: 'Expiré'
});

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isUserId(value) {
    return UUID_RE.test(String(value || '').trim());
}

function restrictionLabel(status) {
    return RESTRICTION_LABELS[status] || RESTRICTION_LABELS.none;
}

function restrictionFromSanctions(profile) {
    if (!profile) return { restricted: false, status: 'none', label: restrictionLabel('none'), until: null, reason: null };
    if (profile.restriction_status === 'banned') {
        return {
            restricted: true,
            status: 'banned',
            label: restrictionLabel('banned'),
            until: null,
            reason: profile.restriction_reason || null
        };
    }
    if (profile.restriction_status === 'suspended') {
        const until = profile.restricted_until ? new Date(profile.restricted_until) : null;
        if (!until || until.getTime() > Date.now()) {
            return {
                restricted: true,
                status: 'suspended',
                label: restrictionLabel('suspended'),
                until: profile.restricted_until || null,
                reason: profile.restriction_reason || null
            };
        }
        return {
            restricted: false,
            status: 'expired',
            label: restrictionLabel('expired'),
            until: profile.restricted_until,
            reason: profile.restriction_reason || null
        };
    }
    const status = profile.restriction_status || 'none';
    return {
        restricted: status === 'warned',
        status,
        label: restrictionLabel(status),
        until: profile.restricted_until || null,
        reason: profile.restriction_reason || null
    };
}

function sanitizeSearch(raw) {
    return String(raw || '').trim().replace(/[%_,.()]/g, ' ').replace(/\s+/g, ' ').slice(0, 80);
}

function decorateUser(row, sanctions) {
    const restriction = restrictionFromSanctions(row);
    return {
        id: row.id,
        name: profileName(row),
        first_name: row.first_name || '',
        last_name: row.last_name || '',
        city: row.city || null,
        territory: row.territory || null,
        created_at: row.created_at || null,
        restriction_status: restriction.status,
        restriction,
        sanctions: sanctions || []
    };
}

function createModerationCenter(deps) {
    const supabaseAdmin = deps && deps.supabaseAdmin;
    const verifyAdminPermission = deps && deps.verifyAdminPermission;
    const recordAudit = deps && deps.recordAudit;

    async function audit(actorId, action, targetType, targetId, before, after, reason, result) {
        const payload = {
            actor_type: 'ADMIN',
            actor_id: actorId,
            actor_name: 'Modération',
            action,
            module_name: 'Modération',
            target_type: targetType,
            target_id: targetId || null,
            before_state: before || null,
            after_state: after || null,
            reason: reason ? String(reason).slice(0, 500) : null,
            metadata: { result: result || 'ok' }
        };
        try {
            const inserted = await supabaseAdmin.from('admin_audit_events').insert(payload);
            if (inserted && inserted.error && typeof recordAudit === 'function') {
                await recordAudit(actorId, action, targetId, { targetType, result });
            }
            return !(inserted && inserted.error);
        } catch (_) {
            if (typeof recordAudit === 'function') {
                await recordAudit(actorId, action, targetId, { targetType, result });
            }
            return false;
        }
    }

    async function loadProfiles(ids) {
        const unique = [...new Set((ids || []).filter(Boolean))];
        if (!unique.length) return {};
        const result = await supabaseAdmin
            .from('profiles')
            .select('id, first_name, last_name, city, territory, restriction_status, restricted_until, account_type')
            .in('id', unique);
        const map = {};
        (result.data || []).forEach((row) => { map[row.id] = row; });
        return map;
    }

    async function loadJobsFor(subjectType, ids) {
        if (!ids.length) return {};
        const result = await supabaseAdmin
            .from('moderation_jobs')
            .select('subject_type, subject_id, status, reason_code, finished_at, created_at, attempts')
            .eq('subject_type', subjectType)
            .in('subject_id', ids)
            .order('created_at', { ascending: false })
            .limit(200);
        const map = {};
        (result.data || []).forEach((row) => {
            const key = `${row.subject_type}:${row.subject_id}`;
            if (!map[key]) map[key] = [];
            map[key].push(row);
        });
        return map;
    }

    async function loadReportsFor(ids) {
        const postIds = ids.posts || [];
        const commentIds = ids.comments || [];
        const userIds = ids.users || [];
        const [bok, user] = await Promise.all([
            postIds.length || commentIds.length
                ? supabaseAdmin.from('bokantaj_reports').select('id, post_id, comment_id, request_id, reason, status, created_at, reporter_id').limit(200)
                : { data: [], error: null },
            userIds.length
                ? supabaseAdmin.from('user_reports').select('id, reporter_id, target_user_id, reason, details, status, created_at').in('target_user_id', userIds).limit(200)
                : { data: [], error: null }
        ]);
        return {
            bokantaj: (bok.data || []).filter((row) => (
                (row.post_id && postIds.includes(row.post_id))
                || (row.comment_id && commentIds.includes(row.comment_id))
            )),
            users: user.data || []
        };
    }

    async function applyContentDecision({ subject, id, decision, reason, actorId }) {
        const table = SUBJECT_TABLES[subject];
        if (!table) return { ok: false, status: 404, error: 'Sujet inconnu.' };
        const existing = await supabaseAdmin.from(table).select('*').eq('id', id).maybeSingle();
        if (existing.error) return { ok: false, status: 500, error: 'Lecture du contenu impossible.' };
        if (!existing.data) return { ok: false, status: 404, error: 'Contenu introuvable.' };
        const row = existing.data;
        const before = {
            public_moderation_status: row.public_moderation_status,
            human_moderation_lock: !!row.human_moderation_lock,
            human_decision: row.human_decision || null
        };
        let patch;
        if (decision === 'approved') {
            patch = {
                public_moderation_status: 'approved',
                human_moderation_lock: false,
                human_decision: 'approve'
            };
        } else if (decision === 'rejected') {
            patch = {
                public_moderation_status: 'rejected',
                human_moderation_lock: true,
                human_decision: 'reject',
                previous_public_status: row.public_moderation_status
            };
        } else if (decision === 'hide') {
            patch = {
                public_moderation_status: 'rejected',
                human_moderation_lock: true,
                human_decision: 'hide',
                previous_public_status: row.public_moderation_status
            };
        } else if (decision === 'restore') {
            const next = row.human_decision === 'hide' || row.previous_public_status === 'approved'
                ? 'approved'
                : (row.previous_public_status === 'pending' ? 'pending' : 'approved');
            patch = {
                public_moderation_status: next,
                human_moderation_lock: false,
                human_decision: 'restore'
            };
        }
        let updated = await supabaseAdmin.from(table).update(patch).eq('id', id).select('*').maybeSingle();
        if (updated.error && /human_moderation_lock|human_decision|previous_public_status/i.test(updated.error.message || '')) {
            return { ok: false, status: 503, error: 'Migration de modération absente : impossible de garantir le verrou humain.' };
        }
        if (updated.error) return { ok: false, status: 500, error: 'Décision non enregistrée.' };
        if (!updated.data) return { ok: false, status: 404, error: 'Contenu introuvable.' };
        const after = {
            public_moderation_status: updated.data.public_moderation_status,
            human_moderation_lock: !!updated.data.human_moderation_lock,
            human_decision: updated.data.human_decision || null
        };
        if (decision === 'approved' && after.public_moderation_status !== 'approved') {
            return {
                ok: false,
                status: 409,
                error: 'Le verrou humain a empêché la republication. Lever le verrou explicitement via restaurer.'
            };
        }
        if ((decision === 'hide' || decision === 'rejected') && after.public_moderation_status === 'approved') {
            return {
                ok: false,
                status: 409,
                error: 'Le trigger de modération a empêché le retrait d’un contenu déjà visible. Appliquer 73_moderation_center.sql sur Staging.'
            };
        }
        await supabaseAdmin.from('moderation_jobs').update({
            status: 'done',
            reason_code: `admin_${decision}`,
            finished_at: new Date().toISOString()
        }).eq('subject_type', subject).eq('subject_id', id);
        const stored = await audit(actorId, 'CONTENT_MODERATION', subject, id, before, after, reason, 'ok');
        const shown = displayStatus(updated.data);
        return {
            ok: true,
            status: 200,
            row: decorateContent(updated.data, subject),
            visible: shown.visible,
            audit_stored: stored
        };
    }

    function decorateContent(row, subject) {
        const shown = displayStatus(row);
        return {
            id: row.id,
            subject,
            author_id: row.author_id || row.requester_id || null,
            post_id: row.post_id || null,
            content: row.content || row.title || '',
            excerpt: excerpt(row.content_pending || row.content || row.title || row.description),
            media_urls: row.media_urls || (row.media_url ? [row.media_url] : []),
            territory: row.territory || row.location || null,
            city: row.city || null,
            created_at: row.created_at || null,
            public_moderation_status: row.public_moderation_status,
            human_moderation_lock: !!row.human_moderation_lock,
            human_decision: row.human_decision || null,
            status_key: shown.key,
            status_label: shown.label,
            visible: shown.visible
        };
    }

    async function loadUserRecord(userId) {
        const profile = await supabaseAdmin
            .from('profiles')
            .select('id, first_name, last_name, city, territory, restriction_status, restricted_until, restriction_reason, created_at, account_type')
            .eq('id', userId)
            .maybeSingle();
        if (profile.error || !profile.data) return null;
        const sanctions = await supabaseAdmin
            .from('account_sanctions')
            .select('id, user_id, kind, reason, created_at, ends_at, active, duration_hours')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(50);
        return decorateUser(profile.data, sanctions.data || []);
    }

    async function listUsers({ q, status, territory, page, pageSize, selectedId }) {
        const from = (page - 1) * pageSize;
        const to = from + pageSize - 1;
        let query = supabaseAdmin
            .from('profiles')
            .select('id, first_name, last_name, city, territory, restriction_status, restricted_until, restriction_reason, created_at, account_type', { count: 'exact' })
            .order('created_at', { ascending: false })
            .order('id', { ascending: false })
            .range(from, to);
        if (status && status !== 'all') query = query.eq('restriction_status', status);
        if (territory && territory !== 'all') query = query.eq('territory', territory);
        const needle = sanitizeSearch(q);
        if (needle && isUserId(needle)) {
            query = supabaseAdmin
                .from('profiles')
                .select('id, first_name, last_name, city, territory, restriction_status, restricted_until, restriction_reason, created_at, account_type', { count: 'exact' })
                .eq('id', needle)
                .order('id', { ascending: true });
        } else if (needle) {
            query = query.or(`first_name.ilike.%${needle}%,last_name.ilike.%${needle}%,city.ilike.%${needle}%`);
        }
        const result = await query;
        if (result.error) return { error: result.error };
        let rows = result.data || [];
        if (selectedId && isUserId(selectedId) && !rows.some((row) => row.id === selectedId)) {
            const extra = await supabaseAdmin
                .from('profiles')
                .select('id, first_name, last_name, city, territory, restriction_status, restricted_until, restriction_reason, created_at, account_type')
                .eq('id', selectedId)
                .maybeSingle();
            if (extra.data) rows = [extra.data, ...rows];
        }
        const ids = rows.map((row) => row.id);
        const sanctions = ids.length
            ? await supabaseAdmin
                .from('account_sanctions')
                .select('id, user_id, kind, reason, created_at, ends_at, active, duration_hours')
                .in('user_id', ids)
                .order('created_at', { ascending: false })
                .limit(400)
            : { data: [] };
        const byUser = {};
        (sanctions.data || []).forEach((row) => {
            if (!byUser[row.user_id]) byUser[row.user_id] = [];
            byUser[row.user_id].push(row);
        });
        return {
            rows: rows.map((row) => decorateUser(row, byUser[row.id] || [])),
            page,
            page_size: pageSize,
            total: typeof result.count === 'number' ? result.count : rows.length,
            selected_id: selectedId && isUserId(selectedId) ? selectedId : null
        };
    }

    async function applySanction({ userId, kind, reason, duration, actorId }) {
        if (!reason || !String(reason).trim()) {
            return { ok: false, status: 400, error: 'Un motif est obligatoire.' };
        }
        if (userId === actorId) {
            return { ok: false, status: 403, error: 'Impossible de sanctionner son propre compte.' };
        }
        const [profileRes, adminRes, missionsRes] = await Promise.all([
            supabaseAdmin.from('profiles').select('id, first_name, last_name, restriction_status, restricted_until, restriction_reason').eq('id', userId).maybeSingle(),
            supabaseAdmin.from('admin_members').select('id, status').eq('user_id', userId).eq('status', 'ACTIVE').maybeSingle(),
            supabaseAdmin.from('missions').select('id, status').or(`requester_id.eq.${userId},provider_id.eq.${userId}`).limit(20)
        ]);
        if (profileRes.error && /restriction_status|restricted_until|restriction_reason/i.test(profileRes.error.message || '')) {
            const fallback = await supabaseAdmin.from('profiles').select('id, first_name, last_name').eq('id', userId).maybeSingle();
            if (fallback.error) return { ok: false, status: 500, error: 'Lecture du profil impossible.' };
            profileRes.data = fallback.data ? { ...fallback.data, restriction_status: 'none', restricted_until: null } : null;
            profileRes.error = null;
        }
        if (profileRes.error) return { ok: false, status: 500, error: 'Lecture du profil impossible.' };
        if (!profileRes.data) return { ok: false, status: 404, error: 'Profil introuvable.' };
        if (adminRes.data) return { ok: false, status: 403, error: 'Un administrateur actif ne peut pas être sanctionné ici.' };

        const hours = kind === 'suspend' ? parseDurationHours(duration) : null;
        if (kind === 'suspend' && !hours) {
            return { ok: false, status: 400, error: 'Durée de suspension requise (24h, 7j ou 30j).' };
        }
        const now = new Date();
        const endsAt = kind === 'suspend' ? new Date(now.getTime() + hours * 3600 * 1000).toISOString() : null;
        const before = {
            restriction_status: profileRes.data.restriction_status,
            restricted_until: profileRes.data.restricted_until || null
        };
        let nextStatus = profileRes.data.restriction_status;
        let nextUntil = profileRes.data.restricted_until || null;
        if (kind === 'warning') nextStatus = profileRes.data.restriction_status === 'none' ? 'warned' : profileRes.data.restriction_status;
        if (kind === 'suspend') {
            nextStatus = 'suspended';
            nextUntil = endsAt;
        }
        if (kind === 'ban') {
            nextStatus = 'banned';
            nextUntil = null;
        }
        if (kind === 'lift') {
            nextStatus = 'none';
            nextUntil = null;
        }

        const patch = {
            restriction_status: nextStatus,
            restricted_until: nextUntil,
            restriction_reason: kind === 'lift' ? null : String(reason).slice(0, 500),
            updated_at: now.toISOString()
        };
        let updated = await supabaseAdmin.from('profiles').update(patch).eq('id', userId).select('id, restriction_status, restricted_until').maybeSingle();
        if (updated.error && /restriction_status|restricted_until|restriction_reason/i.test(updated.error.message || '')) {
            return { ok: false, status: 503, error: 'Migration de sanctions absente : suspension non appliquée en base.' };
        }
        if (updated.error || !updated.data) {
            return { ok: false, status: 500, error: 'Sanction non enregistrée sur le profil.' };
        }

        const authDuration = authBanDuration(kind, hours);
        let authResult = { attempted: false, ok: true };
        if (authDuration && supabaseAdmin.auth && supabaseAdmin.auth.admin) {
            authResult.attempted = true;
            try {
                const banned = await supabaseAdmin.auth.admin.updateUserById(userId, { ban_duration: authDuration });
                if (banned && banned.error) authResult = { attempted: true, ok: false, error: banned.error.message };
                if (kind !== 'warning' && typeof supabaseAdmin.auth.admin.signOut === 'function') {
                    const signed = await supabaseAdmin.auth.admin.signOut(userId, 'global');
                    if (signed && signed.error) authResult.sessions = 'partial';
                    else authResult.sessions = 'revoked';
                }
            } catch (err) {
                authResult = { attempted: true, ok: false, error: err.message || 'auth_update_failed' };
            }
        }

        if (kind === 'lift') {
            await supabaseAdmin.from('account_sanctions').update({
                active: false,
                lifted_at: now.toISOString(),
                lifted_by: actorId,
                lift_reason: String(reason).slice(0, 500)
            }).eq('user_id', userId).eq('active', true);
        }

        const sanctionRow = {
            user_id: userId,
            kind,
            duration_hours: hours,
            ends_at: endsAt,
            reason: String(reason).slice(0, 500),
            actor_id: actorId,
            active: kind !== 'lift',
            open_missions: (missionsRes.data || []).length
        };
        const inserted = await supabaseAdmin.from('account_sanctions').insert(sanctionRow);
        if (inserted && inserted.error && !/account_sanctions|schema cache|does not exist/i.test(inserted.error.message || '')) {
            return { ok: false, status: 500, error: 'Historique de sanction non enregistré.' };
        }

        const after = {
            restriction_status: updated.data.restriction_status,
            restricted_until: updated.data.restricted_until,
            restriction_reason: kind === 'lift' ? null : String(reason).slice(0, 500)
        };
        const authFailed = Boolean(authResult.attempted && authResult.ok === false);
        await audit(actorId, 'ACCOUNT_SANCTION', 'user', userId, before, after, reason, authFailed ? 'partial' : 'ok');
        const user = await loadUserRecord(userId);
        const restriction = user ? user.restriction : restrictionFromSanctions({ ...updated.data, restriction_reason: after.restriction_reason });
        let note;
        if (authFailed && kind === 'lift') {
            note = 'Le profil n’est plus restreint en base, mais Auth n’a pas confirmé le déban. Relancer la levée pour aligner Auth.';
        } else if (authFailed) {
            note = `Le compte est ${restriction.label.toLowerCase()} en base, mais Auth n’a pas confirmé. Les écritures restent bloquées. Relancer la mesure.`;
        } else if (kind === 'lift') {
            note = 'Sanction levée. Les écritures sont de nouveau autorisées.';
        } else if (kind === 'warning') {
            note = 'Avertissement enregistré. Stripe n’est pas modifié.';
        } else {
            note = `Compte ${restriction.label.toLowerCase()}. Les écritures publiques sont bloquées. Stripe n’est pas modifié.`;
            if (restriction.until) note += ` Échéance : ${restriction.until}.`;
        }
        return {
            ok: true,
            complete: !authFailed,
            partial: authFailed,
            status: authFailed ? 207 : 200,
            restriction,
            user,
            auth: authResult,
            open_missions: (missionsRes.data || []).length,
            stripe_untouched: true,
            retry_auth: authFailed,
            note
        };
    }

    async function snapshotEngine() {
        const jobs = await supabaseAdmin
            .from('moderation_jobs')
            .select('id, status, reason_code, finished_at')
            .order('id', { ascending: false })
            .limit(200);
        if (jobs.error) {
            return { available: false, error: 'État du moteur indisponible.' };
        }
        const rows = jobs.data || [];
        const counts = { analyzed: rows.length, approved: 0, rejected: 0, pending: 0, held: 0, errors: 0 };
        let lastSuccess = null;
        let delaySum = 0;
        let delayN = 0;
        rows.forEach((row) => {
            if (row.reason_code === 'approved' || row.reason_code === 'admin_approved') counts.approved += 1;
            else if (row.reason_code === 'rejected' || row.reason_code === 'admin_rejected') counts.rejected += 1;
            if (['queued', 'running', 'retry'].includes(row.status)) counts.pending += 1;
            if (row.status === 'held') counts.held += 1;
            if (row.reason_code === 'unavailable' || row.status === 'retry') counts.errors += 1;
            if (row.status === 'done' && row.finished_at) {
                if (!lastSuccess || row.finished_at > lastSuccess) lastSuccess = row.finished_at;
                if (row.created_at) {
                    delaySum += new Date(row.finished_at) - new Date(row.created_at);
                    delayN += 1;
                }
            }
        });
        return {
            available: true,
            counts,
            last_success_at: lastSuccess,
            median_delay_ms: delayN ? Math.round(delaySum / delayN) : null,
            promise: 'Le délai affiché est mesuré sur les jobs récents, pas une garantie de quelques secondes.'
        };
    }

    function register(app) {
        app.get('/v1/admin/moderation-center', async (req, res) => {
            const authResult = await verifyAdminPermission(req, 'moderation.manage');
            if (!authResult.authorized) {
                return res.status(authResult.status).json({ success: false, error: authResult.error });
            }
            const tab = String(req.query.tab || 'queue');
            const status = String(req.query.status || 'all');
            const territory = String(req.query.territory || 'all').toLowerCase();
            const q = String(req.query.q || '').trim().toLowerCase();
            const since = req.query.since || null;
            const author = req.query.author || null;

            try {
                if (tab === 'engine') {
                    const engine = await snapshotEngine();
                    return res.json({ success: true, tab, engine });
                }

                if (tab === 'users') {
                    const usersAuth = await verifyAdminPermission(req, 'users.manage');
                    if (!usersAuth.authorized) {
                        return res.status(usersAuth.status).json({ success: false, error: usersAuth.error });
                    }
                    const page = Math.max(1, Number(req.query.page) || 1);
                    const pageSize = Math.min(80, Math.max(10, Number(req.query.page_size) || 40));
                    const listed = await listUsers({
                        q,
                        status,
                        territory,
                        page,
                        pageSize,
                        selectedId: req.query.selected || req.query.user_id || null
                    });
                    if (listed.error) return res.status(503).json({ success: false, error: 'Liste membres indisponible.' });
                    return res.json({
                        success: true,
                        tab,
                        engine: await snapshotEngine(),
                        rows: listed.rows,
                        page: listed.page,
                        page_size: listed.page_size,
                        total: listed.total,
                        selected_id: listed.selected_id
                    });
                }

                if (tab === 'reports') {
                    const [userReports, bokReports] = await Promise.all([
                        supabaseAdmin.from('user_reports').select('id, reporter_id, target_user_id, reason, details, status, created_at').order('created_at', { ascending: false }).limit(80),
                        supabaseAdmin.from('bokantaj_reports').select('id, reporter_id, post_id, comment_id, request_id, reason, status, created_at').order('created_at', { ascending: false }).limit(80)
                    ]);
                    if (userReports.error && bokReports.error) {
                        return res.status(503).json({ success: false, error: 'Signalements indisponibles.' });
                    }
                    const profiles = await loadProfiles([
                        ...(userReports.data || []).flatMap((row) => [row.reporter_id, row.target_user_id]),
                        ...(bokReports.data || []).map((row) => row.reporter_id)
                    ]);
                    const mapped = [
                        ...(userReports.data || []).map((row) => ({
                            id: row.id,
                            source: 'user',
                            status: row.status,
                            status_label: REPORT_LABELS[row.status] || row.status,
                            reason: row.reason,
                            details: row.details || null,
                            created_at: row.created_at,
                            reporter_name: profileName(profiles[row.reporter_id]),
                            target_type: 'user',
                            target_id: row.target_user_id,
                            target_name: profileName(profiles[row.target_user_id])
                        })),
                        ...(bokReports.data || []).map((row) => ({
                            id: row.id,
                            source: 'bokantaj',
                            status: row.status,
                            status_label: REPORT_LABELS[row.status] || row.status,
                            reason: row.reason,
                            details: null,
                            created_at: row.created_at,
                            reporter_name: profileName(profiles[row.reporter_id]),
                            target_type: row.post_id ? 'post' : (row.comment_id ? 'comment' : 'request'),
                            target_id: row.post_id || row.comment_id || row.request_id
                        }))
                    ].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
                    return res.json({ success: true, tab, engine: await snapshotEngine(), rows: mapped });
                }

                const table = tab === 'comments' ? 'bokantaj_comments' : 'bokantaj_posts';
                const subject = tab === 'comments' ? 'comment' : 'post';
                let query = supabaseAdmin.from(table).select('*').order('created_at', { ascending: false }).limit(80);
                if (tab === 'queue') {
                    query = supabaseAdmin.from('bokantaj_posts').select('*').eq('public_moderation_status', 'pending').order('created_at', { ascending: false }).limit(50);
                } else if (status === 'hidden') {
                    query = query.eq('human_decision', 'hide');
                } else if (status !== 'all') {
                    query = query.eq('public_moderation_status', status);
                }
                if (territory !== 'all' && tab !== 'comments') query = query.eq('territory', territory);
                if (author) query = query.eq('author_id', author);
                if (since) query = query.gte('created_at', since);
                const result = await query;
                if (result.error) return res.status(503).json({ success: false, error: 'File de modération indisponible.' });
                let rows = result.data || [];
                if (q) rows = rows.filter((row) => excerpt(row.content || row.content_pending || '', 400).toLowerCase().includes(q));

                let pendingComments = [];
                if (tab === 'queue') {
                    const comments = await supabaseAdmin.from('bokantaj_comments').select('*').eq('public_moderation_status', 'pending').order('created_at', { ascending: false }).limit(50);
                    if (!comments.error) pendingComments = comments.data || [];
                }

                const authorIds = [...rows, ...pendingComments].map((row) => row.author_id);
                const profiles = await loadProfiles(authorIds);
                const jobs = await loadJobsFor(subject, rows.map((row) => row.id));
                const reports = await loadReportsFor({
                    posts: (tab === 'comments' ? [] : rows.map((row) => row.id)),
                    comments: (tab === 'comments' ? rows.map((row) => row.id) : pendingComments.map((row) => row.id))
                });

                const decorate = (row, kind) => {
                    const item = decorateContent(row, kind);
                    item.author_name = profileName(profiles[row.author_id]);
                    item.history = jobs[`${kind}:${row.id}`] || [];
                    item.reports = (kind === 'post'
                        ? reports.bokantaj.filter((rep) => rep.post_id === row.id)
                        : reports.bokantaj.filter((rep) => rep.comment_id === row.id));
                    return item;
                };

                const engine = await snapshotEngine();
                return res.json({
                    success: true,
                    tab,
                    engine,
                    rows: rows.map((row) => decorate(row, tab === 'comments' ? 'comment' : 'post')),
                    extra: tab === 'queue' ? pendingComments.map((row) => decorate(row, 'comment')) : []
                });
            } catch (err) {
                return res.status(503).json({ success: false, error: err.message || 'Console de modération indisponible.' });
            }
        });

        app.get('/v1/admin/moderation-center/users/:id', async (req, res) => {
            const usersAuth = await verifyAdminPermission(req, 'users.manage');
            if (!usersAuth.authorized) {
                return res.status(usersAuth.status).json({ success: false, error: usersAuth.error });
            }
            if (!isUserId(req.params.id)) {
                return res.status(400).json({ success: false, error: 'Identifiant utilisateur invalide.' });
            }
            const user = await loadUserRecord(req.params.id);
            if (!user) return res.status(404).json({ success: false, error: 'Compte introuvable.' });
            return res.json({ success: true, user });
        });

        app.get('/v1/admin/moderation-center/:subject/:id', async (req, res) => {
            const authResult = await verifyAdminPermission(req, 'moderation.manage');
            if (!authResult.authorized) {
                return res.status(authResult.status).json({ success: false, error: authResult.error });
            }
            const subject = String(req.params.subject);
            const table = SUBJECT_TABLES[subject];
            if (!table) return res.status(404).json({ success: false, error: 'Sujet inconnu.' });
            const existing = await supabaseAdmin.from(table).select('*').eq('id', req.params.id).maybeSingle();
            if (existing.error) return res.status(503).json({ success: false, error: 'Détail indisponible.' });
            if (!existing.data) return res.status(404).json({ success: false, error: 'Contenu introuvable.' });
            const profiles = await loadProfiles([existing.data.author_id, existing.data.requester_id]);
            const jobs = await loadJobsFor(subject, [existing.data.id]);
            const reports = await loadReportsFor({
                posts: subject === 'post' ? [existing.data.id] : [],
                comments: subject === 'comment' ? [existing.data.id] : []
            });
            const auditRows = await supabaseAdmin
                .from('admin_audit_events')
                .select('id, action, before_state, after_state, reason, created_at, actor_id')
                .eq('target_id', req.params.id)
                .order('created_at', { ascending: false })
                .limit(20);
            const item = decorateContent(existing.data, subject);
            item.author_name = profileName(profiles[existing.data.author_id || existing.data.requester_id]);
            item.history = jobs[`${subject}:${existing.data.id}`] || [];
            item.reports = subject === 'post'
                ? reports.bokantaj.filter((row) => row.post_id === existing.data.id)
                : reports.bokantaj.filter((row) => row.comment_id === existing.data.id);
            item.audit = auditRows.data || [];
            return res.json({ success: true, row: item });
        });

        app.post('/v1/admin/moderation-center/content/:subject/:id', async (req, res) => {
            const authResult = await verifyAdminPermission(req, 'moderation.manage');
            if (!authResult.authorized) {
                return res.status(authResult.status).json({ success: false, error: authResult.error });
            }
            const decision = normalizeDecision(req.body && req.body.decision);
            if (!decision) return res.status(400).json({ success: false, error: 'Décision attendue : approve, reject, hide ou restore.' });
            const result = await applyContentDecision({
                subject: req.params.subject,
                id: req.params.id,
                decision,
                reason: req.body && req.body.reason,
                actorId: authResult.userId
            });
            if (!result.ok) return res.status(result.status).json({ success: false, error: result.error });
            return res.json({
                success: true,
                row: result.row,
                visible: result.visible,
                audit_stored: result.audit_stored
            });
        });

        app.post('/v1/admin/moderation-center/users/:id/sanction', async (req, res) => {
            const authResult = await verifyAdminPermission(req, 'users.manage');
            if (!authResult.authorized) {
                return res.status(authResult.status).json({ success: false, error: authResult.error });
            }
            const kind = String(req.body && req.body.kind || '').toLowerCase();
            if (!['warning', 'suspend', 'ban', 'lift'].includes(kind)) {
                return res.status(400).json({ success: false, error: 'Mesure attendue : warning, suspend, ban ou lift.' });
            }
            const result = await applySanction({
                userId: req.params.id,
                kind,
                reason: req.body && req.body.reason,
                duration: req.body && req.body.duration,
                actorId: authResult.userId
            });
            if (!result.ok) return res.status(result.status).json({ success: false, error: result.error });
            return res.status(result.status).json({
                success: true,
                complete: result.complete,
                partial: result.partial,
                restriction: result.restriction,
                user: result.user,
                auth: result.auth,
                open_missions: result.open_missions,
                stripe_untouched: true,
                retry_auth: result.retry_auth,
                note: result.note
            });
        });

        app.post('/v1/admin/moderation-center/reports/:id', async (req, res) => {
            const authResult = await verifyAdminPermission(req, 'moderation.manage');
            if (!authResult.authorized) {
                return res.status(authResult.status).json({ success: false, error: authResult.error });
            }
            const source = req.body && req.body.source === 'bokantaj' ? 'bokantaj' : 'user';
            const table = source === 'bokantaj' ? 'bokantaj_reports' : 'user_reports';
            const nextStatus = String(req.body && req.body.status || '').toUpperCase();
            const allowed = source === 'bokantaj' ? BOK_REPORT_STATUSES : USER_REPORT_STATUSES;
            if (!allowed.includes(nextStatus)) {
                return res.status(400).json({ success: false, error: 'Statut de signalement invalide.' });
            }
            if (req.body && req.body.content_action) {
                const decision = normalizeDecision(req.body.content_action);
                const subject = String(req.body.subject || '');
                const targetId = String(req.body.target_id || '');
                if (!decision || !SUBJECT_TABLES[subject] || !targetId) {
                    return res.status(400).json({ success: false, error: 'Action de contenu incomplète. Le signalement n’a pas été classé.' });
                }
                const acted = await applyContentDecision({
                    subject,
                    id: targetId,
                    decision,
                    reason: req.body.reason,
                    actorId: authResult.userId
                });
                if (!acted.ok) {
                    return res.status(acted.status).json({
                        success: false,
                        error: acted.error,
                        report_updated: false
                    });
                }
            }
            const previous = await supabaseAdmin.from(table).select('status').eq('id', req.params.id).maybeSingle();
            const payload = table === 'user_reports'
                ? { status: nextStatus, updated_at: new Date().toISOString() }
                : { status: nextStatus };
            const updated = await supabaseAdmin.from(table).update(payload).eq('id', req.params.id).select('id, status').maybeSingle();
            if (updated.error) return res.status(500).json({ success: false, error: 'Signalement non mis à jour.' });
            if (!updated.data) return res.status(404).json({ success: false, error: 'Signalement introuvable.' });
            await audit(
                authResult.userId,
                'REPORT_STATUS',
                table,
                req.params.id,
                { status: previous.data && previous.data.status },
                { status: nextStatus },
                req.body && req.body.reason,
                'ok'
            );
            return res.json({
                success: true,
                row: updated.data,
                status_label: REPORT_LABELS[updated.data.status] || updated.data.status
            });
        });
    }

    return {
        register,
        applyContentDecision,
        applySanction,
        displayStatus,
        normalizeDecision,
        restrictionFromSanctions,
        snapshotEngine
    };
}

function registerAdminModerationCenter(app, deps) {
    createModerationCenter(deps).register(app);
}

module.exports = {
    registerAdminModerationCenter,
    createModerationCenter,
    normalizeDecision,
    displayStatus,
    restrictionFromSanctions,
    restrictionLabel,
    isUserId,
    sanitizeSearch,
    authBanDuration,
    REPORT_LABELS
};
