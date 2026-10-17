'use strict';

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { createClient } = require('@supabase/supabase-js');
const { EDITORIAL_BOTS, EDITORIAL_BADGE, editorialEmail } = require('../api/editorial-engine');

const STAGING_REF = 'tdktfbtqceldlaeqjtow';
require('dotenv').config({ path: path.join(__dirname, '..', '.env.staging-v2'), override: true });
const url = process.env.SUPABASE_URL || '';
if (!url.includes(STAGING_REF)) {
    console.error('REFUS: comptes éditoriaux uniquement sur Staging.');
    process.exit(1);
}
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const payload = JSON.parse(Buffer.from(serviceKey.split('.')[1], 'base64url').toString());
if (payload.ref !== STAGING_REF || payload.role !== 'service_role') {
    console.error('REFUS: clé service hors Staging.');
    process.exit(1);
}
const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });

async function findUser(email) {
    let page = 1;
    while (page < 20) {
        const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 200 });
        if (error) throw error;
        const found = (data.users || []).find((user) => (user.email || '').toLowerCase() === email);
        if (found) return found;
        if ((data.users || []).length < 200) return null;
        page += 1;
    }
    return null;
}

async function main() {
    const password = crypto.randomBytes(18).toString('base64url');
    const results = [];
    for (const bot of EDITORIAL_BOTS) {
        const email = editorialEmail(bot.slug);
        let user = await findUser(email);
        if (!user) {
            const created = await supabase.auth.admin.createUser({
                email,
                password,
                email_confirm: true,
                user_metadata: { account_origin: 'editorial', editorial_badge: EDITORIAL_BADGE }
            });
            if (created.error) throw created.error;
            user = created.data.user;
        }
        const svg = fs.readFileSync(path.join(__dirname, '..', 'assets', 'editorial', `${bot.slug}.svg`));
        const objectPath = `${user.id}/editorial.svg`;
        const upload = await supabase.storage.from('avatars').upload(objectPath, svg, { contentType: 'image/svg+xml', upsert: true });
        if (upload.error) throw upload.error;
        const avatarUrl = supabase.storage.from('avatars').getPublicUrl(objectPath).data.publicUrl;
        const profile = {
            first_name: 'LYANN',
            last_name: bot.name.replace(/^LYANN\s+/, ''),
            email,
            territory: bot.territories[0],
            city: bot.territories.includes('martinique') && bot.territories.includes('guadeloupe') ? 'Guadeloupe et Martinique' : 'Guadeloupe',
            bio: `${EDITORIAL_BADGE}. ${bot.bio}`,
            avatar_url: avatarUrl,
            account_type: 'system',
            is_pro: false,
            is_agent: true,
            professional_status: bot.specialty,
            updated_at: new Date().toISOString()
        };
        const existing = await supabase.from('profiles').select('id').eq('id', user.id).maybeSingle();
        const saved = existing.data
            ? await supabase.from('profiles').update(profile).eq('id', user.id)
            : await supabase.from('profiles').insert({ id: user.id, ...profile });
        if (saved.error) throw saved.error;
        const agentRow = {
            linked_profile_id: user.id,
            agent_name: bot.name,
            status: 'ACTIVE',
            personality: bot.specialty,
            tone: 'factuel',
            languages: ['fr'],
            zones: bot.territories,
            skills: [bot.specialty],
            autonomy_level: 0,
            system_instructions: JSON.stringify({
                badge: EDITORIAL_BADGE,
                maxPerDay: bot.maxPerDay,
                healthReview: bot.healthReview,
                sources: bot.sources
            }),
            updated_at: new Date().toISOString()
        };
        const current = await supabase.from('lyann_agents').select('id').eq('linked_profile_id', user.id).maybeSingle();
        const agent = current.data
            ? await supabase.from('lyann_agents').update(agentRow).eq('id', current.data.id)
            : await supabase.from('lyann_agents').insert(agentRow);
        if (agent.error) throw agent.error;
        results.push({ name: bot.name, email, territory: profile.city });
        console.log(`OK ${bot.name}`);
    }
    const creds = path.join(__dirname, '..', 'scratch', 'editorial-credentials.json');
    fs.mkdirSync(path.dirname(creds), { recursive: true });
    fs.writeFileSync(creds, JSON.stringify({ createdAt: new Date().toISOString(), accounts: results.map((row) => row.email) }, null, 2), { mode: 0o600 });
    console.log(`Done ${results.length}`);
}

main().catch((error) => {
    console.error(error.message || error);
    process.exit(1);
});
