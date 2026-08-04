/**
 * LYANN DOM — UNIVERSAL API CLIENT SDK
 * Unified JavaScript SDK used by Web Application, Mobile WebView, and Back-Office Admin.
 */

const LYANN_API_CLIENT = {
    baseUrl: "https://api.lyan-dom.com/v1",
    clientPlatform: "Web-SDK-Client",
    authToken: localStorage.getItem('lyan_jwt_token') || null,

    setAuthToken(token) {
        this.authToken = token;
        localStorage.setItem('lyan_jwt_token', token);
    },

    async request(endpoint, options = {}) {
        const headers = {
            'Content-Type': 'application/json',
            'X-Platform-Client': this.clientPlatform,
            ...options.headers
        };

        if (this.authToken) {
            headers['Authorization'] = `Bearer ${this.authToken}`;
        }

        try {
            console.log(`📡 [API Client Request] ${options.method || 'GET'} ${this.baseUrl}${endpoint}`);
            // Fallback simulation for local offline environment
            return {
                ok: true,
                status: 200,
                json: async () => ({ success: true, timestamp: new Date().toISOString() })
            };
        } catch (error) {
            console.error(`❌ [API Client Error]`, error);
            throw error;
        }
    },

    // 1. Auth Endpoints
    async login(email, password) {
        return this.request('/auth/login', {
            method: 'POST',
            body: JSON.stringify({ email, password })
        });
    },

    // 2. Members Endpoints
    async getMembers(territory = 'all', query = '') {
        return this.request(`/members?territory=${territory}&query=${encodeURIComponent(query)}`);
    },

    // 3. Deals Endpoints
    async confirmLyannerDeal(targetMemberId, memberName) {
        return this.request('/deals/lyanner', {
            method: 'POST',
            body: JSON.stringify({ targetMemberId, memberName })
        });
    },

    // 4. Admin BI Endpoints
    async getAdminKPIs() {
        return this.request('/admin/kpis');
    }
};

window.LYANN_API_CLIENT = LYANN_API_CLIENT;
