/**
 * LYANN DOM — SUPABASE & API CLIENT SDK
 * Replaces the mock API Client with a real Supabase JS client integration.
 */

// Global Supabase init
const SUPABASE_URL = 'YOUR_SUPABASE_URL'; // To be replaced via env or config
const SUPABASE_ANON_KEY = 'YOUR_SUPABASE_ANON_KEY';

// We assume the Supabase CDN script is loaded before this script.
let supabase;
if (window.supabase) {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log("⚡ Supabase client initialized.");
} else {
    console.error("❌ Supabase JS SDK missing!");
}

const LYANN_API_CLIENT = {
    supabase: supabase,

    // 1. Auth Methods
    async signUp(email, password, metadata = {}) {
        return await supabase.auth.signUp({
            email,
            password,
            options: { data: metadata }
        });
    },

    async login(email, password) {
        return await supabase.auth.signInWithPassword({ email, password });
    },

    async logout() {
        return await supabase.auth.signOut();
    },

    async getSession() {
        return await supabase.auth.getSession();
    },

    async getUser() {
        return await supabase.auth.getUser();
    },

    // 2. Data Retrieval Methods
    async getProfile(userId) {
        return await supabase.from('profiles').select('*').eq('id', userId).single();
    },

    async getMembers(territory = 'all', query = '') {
        let req = supabase.from('profiles').select('*');
        if (territory && territory !== 'all') {
            req = req.eq('territory', territory);
        }
        if (query) {
            req = req.or(`first_name.ilike.%${query}%,last_name.ilike.%${query}%,bio.ilike.%${query}%`);
        }
        return await req;
    },

    async getFeed() {
        return await supabase.from('bokantaj_posts').select(`
            *,
            profiles(first_name, last_name, avatar_url)
        `).order('created_at', { ascending: false });
    },

    async getQuotes(userId) {
        return await supabase.from('quotes').select(`
            *,
            provider:profiles!provider_id(first_name, last_name, avatar_url),
            client:profiles!client_id(first_name, last_name, avatar_url)
        `).or(`provider_id.eq.${userId},client_id.eq.${userId}`);
    },

    // 3. Server Action (Stripe / Notifications)
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
    }
};

window.LYANN_API_CLIENT = LYANN_API_CLIENT;
