/**
 * LYANN DOM — SUPABASE & API CLIENT SDK
 * Includes LocalStorage Mock Backend for DEV/Testing of the Messaging & AI System
 */

// Global Supabase init
const SUPABASE_URL = 'https://gzispjfoywklpqatjyop.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd6aXNwamZveXdrbHBxYXRqeW9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0MTE4ODcsImV4cCI6MjEwMTk4Nzg4N30.oPJvkDVffQ4EaxDy2V7Jj7veusCVGTnM2BUBKXnoQ0A';

let supabase;
if (window.supabase) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log("⚡ Supabase client initialized.");
} else {
    console.warn("⚠️ Supabase JS SDK missing. Running in Mock Mode only.");
}

// ----------------------------------------------------------------------
// MOCK LOCAL DATABASE FOR MISSIONS (Used for DEV/AI testing)
// ----------------------------------------------------------------------
const MOCK_STORAGE_KEY = 'lyann_mock_missions_db';

function getMockMissions() {
    try {
        const data = localStorage.getItem(MOCK_STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    } catch (e) {
        return [];
    }
}

function saveMockMissions(missions) {
    localStorage.setItem(MOCK_STORAGE_KEY, JSON.stringify(missions));
    // Dispatch event to force UI update if needed
    window.dispatchEvent(new CustomEvent('lyann_missions_updated'));
}

function generateId() {
    return 'm_' + Math.random().toString(36).substr(2, 9);
}

// ----------------------------------------------------------------------
// LYANN API CLIENT
// ----------------------------------------------------------------------
const LYANN_API_CLIENT = {
    supabase: supabase,

    // --- AUTHENTICATION ---
    async signUp(email, password, metadata) {
        if (!this.supabase) return { error: { message: 'Supabase non configuré' } };
        return await this.supabase.auth.signUp({
            email,
            password,
            options: { data: metadata }
        });
    },

    async login(email, password) {
        if (!this.supabase) return { error: { message: 'Supabase non configuré' } };
        return await this.supabase.auth.signInWithPassword({ email, password });
    },

    async logout() {
        if (!this.supabase) return;
        return await this.supabase.auth.signOut();
    },

    async getSession() {
        if (!this.supabase) return { data: { session: null } };
        return await this.supabase.auth.getSession();
    },


    // --- MOCK BACKEND METHODS (Overrides for testing the AI Journey) ---
    
    // Gets the active mission between two users
    
    async getActiveMissionBetween(userId1, userId2) {
        if (!this.supabase) return null;
        // Supabase doesn't have an easy OR inside EQ for two columns, so we use string OR
        const { data, error } = await this.supabase
            .from('missions')
            .select('*')
            .or(`and(requester_id.eq.${userId1},helper_id.eq.${userId2}),and(requester_id.eq.${userId2},helper_id.eq.${userId1})`)
            .order('created_at', { ascending: false })
            .limit(1);
        
        if (error) {
            console.error(error);
            return null;
        }
        return data && data.length > 0 ? data[0] : null;
    },


    
    async mockProposePrice(proposerId, receiverId, amount, description) {
        if (!this.supabase) return null;
        let mission = await this.getActiveMissionBetween(proposerId, receiverId);

        if (!mission || mission.status === 'COMPLETED' || mission.status === 'CANCELLED') {
            const { data, error } = await this.supabase.from('missions').insert({
                requester_id: receiverId, 
                helper_id: proposerId,    
                title: description || "Service demandé",
                agreed_price: amount,
                status: 'PROPOSED',
                proposed_by: proposerId
            }).select().single();
            if (error) console.error(error);
            return data;
        } else {
            const { data, error } = await this.supabase.from('missions').update({
                agreed_price: amount,
                status: 'PROPOSED',
                proposed_by: proposerId,
                title: description || mission.title
            }).eq('id', mission.id).select().single();
            if (error) console.error(error);
            return data;
        }
    },


    
    async mockAcceptPrice(missionId, ...args) {
        if (!this.supabase) return null;
        const { data, error } = await this.supabase.from('missions').update({ status: 'AGREED' }).eq('id', missionId).select().single();
        if (error) console.error(error);
        return data;
    },


    
    async mockPayMission(missionId, ...args) {
        if (!this.supabase) return null;
        const { data, error } = await this.supabase.from('missions').update({ status: 'IN_PROGRESS', payment_status: 'PAID_ESCROW' }).eq('id', missionId).select().single();
        if (error) console.error(error);
        return data;
    },


    
    async mockMarkMissionDone(missionId, ...args) {
        if (!this.supabase) return null;
        const { data, error } = await this.supabase.from('missions').update({ status: 'WORK_MARKED_COMPLETE' }).eq('id', missionId).select().single();
        if (error) console.error(error);
        return data;
    },


    
    async mockConfirmMissionCompletion(missionId, ...args) {
        if (!this.supabase) return null;
        const { data, error } = await this.supabase.from('missions').update({ status: 'COMPLETED' }).eq('id', missionId).select().single();
        if (error) console.error(error);
        return data;
    },


    
    async mockReportProblem(missionId, ...args) {
        if (!this.supabase) return null;
        const { data, error } = await this.supabase.from('missions').update({ status: 'DISPUTE' }).eq('id', missionId).select().single();
        if (error) console.error(error);
        return data;
    },


    // --- STATE MACHINE ---
    getAvailableMissionActions(userId, mission) {
        if (!mission) {
            return [
                { id: 'PROPOSE_PRICE', label: 'Proposer un prix', type: 'primary' },
                { id: 'PROPOSE_DATE', label: 'Proposer une date', type: 'outline' },
                { id: 'CREATE_QUOTE', label: 'Créer un devis', type: 'outline' }
            ];
        }

        const isRequester = mission.requester_id === userId;
        const isHelper = mission.helper_id === userId;
        const state = mission.status;

        let actions = [];

        if (state === 'DISCUSSION') {
            actions.push({ id: 'PROPOSE_PRICE', label: 'Proposer un prix', type: 'primary' });
            actions.push({ id: 'PROPOSE_DATE', label: 'Proposer une date', type: 'outline' });
        }

        if (state === 'PROPOSED') {
            const didIPropose = mission.proposed_by === userId;
            if (!didIPropose) {
                actions.push({ id: 'ACCEPT_PRICE', label: 'Accepter l\'offre', type: 'primary' });
                actions.push({ id: 'COUNTER_OFFER', label: 'Contre-proposer', type: 'outline' });
            } else {
                actions.push({ id: 'CANCEL_PROPOSAL', label: 'Annuler la proposition', type: 'outline' });
            }
        }
        
        if (state === 'AGREED') {
            if (isRequester) {
                actions.push({ id: 'PAY_MISSION', label: 'Payer et confirmer', type: 'primary' });
            } else {
                actions.push({ id: 'WAITING_PAYMENT', label: 'En attente du paiement...', type: 'disabled' });
            }
        }

        if (state === 'IN_PROGRESS') {
            if (isHelper) {
                actions.push({ id: 'MARK_DONE', label: '✓ J\'ai terminé', type: 'primary' });
            }
            if (isRequester) {
                actions.push({ id: 'REPORT_PROBLEM', label: 'Signaler un problème', type: 'outline' });
            }
        }

        if (state === 'WORK_MARKED_COMPLETE') {
            if (isRequester) {
                actions.push({ id: 'CONFIRM_DONE', label: '✓ Oui, tout est bon', type: 'primary' });
                actions.push({ id: 'REPORT_PROBLEM', label: '⚠️ Signaler un problème', type: 'outline' });
            } else {
                actions.push({ id: 'WAITING_VALIDATION', label: 'En attente de validation', type: 'disabled' });
            }
        }

        if (state === 'COMPLETED') {
            actions.push({ id: 'LEAVE_REVIEW', label: '⭐ Laisser un avis', type: 'primary' });
            actions.push({ id: 'RECOMMEND', label: '🤝 Recommander', type: 'outline' });
            actions.push({ id: 'PROPOSE_PRICE', label: 'Nouvelle demande (Proposer un prix)', type: 'outline' });
        }

        if (state === 'DISPUTE') {
            actions.push({ id: 'VIEW_DISPUTE', label: 'Voir le litige', type: 'primary' });
        }

        return actions;
    }
};

window.LYANN_API_CLIENT = LYANN_API_CLIENT;
