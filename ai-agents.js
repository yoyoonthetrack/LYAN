/**
 * LYANN DOM — COMMUNITY AGENTS (back-office)
 * Relais vers les APIs persistantes. Aucune file en mémoire, aucune injection dans Bokantaj.
 */

const LYANN_AI_ECOSYSTEM = {
    director: {
        title: "Directeur de l'Animation",
        name: "Système Central d'Animation Communautaire",
        status: "ACTIVE"
    },
    managers: [],
    personas: [],
    pendingApprovalQueue: [],

    async refresh() {
        if (typeof window.fetchWithAdminAuth !== 'function') return this;
        try {
            const [botsRes, tasksRes] = await Promise.all([
                window.fetchWithAdminAuth('/v1/admin/editorial/bots'),
                window.fetchWithAdminAuth('/v1/admin/agent-tasks')
            ]);
            const bots = await botsRes.json().catch(() => ({}));
            const tasks = await tasksRes.json().catch(() => ({}));
            this.personas = (bots.bots || []).map((bot) => ({
                id: bot.id,
                slug: bot.slug,
                name: bot.agent_name,
                publicName: bot.agent_name,
                status: bot.status,
                territory: (bot.territories || []).join(', '),
                sources: bot.sources || []
            }));
            this.pendingApprovalQueue = (tasks.tasks || tasks.data || []).filter((task) =>
                task.approval_status === 'PENDING' && task.status !== 'CANCELLED'
            );
            this.director.status = bots.collectionAllowed === false ? 'PRODUCTION_LOCKED' : 'ACTIVE';
        } catch (err) {
            console.warn('LYANN_AI_ECOSYSTEM.refresh', err);
        }
        return this;
    },

    async approvePendingPost(postId) {
        if (typeof window.fetchWithAdminAuth !== 'function') return false;
        const res = await window.fetchWithAdminAuth(`/v1/admin/editorial/proposals/${postId}/publish`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({})
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || body.success === false) {
            throw new Error(body.error || 'Publication refusée.');
        }
        await this.refresh();
        return body;
    },

    async rejectPendingPost(postId, reason) {
        if (typeof window.fetchWithAdminAuth !== 'function') return false;
        const res = await window.fetchWithAdminAuth(`/v1/admin/editorial/proposals/${postId}/reject`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ reason: reason || '' })
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || body.success === false) {
            throw new Error(body.error || 'Refus impossible.');
        }
        await this.refresh();
        return body;
    },

    async toggleAgentStatus(agentId) {
        const agent = this.personas.find((p) => p.id === agentId);
        const next = agent && agent.status === 'ACTIVE' ? 'SUSPENDED' : 'ACTIVE';
        if (typeof window.fetchWithAdminAuth !== 'function') return next;
        const res = await window.fetchWithAdminAuth(`/v1/admin/editorial/bots/${agentId}/status`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ status: next })
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok || body.success === false) {
            throw new Error(body.error || 'Statut agent inchangé.');
        }
        if (agent) agent.status = next;
        return next;
    }
};

window.LYANN_AI_ECOSYSTEM = LYANN_AI_ECOSYSTEM;
