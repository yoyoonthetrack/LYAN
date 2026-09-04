/**
 * LYANN DOM — SUPABASE & API CLIENT SDK
 * Includes LocalStorage Mock Backend for DEV/Testing of the Messaging & AI System
 */

// Global Supabase init
const SUPABASE_URL = 'https://gzispjfoywklpqatjyop.supabase.co'; 
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imd6aXNwamZveXdrbHBxYXRqeW9wIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0MTE4ODcsImV4cCI6MjEwMTk4Nzg4N30.oPJvkDVffQ4EaxDy2V7Jj7veusCVGTnM2BUBKXnoQ0A';

let supabaseClient;
function isUUID(str) {
    if (typeof str !== 'string') return false;
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(str);
}
if (window.supabase) {
    supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            persistSession: true,
            autoRefreshToken: true,
            detectSessionInUrl: true
        }
    });
    console.log("⚡ Supabase client initialized with session persistence.");
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

function normalizeAuthError(error) {
    if (!error) return null;
    const msg = (error.message || '').toLowerCase();
    if (msg.includes('invalid login credentials') || msg.includes('invalid credentials') || msg.includes('user not found') || msg.includes('wrong password')) {
        return { message: 'Adresse email ou mot de passe incorrect.' };
    }
    if (msg.includes('email not confirmed')) {
        return { message: 'Veuillez confirmer votre adresse email pour continuer.' };
    }
    if (msg.includes('rate limit') || msg.includes('too many requests')) {
        return { message: 'Trop de tentatives effectuées. Veuillez patienter quelques minutes.' };
    }
    if (msg.includes('user already registered') || msg.includes('email already in use') || msg.includes('already exists')) {
        return { message: 'Un compte existe déjà avec cette adresse email.' };
    }
    if (msg.includes('password should be at least')) {
        return { message: 'Le mot de passe doit comporter au moins 8 caractères.' };
    }
    return { message: error.message || 'Erreur lors de l’authentification.' };
}

// ----------------------------------------------------------------------
// LYANN API CLIENT
// ----------------------------------------------------------------------
const LYANN_API_CLIENT = {
    get supabase() {
        if (!supabaseClient && window.supabase) {
            supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
                auth: {
                    persistSession: true,
                    autoRefreshToken: true,
                    detectSessionInUrl: true
                }
            });
        }
        return supabaseClient;
    },

    normalizeAuthError,

    // --- AUTHENTICATION ---
    async signUp(email, password, metadata) {
        if (!this.supabase) return { error: { message: 'Supabase non initialisé.' } };
        if (!password || password.length < 8) {
            return { error: { message: 'Le mot de passe doit comporter au moins 8 caractères.' } };
        }
        const res = await this.supabase.auth.signUp({
            email,
            password,
            options: {
                data: metadata,
                emailRedirectTo: window.location.origin + '/confirm-signup.html'
            }
        });
        if (res.error) {
            console.error('[LYANN AUTH DEBUG]', {
                message: res.error.message,
                code: res.error.code,
                status: res.error.status
            });
            res.error = normalizeAuthError(res.error);
        }
        return res;
    },

    async login(email, password) {
        if (!this.supabase) return { error: { message: 'Supabase non initialisé.' } };
        const res = await this.supabase.auth.signInWithPassword({ email, password });
        if (res.error) {
            console.error('[LYANN AUTH DEBUG]', {
                message: res.error.message,
                code: res.error.code,
                status: res.error.status
            });
            res.error = normalizeAuthError(res.error);
        }
        return res;
    },

    async logout() {
        if (!this.supabase) return { error: null };
        return await this.supabase.auth.signOut();
    },

    async signOut() {
        return await this.logout();
    },

    async getSession() {
        if (!this.supabase) return { data: { session: null }, error: null };
        return await this.supabase.auth.getSession();
    },

    async resetPasswordForEmail(email) {
        if (!this.supabase) return { error: { message: 'Supabase non initialisé.' } };
        const res = await this.supabase.auth.resetPasswordForEmail(email, {
            redirectTo: window.location.origin + '/index.html?action=reset_password'
        });
        if (res.error) res.error = normalizeAuthError(res.error);
        return res;
    },

    async updatePassword(newPassword) {
        if (!this.supabase) return { error: { message: 'Supabase non initialisé.' } };
        const res = await this.supabase.auth.updateUser({ password: newPassword });
        if (res.error) res.error = normalizeAuthError(res.error);
        return res;
    },

    async getProfile(userId) {
        if (!this.supabase) return { data: null };
        return await this.supabase.from('profiles').select('*').eq('id', userId).single();
    },

    async getOrCreateConversation(myUserId, targetUserId) {
        if (!this.supabase) return { error: { message: 'Supabase non initialisé.' } };
        const { data, error } = await this.supabase.rpc('get_or_create_conversation', {
            p_target_user_id: targetUserId
        });

        if (error) return { error };
        return { data: { id: data } };
    },

    async getUserConversations(myUserId) {
        if (!this.supabase) return { data: [] };
        const sessionRes = await this.getSession();
        const activeUserId = sessionRes?.data?.session?.user?.id || myUserId;
        return await this.supabase
            .from('conversation_participants')
            .select('conversation_id, conversations(*)')
            .eq('user_id', activeUserId);
    },

    async getConversationMessages(conversationId) {
        if (!this.supabase) return { data: [] };
        return await this.supabase
            .from('messages')
            .select('*')
            .eq('conversation_id', conversationId)
            .order('created_at', { ascending: true });
    },

    async sendMessage(conversationId, senderId, content) {
        if (!this.supabase) return { error: { message: 'Supabase non initialisé.' } };
        const sessionRes = await this.getSession();
        const activeSenderId = sessionRes?.data?.session?.user?.id || senderId;

        return await this.supabase
            .from('messages')
            .insert({ conversation_id: conversationId, sender_id: activeSenderId, content: content })
            .select()
            .single();
    },

    async getMembers(territory = 'all', query = '') {
        if (!this.supabase) return { data: [] };
        let req = this.supabase.from('public_profiles').select('*');
        if (territory && territory !== 'all') {
            req = req.eq('territory', territory);
        }
        if (query) {
            req = req.or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,bio.ilike.%${query}%`);
        }
        return await req;
    },

    async getFeed() {
        if (!this.supabase) return { data: [] };
        return await this.supabase.from('bokantaj_posts').select(`
            *,
            profiles(first_name, last_name, avatar_url)
        `).order('created_at', { ascending: false });
    },

    async getQuotes(userId) {
        if (!this.supabase) return { data: [] };
        return await this.supabase.from('quotes').select(`
            *,
            provider:profiles!provider_id(first_name, last_name, avatar_url),
            client:profiles!client_id(first_name, last_name, avatar_url)
        `).or(`provider_id.eq.${userId},client_id.eq.${userId}`);
    },

    async serverRequest(endpoint, body = {}) {
        const session = await this.getSession();
        const token = session?.data?.session?.access_token;
        
        return fetch(`http://localhost:3000${endpoint}`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${token}`
            },
            body: JSON.stringify(body)
        }).then(res => res.json());
    },

    // --- MOCK BACKEND METHODS (Overrides for testing the AI Journey) ---
    
    // Gets the active mission between two users
    
    async getActiveMissionBetween(userId1, userId2) {
        if (!isUUID(userId1) || !isUUID(userId2) || !this.supabase) {
            const missions = getMockMissions();
            const matched = missions.filter(m => 
                (m.requester_id === userId1 && m.helper_id === userId2) ||
                (m.requester_id === userId2 && m.helper_id === userId1)
            );
            return matched.length > 0 ? matched[matched.length - 1] : null;
        }
        try {
            const { data, error } = await this.supabase
                .from('missions')
                .select('*')
                .or(`and(requester_id.eq.${userId1},helper_id.eq.${userId2}),and(requester_id.eq.${userId2},helper_id.eq.${userId1})`)
                .order('created_at', { ascending: false })
                .limit(1);
            if (error) throw error;
            return data && data.length > 0 ? data[0] : null;
        } catch (e) {
            console.warn("Supabase active mission fetch failed, falling back to local:", e);
            const missions = getMockMissions();
            const matched = missions.filter(m => 
                (m.requester_id === userId1 && m.helper_id === userId2) ||
                (m.requester_id === userId2 && m.helper_id === userId1)
            );
            return matched.length > 0 ? matched[matched.length - 1] : null;
        }
    },

    async mockCreateNeed(requesterId, helperId, title) {
        const missions = getMockMissions();
        const mission = {
            id: generateId(),
            requester_id: requesterId,
            helper_id: helperId,
            title: title || "Demande d'aide",
            agreed_price: 0,
            status: 'DISCUSSION',
            proposed_by: null
        };
        missions.push(mission);
        saveMockMissions(missions);
        return mission;
    },

    async mockProposePrice(proposerId, receiverId, amount, description) {
        if (!isUUID(proposerId) || !isUUID(receiverId) || !this.supabase) {
            const missions = getMockMissions();
            let mission = missions.find(m => 
                (m.requester_id === proposerId && m.helper_id === receiverId) ||
                (m.requester_id === receiverId && m.helper_id === proposerId)
            );

            if (!mission || mission.status === 'COMPLETED' || mission.status === 'CANCELLED') {
                mission = {
                    id: generateId(),
                    requester_id: receiverId,
                    helper_id: proposerId,
                    title: description || "Service demandé",
                    agreed_price: amount,
                    status: 'PROPOSED',
                    proposed_by: proposerId
                };
                missions.push(mission);
            } else {
                mission.agreed_price = amount;
                mission.status = 'PROPOSED';
                mission.proposed_by = proposerId;
                mission.title = description || mission.title;
            }
            saveMockMissions(missions);
            return mission;
        }
        try {
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
                if (error) throw error;
                return data;
            } else {
                const { data, error } = await this.supabase.from('missions').update({
                    agreed_price: amount,
                    status: 'PROPOSED',
                    proposed_by: proposerId,
                    title: description || mission.title
                }).eq('id', mission.id).select().single();
                if (error) throw error;
                return data;
            }
        } catch (e) {
            console.warn("Supabase mockProposePrice failed, falling back to local:", e);
            const missions = getMockMissions();
            let mission = missions.find(m => 
                (m.requester_id === proposerId && m.helper_id === receiverId) ||
                (m.requester_id === receiverId && m.helper_id === proposerId)
            );
            if (!mission || mission.status === 'COMPLETED' || mission.status === 'CANCELLED') {
                mission = {
                    id: generateId(),
                    requester_id: receiverId,
                    helper_id: proposerId,
                    title: description || "Service demandé",
                    agreed_price: amount,
                    status: 'PROPOSED',
                    proposed_by: proposerId
                };
                missions.push(mission);
            } else {
                mission.agreed_price = amount;
                mission.status = 'PROPOSED';
                mission.proposed_by = proposerId;
                mission.title = description || mission.title;
            }
            saveMockMissions(missions);
            return mission;
        }
    },

    async mockAcceptPrice(missionId, userId) {
        if (!isUUID(missionId) || !this.supabase) {
            const missions = getMockMissions();
            const mission = missions.find(m => m.id === missionId);
            if (mission) {
                mission.status = 'AGREED';
                saveMockMissions(missions);
            }
            return mission;
        }
        try {
            const { data, error } = await this.supabase.from('missions').update({ status: 'AGREED' }).eq('id', missionId).select().single();
            if (error) throw error;
            return data;
        } catch (e) {
            console.warn("Supabase mockAcceptPrice failed, falling back to local:", e);
            const missions = getMockMissions();
            const mission = missions.find(m => m.id === missionId);
            if (mission) {
                mission.status = 'AGREED';
                saveMockMissions(missions);
            }
            return mission;
        }
    },

    async mockPayMission(missionId) {
        if (!isUUID(missionId) || !this.supabase) {
            const missions = getMockMissions();
            const mission = missions.find(m => m.id === missionId);
            if (mission) {
                mission.status = 'IN_PROGRESS';
                mission.payment_status = 'PAID_ESCROW';
                saveMockMissions(missions);
            }
            return mission;
        }
        try {
            const { data, error } = await this.supabase.from('missions').update({ status: 'IN_PROGRESS', payment_status: 'PAID_ESCROW' }).eq('id', missionId).select().single();
            if (error) throw error;
            return data;
        } catch (e) {
            console.warn("Supabase mockPayMission failed, falling back to local:", e);
            const missions = getMockMissions();
            const mission = missions.find(m => m.id === missionId);
            if (mission) {
                mission.status = 'IN_PROGRESS';
                mission.payment_status = 'PAID_ESCROW';
                saveMockMissions(missions);
            }
            return mission;
        }
    },

    async mockMarkMissionDone(missionId) {
        if (!isUUID(missionId) || !this.supabase) {
            const missions = getMockMissions();
            const mission = missions.find(m => m.id === missionId);
            if (mission) {
                mission.status = 'WORK_MARKED_COMPLETE';
                saveMockMissions(missions);
            }
            return mission;
        }
        try {
            const { data, error } = await this.supabase.from('missions').update({ status: 'WORK_MARKED_COMPLETE' }).eq('id', missionId).select().single();
            if (error) throw error;
            return data;
        } catch (e) {
            console.warn("Supabase mockMarkMissionDone failed, falling back to local:", e);
            const missions = getMockMissions();
            const mission = missions.find(m => m.id === missionId);
            if (mission) {
                mission.status = 'WORK_MARKED_COMPLETE';
                saveMockMissions(missions);
            }
            return mission;
        }
    },

    async mockConfirmMissionCompletion(missionId) {
        if (!isUUID(missionId) || !this.supabase) {
            const missions = getMockMissions();
            const mission = missions.find(m => m.id === missionId);
            if (mission) {
                mission.status = 'COMPLETED';
                saveMockMissions(missions);
            }
            return mission;
        }
        try {
            const { data, error } = await this.supabase.from('missions').update({ status: 'COMPLETED' }).eq('id', missionId).select().single();
            if (error) throw error;
            return data;
        } catch (e) {
            console.warn("Supabase mockConfirmMissionCompletion failed, falling back to local:", e);
            const missions = getMockMissions();
            const mission = missions.find(m => m.id === missionId);
            if (mission) {
                mission.status = 'COMPLETED';
                saveMockMissions(missions);
            }
            return mission;
        }
    },

    async mockReportProblem(missionId) {
        if (!isUUID(missionId) || !this.supabase) {
            const missions = getMockMissions();
            const mission = missions.find(m => m.id === missionId);
            if (mission) {
                mission.status = 'DISPUTE';
                saveMockMissions(missions);
            }
            return mission;
        }
        try {
            const { data, error } = await this.supabase.from('missions').update({ status: 'DISPUTE' }).eq('id', missionId).select().single();
            if (error) throw error;
            return data;
        } catch (e) {
            console.warn("Supabase mockReportProblem failed, falling back to local:", e);
            const missions = getMockMissions();
            const mission = missions.find(m => m.id === missionId);
            if (mission) {
                mission.status = 'DISPUTE';
                saveMockMissions(missions);
            }
            return mission;
        }
    },


    // --- STATE MACHINE & ROLE-BASED ACTIONS ---
    getAvailableMissionActions(userId, mission) {
        if (!mission) {
            return [
                { id: 'MAKE_PROPOSAL', label: 'Faire une proposition', type: 'primary' },
                { id: 'REQUEST_HELP', label: 'Demander un coup de main', type: 'outline' },
                { id: 'PROPOSE_DATE', label: 'Proposer une date', type: 'outline' }
            ];
        }

        const isRequester = mission.requester_id === userId;
        const isHelper = mission.helper_id === userId;
        const state = mission.status;

        let actions = [];

        if (state === 'DISCUSSION') {
            if (isHelper || !isRequester) {
                actions.push({ id: 'MAKE_PROPOSAL', label: 'Faire une proposition', type: 'primary' });
            }
            actions.push({ id: 'REQUEST_HELP', label: 'Demander un coup de main', type: 'outline' });
            actions.push({ id: 'PROPOSE_DATE', label: 'Proposer une date', type: 'outline' });
        }

        if (state === 'PROPOSED') {
            const didIPropose = mission.proposed_by === userId;
            if (!didIPropose) {
                if (isRequester) {
                    actions.push({ id: 'ACCEPT_PRICE', label: 'Accepter', type: 'primary' });
                    actions.push({ id: 'DISCUSS_PRICE', label: 'Discuter du prix', type: 'outline' });
                } else {
                    actions.push({ id: 'ACCEPT_PRICE', label: 'Accepter l\'offre', type: 'primary' });
                    actions.push({ id: 'DISCUSS_PRICE', label: 'Discuter du prix', type: 'outline' });
                }
            } else {
                actions.push({ id: 'WAITING_ACCEPTANCE', label: 'Proposition envoyée (En attente)', type: 'disabled' });
                actions.push({ id: 'CANCEL_PROPOSAL', label: 'Annuler la proposition', type: 'outline' });
            }
        }
        
        if (state === 'AGREED') {
            if (isRequester) {
                actions.push({ id: 'PAY_MISSION', label: 'Payer et confirmer', type: 'primary' });
            } else {
                actions.push({ id: 'WAITING_PAYMENT', label: 'En attente du paiement', type: 'disabled' });
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
                actions.push({ id: 'CONFIRM_DONE', label: '✓ Tout est bon', type: 'primary' });
                actions.push({ id: 'REPORT_PROBLEM', label: '⚠️ Signaler un problème', type: 'outline' });
            } else {
                actions.push({ id: 'WAITING_VALIDATION', label: 'En attente de validation', type: 'disabled' });
            }
        }

        if (state === 'COMPLETED') {
            actions.push({ id: 'LEAVE_REVIEW', label: '⭐ Laisser un avis', type: 'primary' });
            actions.push({ id: 'RECOMMEND', label: '🤝 Recommander', type: 'outline' });
        }

        if (state === 'DISPUTE') {
            actions.push({ id: 'VIEW_DISPUTE', label: 'Voir le litige', type: 'primary' });
        }

        return actions;
    },

    // --- SERVICES MANAGEMENT ---
    async getUserServices(userId) {
        // Seed default mock items if empty
        try {
            if (!localStorage.getItem('lyann_mock_services')) {
                const defaultList = [
                    { title: "Entretien & Révision Climatisation Inverter", price: "60.00", billing: "/ unité", details: "Déplacement inclus", status: "Actif" },
                    { title: "Taille de Palmiers & Entretien Espaces Verts", price: "Sur devis", billing: "/ heure", details: "Matériel inclus", status: "Actif" }
                ];
                localStorage.setItem('lyann_mock_services', JSON.stringify(defaultList));
            }
        } catch (e) {}

        if (!isUUID(userId) || !this.supabase) {
            try {
                const mock = localStorage.getItem('lyann_mock_services');
                return mock ? JSON.parse(mock) : [];
            } catch (e) {
                return [];
            }
        }
        try {
            const { data, error } = await this.supabase
                .from('services')
                .select('*')
                .eq('owner_id', userId)
                .eq('active', true);
            if (error) throw error;
            return data.map(s => {
                const billingText = s.pricing_model === 'HOURLY' ? '/ heure' :
                                     s.pricing_model === 'DAILY' ? '/ jour' :
                                     s.pricing_model === 'FLAT_RATE' ? '/ unité' : '';
                return {
                    id: s.id,
                    title: s.title,
                    price: s.indicative_price ? s.indicative_price.toString() : 'Sur devis',
                    billing: billingText,
                    details: s.description || '',
                    status: s.active ? 'Actif' : 'Inactif'
                };
            });
        } catch (e) {
            console.warn("Supabase getUserServices failed, falling back to local:", e);
            try {
                const mock = localStorage.getItem('lyann_mock_services');
                return mock ? JSON.parse(mock) : [];
            } catch (err) {
                return [];
            }
        }
    },

    async addUserService(userId, title, price, billing, description) {
        const mockNewService = {
            id: 's_' + Math.random().toString(36).substr(2, 9),
            title,
            price,
            billing,
            details: description,
            status: 'Actif'
        };

        if (!isUUID(userId) || !this.supabase) {
            try {
                const mockObj = localStorage.getItem('lyann_mock_services');
                const list = mockObj ? JSON.parse(mockObj) : [];
                list.push(mockNewService);
                localStorage.setItem('lyann_mock_services', JSON.stringify(list));
            } catch(e) {}
            return mockNewService;
        }

        try {
            const pricing_model = billing === '/ heure' ? 'HOURLY' :
                                  billing === '/ jour' ? 'DAILY' :
                                  billing === 'Sur devis' ? 'QUOTE' : 'FLAT_RATE';
            const indicative_price = (price === 'Sur devis' || isNaN(parseFloat(price))) ? null : parseFloat(price);
            const slug = title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

            const { data, error } = await this.supabase
                .from('services')
                .insert({
                    owner_id: userId,
                    title,
                    slug,
                    description,
                    pricing_model,
                    indicative_price,
                    active: true
                })
                .select()
                .single();
            
            if (error) throw error;
            return {
                id: data.id,
                title: data.title,
                price: data.indicative_price ? data.indicative_price.toString() : 'Sur devis',
                billing: billing,
                details: data.description || '',
                status: 'Actif'
            };
        } catch (e) {
            console.warn("Supabase addUserService failed, falling back to local:", e);
            try {
                const mockObj = localStorage.getItem('lyann_mock_services');
                const list = mockObj ? JSON.parse(mockObj) : [];
                list.push(mockNewService);
                localStorage.setItem('lyann_mock_services', JSON.stringify(list));
            } catch(err) {}
            return mockNewService;
        }
    },

    // --- ENTERPRISE ADMIN BACK-OFFICE METHODS ---
    async getAdminMetrics() {
        if (!this.supabase) {
            return {
                totalUsers: 148,
                activeUsers: 112,
                verifiedPros: 89,
                totalMissions: 342,
                activeMissions: 24,
                gmv: 48650.00,
                revenue: 1459.50,
                protectionFees: 2432.50,
                activeBots: 8,
                openDisputes: 2
            };
        }
        try {
            const { count: usersCount } = await this.supabase.from('profiles').select('*', { count: 'exact', head: true });
            const { count: missionsCount } = await this.supabase.from('missions').select('*', { count: 'exact', head: true });
            return {
                totalUsers: usersCount || 148,
                activeUsers: Math.round((usersCount || 148) * 0.8),
                verifiedPros: Math.round((usersCount || 148) * 0.6),
                totalMissions: missionsCount || 342,
                activeMissions: 24,
                gmv: 48650.00,
                revenue: 1459.50,
                protectionFees: 2432.50,
                activeBots: 8,
                openDisputes: 2
            };
        } catch (e) {
            console.warn("Failed fetching admin metrics from Supabase:", e);
            return { totalUsers: 148, activeUsers: 112, verifiedPros: 89, totalMissions: 342, activeMissions: 24, gmv: 48650.00, revenue: 1459.50 };
        }
    },

    async logAuditAction(actorUsername, action, moduleName, resourceType, resourceId, accessReason = null, oldVals = null, newVals = null) {
        const logEntry = {
            actor_username: actorUsername || 'Yoyoothetrack',
            action,
            module: moduleName,
            resource_type: resourceType,
            resource_id: resourceId,
            access_reason: accessReason,
            old_values: oldVals,
            new_values: newVals,
            created_at: new Date().toISOString()
        };

        if (this.supabase) {
            try {
                await this.supabase.from('audit_logs').insert([logEntry]);
            } catch (err) {
                console.warn("Audit log insert warning:", err);
            }
        }

        try {
            const raw = localStorage.getItem('lyann_admin_audit_logs');
            const list = raw ? JSON.parse(raw) : [];
            list.unshift(logEntry);
            localStorage.setItem('lyann_admin_audit_logs', JSON.stringify(list.slice(0, 500)));
        } catch (e) {}
    },

    findMatchingLyanneurs(needQuery, options) {
        if (typeof window !== 'undefined' && window.LyannMatchingEngine) {
            return window.LyannMatchingEngine.findMatchingLyanneursForNeed(needQuery, window.LYANN_MEMBERS || [], options);
        }
        return { matches_found: 0, lyanneurs: [] };
    },

    dispatchTargetedNeed(needData, batchSize = 5) {
        if (typeof window !== 'undefined' && window.LyannMatchingEngine) {
            return window.LyannMatchingEngine.dispatchTargetedNeedNotifications(needData, window.LYANN_MEMBERS || [], batchSize);
        }
        return { dispatched_count: 0, fallback_message: "Votre besoin est bien publié dans Bokantaj." };
    },

    // --- REAL HELP REQUESTS API (requests table) ---
    async createRequest(payload) {
        if (!this.supabase) {
            throw new Error("Supabase non initialisé");
        }
        
        // Identity MUST come strictly from session auth.uid()
        const { data: { session } } = await this.supabase.auth.getSession();
        if (!session || !session.user) {
            throw new Error("Utilisateur non connecté");
        }
        const authUid = session.user.id;

        // Security enforcement: Reject any attempt to spoof requester_id
        if (payload.requester_id && payload.requester_id !== authUid) {
            throw new Error("Sécurité: Falsification de requester_id refusée. L'identité provient uniquement de la session.");
        }

        const requestData = {
            id: payload.id || (typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : undefined),
            requester_id: authUid,
            title: payload.title || "Demande d'aide",
            description: payload.description || "",
            category: payload.category || "Général",
            location: payload.location || "Guadeloupe",
            budget: payload.budget !== undefined && payload.budget !== null && payload.budget !== '' ? Number(payload.budget) : null,
            urgency: payload.urgency || "Normale",
            status: payload.status || "OPEN",
            created_at: new Date().toISOString()
        };

        const { data, error } = await this.supabase
            .from('requests')
            .insert([requestData])
            .select()
            .single();

        if (error) {
            console.error("Erreur création demande Supabase DB:", error);
            throw error;
        }
        return data;
    },

    async getRequests(filters = {}) {
        if (!this.supabase) return [];
        let query = this.supabase
            .from('requests')
            .select('*')
            .order('created_at', { ascending: false });

        if (filters.requester_id) {
            query = query.eq('requester_id', filters.requester_id);
        }
        if (filters.category) {
            query = query.eq('category', filters.category);
        }

        const { data, error } = await query;
        if (error) {
            console.error("Erreur récupération requests:", error);
            return [];
        }
        return data || [];
    },

    async updateRequest(requestId, updates) {
        if (!this.supabase) throw new Error("Supabase non initialisé");
        const { data: { session } } = await this.supabase.auth.getSession();
        if (!session || !session.user) throw new Error("Utilisateur non connecté");

        const { data, error } = await this.supabase
            .from('requests')
            .update(updates)
            .eq('id', requestId)
            .select()
            .single();

        if (error) throw error;
        return data;
    },

    async deleteRequest(requestId) {
        if (!this.supabase) throw new Error("Supabase non initialisé");
        const { data: { session } } = await this.supabase.auth.getSession();
        if (!session || !session.user) throw new Error("Utilisateur non connecté");

        const { error } = await this.supabase
            .from('requests')
            .delete()
            .eq('id', requestId);

        if (error) throw error;
        return true;
    },

    async uploadRequestPhoto(file) {
        if (!this.supabase || !file) return null;
        const { data: { session } } = await this.supabase.auth.getSession();
        if (!session || !session.user) throw new Error("Utilisateur non connecté");

        const fileExt = file.name ? file.name.split('.').pop() : 'png';
        const filePath = `${session.user.id}/${Date.now()}_${Math.random().toString(36).substring(2, 7)}.${fileExt}`;

        let bucket = 'request-photos';
        const { data, error } = await this.supabase.storage
            .from(bucket)
            .upload(filePath, file, { upsert: true });

        if (error) {
            console.warn("Storage upload warning (bucket request-photos):", error);
            return null;
        }

        const { data: publicUrlData } = this.supabase.storage.from(bucket).getPublicUrl(filePath);
        return publicUrlData ? publicUrlData.publicUrl : null;
    }
};

window.LYANN_API_CLIENT = LYANN_API_CLIENT;

