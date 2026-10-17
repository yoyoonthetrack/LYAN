(function (root, factory) {
    const api = factory();
    if (typeof module !== 'undefined' && module.exports) module.exports = api;
    root.LYANN_MISSION_REMINDERS = api;
})(typeof window !== 'undefined' ? window : globalThis, function () {
    'use strict';

    const HOUR = 60 * 60 * 1000;
    const INACTIVE_AFTER = 3 * 24 * HOUR;
    const COPY = {
        quote_reply: {
            title: 'Un devis attend ta réponse',
            body: 'Tu peux l’accepter ou le refuser. La proposition reste disponible.'
        },
        payment_due: {
            title: 'Un paiement peut être sécurisé',
            body: 'Le devis est accepté. Tu peux sécuriser le paiement quand tu es prêt.'
        },
        payout_setup: {
            title: 'Termine ton compte de versement',
            body: 'Le devis est conservé. Le demandeur pourra payer dès que le compte est prêt.'
        },
        declare_done: {
            title: 'La prestation peut être déclarée terminée',
            body: 'Quand le travail est fait, déclare-le pour que le demandeur puisse le vérifier.'
        },
        client_validation: {
            title: 'Une prestation attend ta validation',
            body: 'Le Lyanneur a déclaré le travail terminé. Vérifie-le avant de confirmer.'
        },
        inactive: {
            title: 'Une mission attend une action',
            body: 'Rien n’a bougé depuis quelques jours. Ouvre le dossier pour voir la prochaine étape.'
        }
    };

    function remindersEnabled(prefs) {
        if (!prefs) return true;
        if (prefs.reminders === false) return false;
        const missions = prefs.missions;
        if (missions && typeof missions === 'object' && missions.in_app === false) return false;
        if (missions === false) return false;
        return true;
    }

    function age(quote, now) {
        const stamp = Date.parse(quote && (quote.updated_at || quote.created_at) || '');
        if (!Number.isFinite(stamp)) return HOUR;
        return Math.max(0, now - stamp);
    }

    function roleOf(quote, userId) {
        const providerId = quote && (quote.provider_id || quote.helper_id);
        if (providerId && String(providerId) === String(userId)) return 'provider';
        if (quote && String(quote.requester_id) === String(userId)) return 'requester';
        return '';
    }

    function milestones(quote) {
        return Array.isArray(quote && quote.milestones) ? quote.milestones.filter(Boolean) : [];
    }

    function missionName(quote) {
        const raw = quote && (quote.request_title || quote.description || quote.title);
        const name = String(raw || '').replace(/[\r\n\t]+/g, ' ').trim();
        if (!name) return '';
        return name.length > 72 ? name.slice(0, 69) + '…' : name;
    }

    function push(list, seen, kind, quote, userId) {
        const entityId = String(quote.id || '');
        const key = kind + ':' + entityId;
        if (!entityId || seen.has(key) || !COPY[kind]) return;
        seen.add(key);
        const role = roleOf(quote, userId);
        const contactId = role === 'provider'
            ? (quote.requester_id || null)
            : (quote.provider_id || quote.helper_id || null);
        const name = missionName(quote);
        list.push({
            kind,
            entityId,
            requestId: quote.request_id || quote.requestId || null,
            invitationId: quote.request_invitation_id || quote.invitationId || null,
            contactId,
            title: COPY[kind].title,
            body: (name ? '« ' + name + ' ». ' : '') + COPY[kind].body,
            updatedAt: quote.updated_at || quote.created_at || '',
            type: 'REMINDER_' + kind.toUpperCase()
        });
    }

    function reminderCandidates(input) {
        const userId = input && input.userId;
        const quotes = (input && input.quotes) || [];
        const readiness = (input && input.readiness) || {};
        const now = Number(input && input.now) || Date.now();
        if (!userId || !remindersEnabled(input && input.prefs)) return [];
        const list = [];
        const seen = new Set();
        quotes.forEach((quote) => {
            if (!quote || !quote.id) return;
            const role = roleOf(quote, userId);
            if (!role) return;
            const status = String(quote.status || '').toUpperCase();
            const steps = milestones(quote);
            const providerId = String(quote.provider_id || quote.helper_id || '');
            const ready = readiness[providerId] || 'unknown';
            const waited = age(quote, now);
            if (status === 'SENT' && role === 'requester' && waited >= HOUR) push(list, seen, 'quote_reply', quote, userId);
            if (status === 'ACCEPTED' && role === 'provider' && (ready === 'none' || ready === 'incomplete')) {
                push(list, seen, 'payout_setup', quote, userId);
            }
            const pending = steps.find((step) => String(step.status || '').toUpperCase() === 'PENDING');
            if (status === 'ACCEPTED' && role === 'requester' && pending && ready === 'active' && waited >= HOUR) {
                push(list, seen, 'payment_due', quote, userId);
            }
            if (role === 'provider' && steps.some((step) => ['FUNDED', 'IN_PROGRESS'].indexOf(String(step.status || '').toUpperCase()) !== -1)) {
                push(list, seen, 'declare_done', quote, userId);
            }
            if (role === 'requester' && steps.some((step) => String(step.status || '').toUpperCase() === 'COMPLETED')) {
                push(list, seen, 'client_validation', quote, userId);
            }
            if (status === 'ACCEPTED' && waited >= INACTIVE_AFTER && !seen.has('payout_setup:' + quote.id) && !seen.has('payment_due:' + quote.id) && !seen.has('declare_done:' + quote.id) && !seen.has('client_validation:' + quote.id)) {
                push(list, seen, 'inactive', quote, userId);
            }
        });
        const priority = { payout_setup: 0, payment_due: 1, client_validation: 2, declare_done: 3, quote_reply: 4, inactive: 5 };
        list.sort((a, b) => (priority[a.kind] - priority[b.kind]) || String(b.updatedAt).localeCompare(String(a.updatedAt)));
        const counts = {};
        const balanced = [];
        list.forEach((item) => {
            counts[item.kind] = (counts[item.kind] || 0) + 1;
            if (counts[item.kind] > 3 || balanced.length >= 8) return;
            balanced.push(item);
        });
        return balanced;
    }

    function reminderKey(kind, entityId) {
        return String(kind || '') + ':' + String(entityId || '');
    }

    function visibleReminders(existing, candidates) {
        const live = new Set((candidates || []).map((item) => reminderKey(item.kind, item.entityId)));
        const persisted = (existing || []).filter((item) => {
            const type = String(item && item.type || '');
            if (type.indexOf('REMINDER_') !== 0) return true;
            const kind = type.slice('REMINDER_'.length).toLowerCase();
            return live.has(reminderKey(kind, item.entity_id));
        });
        const already = new Set(persisted.map((item) => String(item.type || '') + ':' + String(item.entity_id || '')));
        const extra = (candidates || []).filter((item) => !already.has(item.type + ':' + item.entityId));
        return { persisted, extra };
    }

    async function loadContext(userId) {
        const client = typeof window !== 'undefined' && window.LYANN_API_CLIENT;
        if (!client || !client.supabase || !userId) return [];
        const { data, error } = await client.supabase
            .from('quotes')
            .select('id,status,requester_id,provider_id,description,updated_at,created_at,request_id,request_invitation_id,milestones(id,status,updated_at)')
            .or('requester_id.eq.' + userId + ',provider_id.eq.' + userId)
            .order('updated_at', { ascending: false })
            .limit(40);
        if (error || !Array.isArray(data)) return window.__lyannReminderQuotes || [];
        window.__lyannReminderQuotes = data;
        const payout = window.LYANN_PAYOUT_ACCOUNT;
        if (payout && typeof payout.fetchReadiness === 'function') {
            const ids = [String(userId)];
            data.forEach((quote) => {
                const providerId = quote && (quote.provider_id || quote.helper_id);
                if (providerId && ids.indexOf(String(providerId)) === -1) ids.push(String(providerId));
            });
            const readiness = Object.assign({}, window.__lyannReminderReadiness || {});
            for (let i = 0; i < ids.length && i < 6; i++) {
                try { readiness[ids[i]] = await payout.fetchReadiness(ids[i]); } catch (_) {}
            }
            window.__lyannReminderReadiness = readiness;
        }
        return data;
    }

    return { reminderCandidates, visibleReminders, remindersEnabled, loadContext };
});
