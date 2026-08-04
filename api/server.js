/**
 * LYANN DOM — MULTI-CLIENT REST API ENGINE (Express Production Server)
 * Supports Web, iOS Native, Android Native, and Enterprise Admin Console.
 */

const express = require('express');
const cors = require('cors');
const app = express();
const PORT = process.env.PORT || 3000;

// Enable CORS for all clients (Web App, iOS Swift, Android Kotlin, Admin Back-Office)
app.use(cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Platform-Client']
}));

app.use(express.json());

// In-Memory Database (Synced with LYANN DOM Data)
const MEMBERS_DB = [
    { id: 1, name: "David Jean-Baptiste", age: 34, role: "Électricien & Climaticien PRO", city: "Baie-Mahault", locationName: "Guadeloupe (971)", territoryKey: "guadeloupe", rating: "4.9", avatar: "david-34.png", badge: "PRO VÉRIFIÉ", kycVerified: true },
    { id: 2, name: "Tati Huguette Cazeau", age: 68, role: "Membre Senior Actif", city: "Fort-de-France", locationName: "Martinique (972)", territoryKey: "martinique", rating: "5.0", avatar: "huguette-68.png", badge: "VOISIN DE CONFIANCE", kycVerified: true },
    { id: 3, name: "Sarah Manicon", age: 29, role: "Design d'Intérieur & Peinture", city: "Le Gosier", locationName: "Guadeloupe (971)", territoryKey: "guadeloupe", rating: "4.85", avatar: "sarah-29.png", badge: "TALENT RECOMMANDÉ", kycVerified: true },
    { id: 4, name: "Kevin Bellerose", age: 41, role: "Paysagiste & Entretien Créole", city: "Cayenne", locationName: "Guyane (973)", territoryKey: "guyane", rating: "4.95", avatar: "kevin-41.png", badge: "ARTISAN VÉRIFIÉ", kycVerified: true },
    { id: 5, name: "Man Saint-Louis", age: 72, role: "Expert Jardinage & Botanique", city: "Sainte-Anne", locationName: "Guadeloupe (971)", territoryKey: "guadeloupe", rating: "5.0", avatar: "saint-louis-72.png", badge: "SAGESSE COMMUNAUTAIRE", kycVerified: true }
];

// Middleware Logging & Multi-Client Tag
app.use((req, res, next) => {
    const clientType = req.headers['x-platform-client'] || 'Web-Client';
    console.log(`[API v1] ${new Date().toISOString()} | ${req.method} ${req.url} | Client: ${clientType}`);
    next();
});

// API Root Status
app.get('/v1', (req, res) => {
    res.json({
        status: "ONLINE",
        service: "LYANN DOM Multi-Client REST API Engine",
        version: "1.0.0",
        territories: ["Guadeloupe (971)", "Martinique (972)", "Guyane (973)", "La Réunion (974)"]
    });
});

// 1. AUTHENTICATION (POST /v1/auth/login)
app.post('/v1/auth/login', (req, res) => {
    const { email, password } = req.body;
    if (!email) {
        return res.status(400).json({ error: "L'adresse email est requise." });
    }
    const token = "jwt_token_demo_lyan_dom_2026_secure";
    res.json({
        success: true,
        token,
        user: {
            id: 1,
            name: "David Jean-Baptiste",
            email: email,
            role: "provider",
            territory: "Guadeloupe (971)"
        }
    });
});

// 2. MEMBERS DIRECTORY (GET /v1/members)
app.get('/v1/members', (req, res) => {
    const { territory, query } = req.query;
    let filtered = [...MEMBERS_DB];

    if (territory && territory !== 'all') {
        filtered = filtered.filter(m => m.territoryKey === territory.toLowerCase());
    }

    if (query) {
        const q = query.toLowerCase();
        filtered = filtered.filter(m => m.name.toLowerCase().includes(q) || m.role.toLowerCase().includes(q));
    }

    res.json({
        count: filtered.length,
        data: filtered
    });
});

// 3. MEMBER DETAILS (GET /v1/members/:id)
app.get('/v1/members/:id', (req, res) => {
    const id = parseInt(req.params.id);
    const member = MEMBERS_DB.find(m => m.id === id);
    if (!member) {
        return res.status(404).json({ error: "Membre non trouvé." });
    }
    res.json({ data: member });
});

// 4. LYANNER DEAL CLOSURE (POST /v1/deals/lyanner)
app.post('/v1/deals/lyanner', (req, res) => {
    const { targetMemberId, memberName } = req.body;
    const phone = "+590690001122";
    const whatsappUrl = `https://wa.me/590690001122?text=${encodeURIComponent(`Bonjour ${memberName} ! Nous sommes Lyannés sur LYANN DOM.`)}`;

    res.json({
        success: true,
        message: "Accord LYANNER validé.",
        shortcuts: {
            whatsappUrl,
            phoneUrl: `tel:${phone}`
        }
    });
});

// 5. ADMIN KPIS (GET /v1/admin/kpis)
app.get('/v1/admin/kpis', (req, res) => {
    res.json({
        gmvMonth: 48920,
        mrrCommissions: 7338,
        activeMembers: 12480,
        completedDeals: 1420,
        territoryBreakdown: {
            guadeloupe: 42,
            martinique: 36,
            guyane: 14,
            reunion: 8
        }
    });
});

// Start Server
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`🚀 LYANN DOM API Engine en écoute sur http://localhost:${PORT}/v1`);
    });
}

module.exports = app;
