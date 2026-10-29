'use strict';

/**
 * Admin desk wiring for shells that already have Staging tables:
 * subscriptions, insurance claims, notifications, RBAC, audit, dispute decisions.
 * Dispute decisions never call Stripe here (refunds stay gated elsewhere).
 */

const DEFAULT_PLANS = Object.freeze([
    {
        name: 'Lyanneur',
        slug: 'lyanneur',
        price_monthly: 0,
        description: 'Offre publique actuelle — 0 € pour toujours.',
        features: ['Profil Lyanneur', 'Réponse aux demandes'],
        display_order: 1,
        active: true
    },
    {
        name: 'Lyanneur Plus',
        slug: 'lyanneur-plus',
        price_monthly: 7.9,
        description: 'Formule mensuelle en préparation.',
        features: ['Visibilité renforcée'],
        display_order: 2,
        active: true
    },
    {
        name: 'Pro',
        slug: 'pro',
        price_monthly: 19.9,
        description: 'Formule mensuelle en préparation. Achat Stripe non activé depuis ce desk.',
        features: ['Badge Pro', 'Priorité matching'],
        display_order: 3,
        active: true
    }
]);

const DISPUTE_CLOSED = new Set([
    'RESOLVED_CLIENT', 'RESOLVED_PROVIDER', 'RESOLVED_PARTIAL', 'CANCELLED',
    'RESOLVED_REFUND', 'RESOLVED_PAYOUT', 'CLOSED'
]);

function adminProfileName(profile) {
    if (!profile) return '—';
    const name = `${profile.first_name || ''} ${profile.last_name || ''}`.trim();
    return name || profile.email || profile.id || '—';
}

async function mapProfiles(supabaseAdmin, ids) {
    const unique = [...new Set((ids || []).filter(Boolean))];
    if (!unique.length) return {};
    const { data } = await supabaseAdmin
        .from('profiles')
        .select('id, first_name, last_name, email')
        .in('id', unique);
    const map = {};
    (data || []).forEach((row) => { map[row.id] = row; });
    return map;
}

async function writeAudit(supabaseAdmin, auth, action, moduleName, targetType, targetId, metadata) {
    try {
        await supabaseAdmin.from('admin_audit_events').insert({
            actor_type: 'ADMIN',
            actor_id: auth.userId || null,
            actor_name: auth.email || auth.role || 'Admin',
            action,
            module_name: moduleName,
            target_type: targetType,
            target_id: targetId || null,
            metadata: metadata || {},
            created_at: new Date().toISOString()
        });
    } catch (e) {
        console.warn('[admin-ops-desk] audit skipped', e.message || e);
    }
}

async function ensureSubscriptionPlans(supabaseAdmin) {
    const { count } = await supabaseAdmin
        .from('subscriptions_plans')
        .select('*', { count: 'exact', head: true });
    if (count && count > 0) return;
    await supabaseAdmin.from('subscriptions_plans').insert(DEFAULT_PLANS.map((plan) => ({
        ...plan,
        created_at: new Date().toISOString()
    })));
}

async function handleOpsResource(supabaseAdmin, resource, limit) {
    if (resource === 'subscriptions') {
        await ensureSubscriptionPlans(supabaseAdmin);
        const [{ data: plans, error: plansErr }, { data: store, error: storeErr }] = await Promise.all([
            supabaseAdmin.from('subscriptions_plans').select('*').order('display_order', { ascending: true }).limit(50),
            supabaseAdmin.from('lyann_store_subscriptions').select('*').order('checked_at', { ascending: false }).limit(limit)
        ]);
        if (plansErr) throw plansErr;
        if (storeErr) throw storeErr;
        const profiles = await mapProfiles(supabaseAdmin, (store || []).map((row) => row.user_id));
        return {
            success: true,
            plans: plans || [],
            rows: (store || []).map((row) => ({
                ...row,
                member_name: adminProfileName(profiles[row.user_id])
            }))
        };
    }

    if (resource === 'protection') {
        const { data, error } = await supabaseAdmin
            .from('insurance_claims')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(limit);
        if (error) throw error;
        const profiles = await mapProfiles(supabaseAdmin, (data || []).map((row) => row.claimant_id));
        return {
            success: true,
            rows: (data || []).map((row) => ({
                ...row,
                claimant_name: adminProfileName(profiles[row.claimant_id])
            }))
        };
    }

    if (resource === 'notifications') {
        const { data, error } = await supabaseAdmin
            .from('notifications')
            .select('id, user_id, type, title, body, entity_type, entity_id, read, created_at')
            .order('created_at', { ascending: false })
            .limit(limit);
        if (error) throw error;
        const profiles = await mapProfiles(supabaseAdmin, (data || []).map((row) => row.user_id));
        return {
            success: true,
            rows: (data || []).map((row) => ({
                ...row,
                member_name: adminProfileName(profiles[row.user_id])
            }))
        };
    }

    if (resource === 'audit-logs') {
        const { data, error } = await supabaseAdmin
            .from('admin_audit_events')
            .select('id, actor_name, actor_id, action, module_name, target_type, target_id, reason, metadata, created_at')
            .order('created_at', { ascending: false })
            .limit(limit);
        if (error) throw error;
        return { success: true, rows: data || [] };
    }

    if (resource === 'rbac') {
        const [{ data: roles, error: rolesErr }, { data: permissions, error: permErr }, { data: links, error: linkErr }] = await Promise.all([
            supabaseAdmin.from('admin_roles').select('id, name, code, slug, description').order('name', { ascending: true }),
            supabaseAdmin.from('admin_permissions').select('id, code, module, label, name, description').order('module', { ascending: true }),
            supabaseAdmin.from('admin_role_permissions').select('role_id, permission_id')
        ]);
        if (rolesErr) throw rolesErr;
        if (permErr) throw permErr;
        if (linkErr) throw linkErr;
        const byRole = {};
        (links || []).forEach((row) => {
            if (!byRole[row.role_id]) byRole[row.role_id] = new Set();
            byRole[row.role_id].add(row.permission_id);
        });
        return {
            success: true,
            roles: roles || [],
            permissions: permissions || [],
            matrix: (permissions || []).map((perm) => ({
                permission_id: perm.id,
                code: perm.code,
                module: perm.module,
                label: perm.label || perm.name || perm.code,
                roles: (roles || []).map((role) => ({
                    role_id: role.id,
                    role_code: role.code || role.slug || role.name,
                    granted: !!(byRole[role.id] && byRole[role.id].has(perm.id))
                        || ['OWNER', 'SUPER_ADMIN'].includes(String(role.code || '').toUpperCase())
                }))
            }))
        };
    }

    if (resource === 'business-invoices') {
        const { data, error } = await supabaseAdmin
            .from('lyann_business_invoices')
            .select('id, user_id, customer_id, mission_id, number, kind, total_cents, created_at')
            .order('created_at', { ascending: false })
            .limit(limit);
        if (error) throw error;
        const profiles = await mapProfiles(supabaseAdmin, (data || []).flatMap((row) => [row.user_id, row.customer_id]));
        return {
            success: true,
            rows: (data || []).map((row) => ({
                ...row,
                member_name: adminProfileName(profiles[row.user_id] || profiles[row.customer_id]),
                total_euros: Number(row.total_cents || 0) / 100
            }))
        };
    }

    return null;
}

function registerAdminOpsDesk(app, { supabaseAdmin, verifyAdminPermission }) {
    app.post('/v1/admin/ops/disputes/:id/decide', async (req, res) => {
        const auth = await verifyAdminPermission(req, 'disputes.manage');
        if (!auth.authorized) {
            const fallback = await verifyAdminPermission(req, 'finance.refund');
            if (!fallback.authorized) {
                return res.status(auth.status || 403).json({ success: false, error: auth.error || fallback.error });
            }
            Object.assign(auth, fallback);
        }
        try {
            const action = String(req.body?.action || '').trim();
            const note = String(req.body?.note || '').trim().slice(0, 2000);
            const allowed = {
                keep_frozen: { status: 'UNDER_REVIEW', resolution_type: null },
                under_review: { status: 'UNDER_REVIEW', resolution_type: null },
                resolve_client: { status: 'RESOLVED_CLIENT', resolution_type: 'FULL_REFUND' },
                resolve_provider: { status: 'RESOLVED_PROVIDER', resolution_type: 'FULL_RELEASE' },
                resolve_partial: { status: 'RESOLVED_PARTIAL', resolution_type: 'PARTIAL_SETTLEMENT' }
            };
            if (!allowed[action]) {
                return res.status(400).json({ success: false, code: 'UNSUPPORTED_RESOLUTION', error: 'Action de litige non supportée.' });
            }
            if ((action === 'resolve_partial' || action === 'resolve_client') && !note) {
                return res.status(400).json({ success: false, error: 'Une note de médiation est obligatoire pour cette décision.' });
            }

            const { data: dispute, error } = await supabaseAdmin
                .from('disputes')
                .select('*')
                .eq('id', req.params.id)
                .maybeSingle();
            if (error) return res.status(500).json({ success: false, error: error.message });
            if (!dispute) return res.status(404).json({ success: false, error: 'Litige introuvable.' });
            if (DISPUTE_CLOSED.has(String(dispute.status || '').toUpperCase())) {
                return res.json({ success: true, idempotent: true, row: dispute, message: 'Litige déjà clos.' });
            }

            const nowIso = new Date().toISOString();
            const patch = {
                status: allowed[action].status,
                resolution_type: allowed[action].resolution_type,
                resolution_note: note || dispute.resolution_note || null,
                updated_at: nowIso
            };
            if (action.startsWith('resolve_')) {
                patch.resolved_at = nowIso;
                patch.resolved_by = auth.userId;
            }

            const updated = await supabaseAdmin
                .from('disputes')
                .update(patch)
                .eq('id', dispute.id)
                .select('*')
                .maybeSingle();
            if (updated.error) return res.status(500).json({ success: false, error: updated.error.message });

            if (action === 'resolve_provider' && dispute.payment_id) {
                await supabaseAdmin
                    .from('payments')
                    .update({ payment_status: 'SUCCEEDED' })
                    .eq('id', dispute.payment_id)
                    .eq('payment_status', 'DISPUTED')
                    .is('stripe_transfer_id', null)
                    .is('stripe_refund_id', null);
                if (dispute.milestone_id) {
                    await supabaseAdmin
                        .from('milestones')
                        .update({ status: 'COMPLETED', updated_at: nowIso })
                        .eq('id', dispute.milestone_id)
                        .eq('status', 'DISPUTED');
                }
            }

            await supabaseAdmin.from('dispute_events').insert({
                dispute_id: dispute.id,
                actor_id: auth.userId,
                event_type: 'DISPUTE_ADMIN_DECISION',
                metadata: { action, note: note || null, stripe_execution: false }
            });
            await writeAudit(supabaseAdmin, auth, 'DISPUTE_DECIDE', 'Litiges', 'dispute', dispute.id, {
                action,
                note: note || null,
                stripe_execution: false
            });

            return res.json({
                success: true,
                row: updated.data,
                stripe_execution: false,
                message: action === 'resolve_client'
                    ? 'Décision enregistrée. Aucun remboursement Stripe n’a été exécuté depuis ce desk.'
                    : action === 'resolve_provider'
                        ? 'Décision enregistrée. Le versement peut reprendre via le parcours de validation client/admin prévu.'
                        : 'Décision enregistrée. Les fonds restent gelés.'
            });
        } catch (e) {
            return res.status(500).json({ success: false, error: e.message || 'Décision litige impossible.' });
        }
    });

    app.post('/v1/admin/ops/protection/:id/decide', async (req, res) => {
        const auth = await verifyAdminPermission(req, 'disputes.manage');
        if (!auth.authorized) {
            return res.status(auth.status).json({ success: false, error: auth.error });
        }
        try {
            const status = String(req.body?.status || '').toUpperCase();
            const notes = String(req.body?.decision_notes || req.body?.note || '').trim().slice(0, 2000);
            const allowed = new Set(['OPEN', 'IN_REVIEW', 'DOCS_REQUESTED', 'APPROVED', 'REJECTED', 'REFUNDED', 'CLOSED']);
            if (!allowed.has(status)) {
                return res.status(400).json({ success: false, error: 'Statut assurance non supporté.' });
            }
            const patch = {
                status,
                decision_notes: notes || null,
                handled_by: auth.userId,
                updated_at: new Date().toISOString()
            };
            const { data, error } = await supabaseAdmin
                .from('insurance_claims')
                .update(patch)
                .eq('id', req.params.id)
                .select('*')
                .maybeSingle();
            if (error) return res.status(500).json({ success: false, error: error.message });
            if (!data) return res.status(404).json({ success: false, error: 'Dossier assurance introuvable.' });
            await writeAudit(supabaseAdmin, auth, 'PROTECTION_DECIDE', 'Assurance', 'insurance_claim', data.id, { status, notes });
            return res.json({ success: true, row: data });
        } catch (e) {
            return res.status(500).json({ success: false, error: e.message || 'Décision assurance impossible.' });
        }
    });

    app.post('/v1/admin/ops/users/:id/grant-pro', async (req, res) => {
        const auth = await verifyAdminPermission(req, 'users.manage');
        if (!auth.authorized) {
            return res.status(auth.status).json({ success: false, error: auth.error });
        }
        try {
            const { data, error } = await supabaseAdmin
                .from('profiles')
                .update({ is_pro: true })
                .eq('id', req.params.id)
                .select('id, first_name, last_name, email, is_pro')
                .maybeSingle();
            if (error) return res.status(500).json({ success: false, error: error.message });
            if (!data) return res.status(404).json({ success: false, error: 'Profil introuvable.' });
            await writeAudit(supabaseAdmin, auth, 'GRANT_PRO_BADGE', 'Abonnements', 'profile', data.id, {
                is_pro: true,
                money_moved: false
            });
            return res.json({
                success: true,
                row: data,
                message: 'Badge Pro activé sur le profil. Aucun prélèvement Stripe n’a été créé.'
            });
        } catch (e) {
            return res.status(500).json({ success: false, error: e.message || 'Attribution Pro impossible.' });
        }
    });

    app.post('/v1/admin/ops/notifications/test', async (req, res) => {
        const auth = await verifyAdminPermission(req);
        if (!auth.authorized) {
            return res.status(auth.status).json({ success: false, error: auth.error });
        }
        try {
            const title = String(req.body?.title || '').trim().slice(0, 120);
            const body = String(req.body?.body || req.body?.message || '').trim().slice(0, 500);
            const userId = String(req.body?.user_id || auth.userId || '').trim();
            if (!title || !body) {
                return res.status(400).json({ success: false, error: 'Titre et message obligatoires.' });
            }
            if (!/^[0-9a-f-]{36}$/i.test(userId)) {
                return res.status(400).json({ success: false, error: 'UUID membre requis pour une notif test.' });
            }
            const { data, error } = await supabaseAdmin
                .from('notifications')
                .insert({
                    user_id: userId,
                    type: 'ADMIN_BROADCAST_TEST',
                    title,
                    body,
                    read: false,
                    created_at: new Date().toISOString()
                })
                .select('*')
                .maybeSingle();
            if (error) return res.status(500).json({ success: false, error: error.message });
            await writeAudit(supabaseAdmin, auth, 'NOTIFICATION_TEST', 'Notifications', 'notification', data?.id, {
                user_id: userId,
                push_sent: false
            });
            return res.json({
                success: true,
                row: data,
                message: 'Notification in-app créée. Aucun push device n’a été diffusé.'
            });
        } catch (e) {
            return res.status(500).json({ success: false, error: e.message || 'Notification test impossible.' });
        }
    });
}

module.exports = {
    registerAdminOpsDesk,
    handleOpsResource,
    DISPUTE_CLOSED,
    DEFAULT_PLANS
};
