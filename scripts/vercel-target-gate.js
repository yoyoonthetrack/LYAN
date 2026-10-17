'use strict';

const fs = require('fs');
const path = require('path');

const PRODUCTION_REF = 'gzispjfoywklpqatjyop';

function loadPolicy(file = path.join(__dirname, '..', 'config', 'vercel-staging-allowlist.json')) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function readLinkedProject(file) {
    if (!file || !fs.existsSync(file)) return {};
    try {
        const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
        return {
            projectId: String(parsed.projectId || ''),
            orgId: String(parsed.orgId || ''),
            projectName: String(parsed.projectName || parsed.name || '')
        };
    } catch (_) {
        return { unreadable: true };
    }
}

function hostOf(value) {
    const raw = String(value || '').trim().toLowerCase();
    if (!raw) return '';
    try {
        return new URL(raw.includes('://') ? raw : `https://${raw}`).hostname;
    } catch (_) {
        return raw.replace(/^https?:\/\//, '').split('/')[0].split(':')[0];
    }
}

function decideVercelTarget(input, policy) {
    const linked = input.linked || {};
    const projectId = String(input.projectId || '').trim();
    const linkedId = String(linked.projectId || '').trim();
    const name = String(input.projectName || linked.projectName || '').trim();
    const orgId = String(input.orgId || linked.orgId || '').trim();
    const domains = (input.domains || []).map(hostOf).filter(Boolean);
    const productionIds = new Set(policy.productionProjectIds || []);
    const productionNames = new Set(policy.productionProjectNames || []);
    const productionDomains = new Set(policy.productionDomains || []);
    const stagingIds = new Set(policy.stagingProjectIds || []);
    const stagingNames = new Set(policy.stagingProjectNames || []);
    const expectedOrgs = new Set(policy.expectedOrgIds || []);

    if (linked.unreadable) return { ok: false, code: 'UNKNOWN', detail: 'lien Vercel illisible' };
    if (linkedId && projectId && linkedId !== projectId) {
        return { ok: false, code: 'AMBIGUOUS', detail: 'project.json et VERCEL_PROJECT_ID différent' };
    }
    const targetId = projectId || linkedId;
    if (!targetId || !orgId || !name) {
        return { ok: false, code: 'UNKNOWN', detail: 'Project ID, Team ID ou nom absent' };
    }
    if (productionIds.has(targetId) || productionNames.has(name)) {
        return { ok: false, code: 'PRODUCTION', detail: `${name} ${targetId}` };
    }
    if (domains.some((domain) => productionDomains.has(domain))) {
        return { ok: false, code: 'PRODUCTION_DOMAIN', detail: domains.join(',') };
    }
    if (!expectedOrgs.has(orgId)) {
        return { ok: false, code: 'ORG', detail: expectedOrgs.size ? orgId : 'Team ID Staging non confirmé' };
    }
    if (!stagingIds.has(targetId) || !stagingNames.has(name)) {
        return { ok: false, code: 'UNKNOWN', detail: `${name} ${targetId}` };
    }
    const blob = JSON.stringify({
        url: input.supabaseUrl || '',
        key: input.supabaseKey || '',
        stripe: input.stripeSecret || '',
        origin: input.publicOrigin || ''
    });
    if (blob.includes(PRODUCTION_REF) || String(input.stripeSecret || '').startsWith('sk_live_')) {
        return { ok: false, code: 'PRODUCTION_CONFIG', detail: 'référence Production dans la configuration' };
    }
    if (hostOf(input.publicOrigin) && productionDomains.has(hostOf(input.publicOrigin))) {
        return { ok: false, code: 'PRODUCTION_DOMAIN', detail: input.publicOrigin };
    }
    if (policy.stagingSupabaseRef && input.supabaseUrl && !String(input.supabaseUrl).includes(policy.stagingSupabaseRef)) {
        return { ok: false, code: 'PRODUCTION_CONFIG', detail: 'Supabase hors Staging' };
    }
    return { ok: true, code: 'STAGING', detail: `${name} ${targetId}` };
}

function inputFromEnv(env = process.env) {
    const linked = readLinkedProject(env.LYANN_VERCEL_PROJECT_FILE || path.join(process.cwd(), '.vercel', 'project.json'));
    return {
        projectId: env.VERCEL_PROJECT_ID || '',
        orgId: env.VERCEL_ORG_ID || '',
        projectName: env.VERCEL_PROJECT_NAME || '',
        publicOrigin: env.LYANN_STAGING_PUBLIC_ORIGIN || '',
        supabaseUrl: env.SUPABASE_URL || '',
        supabaseKey: env.SUPABASE_SERVICE_ROLE_KEY || '',
        stripeSecret: env.STRIPE_SECRET_KEY || '',
        domains: String(env.LYANN_VERCEL_DOMAINS || '').split(',').filter(Boolean),
        linked
    };
}

function main() {
    const decision = decideVercelTarget(inputFromEnv(), loadPolicy());
    if (!decision.ok) {
        console.error(`REFUS ${decision.code} : ${decision.detail}`);
        process.exit(1);
    }
    console.log(`ACCEPTÉ ${decision.detail}`);
}

if (require.main === module) main();

module.exports = { decideVercelTarget, loadPolicy, inputFromEnv };
