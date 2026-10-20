'use strict';

require('./force-staging-v2-env');
const { createClient } = require('@supabase/supabase-js');
const { assertStagingIsolation, STAGING_REF, PRODUCTION_REF } = require('./staging-v2-guard');
const { runModerationOnce } = require('../api/moderation-worker');

assertStagingIsolation(process.env);
const url = String(process.env.SUPABASE_URL || '');
if (!url.includes(STAGING_REF) || url.includes(PRODUCTION_REF)) {
    throw new Error('worker refused a non-staging database');
}
if (!process.env.OPENAI_API_KEY) {
    console.log('OPENAI_API_KEY absent: pending content stays unpublished');
}

const supabaseAdmin = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false }
});

runModerationOnce({
    supabaseAdmin,
    apiKey: process.env.OPENAI_API_KEY || '',
    fetchImpl: global.fetch
}).then((outcomes) => {
    const counts = {};
    for (const item of outcomes) counts[item.result || 'unknown'] = (counts[item.result || 'unknown'] || 0) + 1;
    console.log(JSON.stringify({ processed: outcomes.length, counts }));
}).catch((error) => {
    console.error(String(error && error.message || error).replace(/eyJ[A-Za-z0-9_-]{20,}/g, '[redacted]'));
    process.exitCode = 1;
});
