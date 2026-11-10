'use strict';
// Preload for local runs of api/server.js against the SHARED Staging project: no background worker may start, so the local
// process never claims moderation or push rows that belong to the Vercel cron. Load it AFTER force-staging-v2-env.js.
delete process.env.OPENAI_API_KEY;
delete process.env.MODERATION_WORKER_SECRET;
process.env.LYANN_ALLOW_LOCAL_PUSH_DRAIN = 'false';
