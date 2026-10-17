'use strict';

const {
    EDITORIAL_BOTS,
    parseRssItems,
    draftFromSource,
    canCollect,
    classifyFeed,
    parseJsonLdList,
    parseEventJsonLd,
    isFresh,
    matchesTerms,
    acceptRewrittenText
} = require('./editorial-engine');
const STAGING_PROJECT_ID = 'prj_FHIKUKYa8IwpiitigUma4gTtTF6q';
const PRODUCTION_PROJECT_ID = 'prj_avTkY4HCjHZSdd9ZvRj1JPSQSAfM';

function oidcClaims(token) {
    try {
        const payload = JSON.parse(Buffer.from(String(token || '').split('.')[1], 'base64url').toString('utf8'));
        return {
            projectId: payload.project_id || '',
            environment: payload.environment || '',
            exp: Number(payload.exp) || 0
        };
    } catch (_) {
        return null;
    }
}

function providerConfig(env) {
    if (env.LYANN_AI_API_KEY) {
        return {
            mode: 'api-key',
            apiKey: env.LYANN_AI_API_KEY,
            baseUrl: (env.LYANN_AI_BASE_URL || 'https://api.openai.com/v1').replace(/\/+$/, ''),
            model: env.LYANN_AI_MODEL || 'gpt-4o-mini'
        };
    }
    const token = env.VERCEL_OIDC_TOKEN || '';
    const claims = oidcClaims(token);
    if (!claims) return { error: 'oidc-absent' };
    if (claims.projectId === PRODUCTION_PROJECT_ID) return { error: 'oidc-production-refused' };
    if (claims.projectId !== STAGING_PROJECT_ID) return { error: 'oidc-wrong-project' };
    if (claims.exp * 1000 <= Date.now()) return { error: 'oidc-expired' };
    if (env.LYANN_EDITORIAL_AI_ENABLED !== '1') return { error: 'spend-not-authorized' };
    return {
        mode: 'oidc',
        apiKey: token,
        baseUrl: 'https://ai-gateway.vercel.sh/v1',
        model: env.LYANN_AI_MODEL || 'openai/gpt-4o-mini'
    };
}

async function fetchText(url) {
    const response = await fetch(url, {
        headers: { 'user-agent': 'LYANN-Editorial/1.0 (+https://staging.lyann.app)' },
        redirect: 'follow'
    });
    if (!response.ok) throw new Error(`Source indisponible (${response.status})`);
    return response.text();
}

async function rewriteDraft(draft, fetchImpl) {
    const config = providerConfig(process.env);
    if (!config || config.error) return { ok: false, reason: config && config.error || 'clé IA absente' };
    const response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({
            model: config.model,
            temperature: 0.2,
            max_tokens: 280,
            messages: [
                {
                    role: 'system',
                    content: [
                        'Tu rédiges un court texte original en français courant, entre 50 et 100 mots.',
                        'Tu n’utilises que les faits fournis. Tu n’ajoutes aucun chiffre, lieu, date ou conseil absent du texte source.',
                        'Tu ne recopies pas le titre seul. Tu reformules les faits avec tes mots, sans changer le sens.',
                        'Tu n’écris pas le nom du média ni une formule « selon » le média. Tu gardes l’attribution si le fait est une décision, une déclaration ou une accusation.',
                        'Tu n’inventes aucun fait, chiffre, date ou citation. Pas d’emoji, pas de créole forcé, pas de question artificielle.',
                        'Si le sujet touche la santé, tu ne donnes ni dosage, ni promesse de guérison.'
                    ].join(' ')
                },
                {
                    role: 'user',
                    content: `Source: ${draft.sourceName}\nURL: ${draft.sourceUrl}\nTitre: ${draft.subject}\nFaits: ${draft.facts}`
                }
            ]
        })
    });
    if (!response.ok) return { ok: false, reason: `modèle indisponible (${response.status})` };
    const payload = await response.json();
    const text = acceptRewrittenText(payload?.choices?.[0]?.message?.content, draft);
    if (!text) return { ok: false, reason: 'réponse du modèle refusée' };
    return { ok: true, text };
}

async function itemsFromSource(source, fetchText) {
    if (source.kind === 'manual') return { status: 'veille manuelle', items: [] };
    let body = '';
    try {
        body = await fetchText(source.url);
    } catch (error) {
        return { status: 'inaccessible', items: [], detail: error.message };
    }
    const status = classifyFeed(body, source.kind);
    if (status !== 'exploitable') return { status, items: [] };
    if (source.kind === 'rss') {
        const now = Date.now();
        const parsed = parseRssItems(body).filter((item) => item.summary);
        const fresh = parsed.filter((item) => isFresh(item.publishedAt, now, source.maxAgeHours));
        const items = fresh.filter((item) => matchesTerms(item, source.requireTerms));
        let status = 'exploitable';
        if (!parsed.length) status = 'flux vide';
        else if (!fresh.length) status = 'date trop ancienne';
        else if (!items.length) status = 'hors sujet';
        return { status: items.length ? 'exploitable' : status, items };
    }
    return { status, items: parseJsonLdList(body) };
}

async function existingSourceUrls(supabase, agentId) {
    const { data, error } = await supabase
        .from('lyann_agent_tasks')
        .select('metadata')
        .eq('agent_id', agentId)
        .limit(200);
    if (error) throw error;
    return new Set((data || []).map((row) => row.metadata && row.metadata.source_url).filter(Boolean));
}

async function collectEditorial(supabase, options = {}) {
    const names = EDITORIAL_BOTS.map((bot) => bot.name);
    const { data: agents, error } = await supabase.from('lyann_agents').select('id, agent_name, status, linked_profile_id').in('agent_name', names);
    if (error) throw error;
    const created = [];
    const skipped = [];
    const diagnoses = [];
    for (const bot of EDITORIAL_BOTS) {
        const agent = (agents || []).find((row) => row.agent_name === bot.name);
        if (!agent) {
            skipped.push({ bot: bot.name, reason: 'absent' });
            continue;
        }
        if (!canCollect(agent, 0)) {
            skipped.push({ bot: bot.name, reason: agent.status });
            continue;
        }
        const seen = await existingSourceUrls(supabase, agent.id);
        const sources = (bot.sources || []).filter((item) => !options.onlySlug || options.onlySlug === bot.slug);
        let drafted = false;
        for (const source of sources) {
            const found = await itemsFromSource(source, fetchText);
            diagnoses.push({ bot: bot.name, source: source.name, status: found.status, url: source.url });
            if (found.status === 'veille manuelle' || !found.items.length) continue;
            for (const item of found.items.slice(0, 3)) {
                let article = item;
                if (source.kind === 'jsonld') {
                    try {
                        article = parseEventJsonLd(await fetchText(item.url)) || item;
                    } catch (error) {
                        diagnoses.push({ bot: bot.name, source: source.name, status: 'inaccessible', url: item.url, detail: error.message });
                        continue;
                    }
                    if (!article.summary || !article.publishedAt) continue;
                }
                if (!article.url || seen.has(article.url)) {
                    if (article.url && seen.has(article.url)) skipped.push({ bot: bot.name, reason: 'doublon', url: article.url });
                    continue;
                }
                const draft = draftFromSource({ ...article, sourceName: source.name, territory: source.territory }, bot);
                if (!draft) continue;
                const rewritten = await rewriteDraft(draft, options.fetchImpl || fetch);
                if (!rewritten.ok) {
                    skipped.push({ bot: bot.name, reason: rewritten.reason, url: draft.sourceUrl });
                    drafted = true;
                    break;
                }
                const { data, error: insertError } = await supabase.from('lyann_agent_tasks').insert({
                    agent_id: agent.id,
                    title: draft.subject.slice(0, 180),
                    instruction: rewritten.text,
                    task_type: 'POST_CREATION',
                    status: 'WAITING_APPROVAL',
                    requires_approval: true,
                    approval_status: 'PENDING',
                    metadata: {
                        editorial: true,
                        slug: bot.slug,
                        source_name: draft.sourceName,
                        source_url: draft.sourceUrl,
                        original_published_at: draft.originalPublishedAt,
                        collected_at: new Date().toISOString(),
                        territory: draft.territory,
                        subject: draft.subject,
                        facts: draft.facts,
                        validation_status: draft.validationStatus,
                        proposed_text: rewritten.text,
                        profile_id: agent.linked_profile_id,
                        generator: 'model'
                    }
                }).select('id').single();
                if (insertError) throw insertError;
                seen.add(article.url);
                created.push({ bot: bot.name, id: data.id, url: draft.sourceUrl, validation: draft.validationStatus });
                drafted = true;
                break;
            }
            if (drafted) break;
        }
        if (!drafted && !skipped.some((row) => row.bot === bot.name)) {
            skipped.push({ bot: bot.name, reason: 'aucune source exploitable' });
        }
    }
    return { created, skipped, diagnoses };
}

async function publishEditorialTask(supabase, task, editorText) {
    const metadata = task.metadata || {};
    if (!metadata.editorial) throw new Error('Cette tâche n’est pas une proposition éditoriale.');
    if (metadata.validation_status === 'HUMAN_REQUIRED' && !editorText) {
        // Human approval is the validation. The editor must send the text explicitly.
    }
    const { data: agent } = await supabase.from('lyann_agents').select('status, linked_profile_id').eq('id', task.agent_id).maybeSingle();
    if (!agent || agent.status === 'SUSPENDED') throw new Error('Ce compte éditorial est suspendu.');
    const content = String(editorText || task.instruction || '').trim();
    if (!content || !metadata.source_url) throw new Error('La proposition n’a pas de source.');
    const body = content.replace(/\n*Source\s*:[\s\S]*$/i, '').trim();
    const { data: post, error } = await supabase.from('bokantaj_posts').insert({
        author_id: agent.linked_profile_id,
        type: 'info',
        headline: metadata.subject || task.title || null,
        content: body,
        source_name: metadata.source_name || null,
        source_url: metadata.source_url || null,
        source_published_at: metadata.original_published_at || null,
        city: null,
        territory: metadata.territory || null,
        media_urls: []
    }).select('id').single();
    if (error) throw error;
    await supabase.from('lyann_agent_tasks').update({
        status: 'COMPLETED',
        approval_status: 'APPROVED',
        instruction: content,
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    }).eq('id', task.id);
    return post.id;
}

module.exports = { collectEditorial, publishEditorialTask, providerConfig, oidcClaims };
