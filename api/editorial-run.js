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
    acceptRewrittenText,
    reviewEditorialText,
    assertHumanApproval,
    editorialPassSlot,
    guadeloupeDayStart
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

async function completeOnce(config, messages, fetchImpl) {
    const response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
        body: JSON.stringify({
            model: config.model,
            temperature: 0.2,
            max_tokens: 320,
            messages
        })
    });
    if (!response.ok) return { ok: false, reason: `modèle indisponible (${response.status})` };
    return { ok: true, payload: await response.json() };
}

async function rewriteDraft(draft, fetchImpl) {
    const config = providerConfig(process.env);
    if (!config || config.error) return { ok: false, reason: config && config.error || 'clé IA absente' };
    const extracted = await completeOnce(config, [
        { role: 'system', content: 'Extrais uniquement les faits vérifiables. Réponds en JSON: {"faits":["qui","quoi","où","quand","chiffres","décision","réserves"]}. N’invente rien.' },
        { role: 'user', content: draft.facts }
    ], fetchImpl);
    if (!extracted.ok) return extracted;
    const factList = extracted.payload?.choices?.[0]?.message?.content || '';
    if (!/"faits"\s*:/.test(factList)) return { ok: false, reason: 'extraction refusée' };
    const written = await completeOnce(config, [
        {
            role: 'system',
            content: [
                'Tu rédiges un court texte original en français courant, entre 50 et 100 mots.',
                'Conserve chaque chiffre, date, lieu, acteur et décision présents dans les faits. Ne les remplace pas par une formule vague.',
                'Tu n’inventes aucun fait. Pas d’emoji, pas de créole forcé, pas de question, pas de conclusion artificielle.',
                'Tu n’écris pas le nom du média. Tu gardes l’attribution si le fait est une décision, une déclaration ou une accusation.',
                'Si le sujet touche la santé, parle d’usage traditionnel, pas d’efficacité établie. Aucun dosage ni promesse.'
            ].join(' ')
        },
        { role: 'user', content: `Faits extraits:\n${factList}\n\nFaits source:\n${draft.facts}` }
    ], fetchImpl);
    if (!written.ok) return written;
    const payload = written.payload;
    const text = acceptRewrittenText(payload?.choices?.[0]?.message?.content, draft);
    if (!text) return { ok: false, reason: 'réponse du modèle refusée' };
    const review = reviewEditorialText({ text, facts: draft.facts, healthReview: draft.healthReview });
    if (!review.ok) return { ok: false, reason: review.reasons.join(' ; ') };
    const usage = payload && payload.usage ? payload.usage : {};
    return {
        ok: true,
        text,
        model: config.model,
        promptTokens: usage.prompt_tokens || 0,
        completionTokens: usage.completion_tokens || 0
    };
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
        .select('metadata, status')
        .eq('agent_id', agentId)
        .limit(200);
    if (error) throw error;
    return new Set((data || [])
        .filter((row) => row.status !== 'CANCELLED')
        .map((row) => row.metadata && row.metadata.source_url)
        .filter(Boolean));
}

async function recordEditorialNote(supabase, agent, slot, outcome, detail) {
    const { data: existing } = await supabase
        .from('lyann_agent_tasks')
        .select('id')
        .eq('agent_id', agent.id)
        .filter('metadata->>pass_slot', 'eq', slot)
        .filter('metadata->>outcome', 'eq', outcome)
        .limit(1);
    if (existing && existing.length) return existing[0].id;
    const nothing = outcome === 'nothing_to_propose';
    const { data, error } = await supabase.from('lyann_agent_tasks').insert({
        agent_id: agent.id,
        title: nothing ? 'Rien à proposer' : 'Erreur de collecte',
        instruction: nothing ? 'Rien à proposer' : String(detail || 'Collecte impossible.'),
        task_type: 'POST_CREATION',
        status: nothing ? 'CANCELLED' : 'FAILED',
        requires_approval: false,
        approval_status: 'REJECTED',
        error: nothing ? null : String(detail || 'Collecte impossible.'),
        metadata: {
            editorial: true,
            outcome,
            pass_slot: slot,
            collected_at: new Date().toISOString(),
            profile_id: agent.linked_profile_id
        }
    }).select('id').single();
    if (error) throw error;
    return data.id;
}

async function collectEditorial(supabase, options = {}) {
    const names = EDITORIAL_BOTS.map((bot) => bot.name);
    const { data: agents, error } = await supabase.from('lyann_agents').select('id, agent_name, status, linked_profile_id').in('agent_name', names);
    if (error) throw error;
    const created = [];
    const skipped = [];
    const diagnoses = [];
    const slot = options.scheduled ? editorialPassSlot(options.now) : null;
    const dayStart = guadeloupeDayStart(options.now);
    for (const bot of EDITORIAL_BOTS) {
        const agent = (agents || []).find((row) => row.agent_name === bot.name);
        if (!agent) {
            skipped.push({ bot: bot.name, reason: 'absent' });
            continue;
        }
        const { count: todayCount } = await supabase
            .from('lyann_agent_tasks')
            .select('id', { count: 'exact', head: true })
            .eq('agent_id', agent.id)
            .gte('created_at', dayStart)
            .eq('status', 'WAITING_APPROVAL');
        if (!canCollect({ status: agent.status, maxPerDay: bot.maxPerDay }, todayCount || 0)) {
            skipped.push({ bot: bot.name, reason: agent.status === 'ACTIVE' ? 'plafond du jour' : agent.status });
            continue;
        }
        if (slot) {
            const { data: sameSlot } = await supabase
                .from('lyann_agent_tasks')
                .select('id')
                .eq('agent_id', agent.id)
                .filter('metadata->>pass_slot', 'eq', slot)
                .limit(1);
            if (sameSlot && sameSlot.length) {
                skipped.push({ bot: bot.name, reason: 'passage déjà traité', slot });
                continue;
            }
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
                    if (slot) await recordEditorialNote(supabase, agent, slot, 'collection_error', rewritten.reason);
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
                        generator: 'model',
                        model: rewritten.model,
                        prompt_tokens: rewritten.promptTokens,
                        completion_tokens: rewritten.completionTokens,
                        pass_slot: slot
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
            const technical = diagnoses.filter((row) => row.bot === bot.name && ['inaccessible', 'flux invalide'].includes(row.status));
            if (slot && technical.length) {
                await recordEditorialNote(supabase, agent, slot, 'collection_error', technical.map((row) => `${row.source}: ${row.status}`).join(' ; '));
                skipped.push({ bot: bot.name, reason: 'erreur de collecte' });
            } else if (slot) {
                await recordEditorialNote(supabase, agent, slot, 'nothing_to_propose', 'Rien à proposer');
                skipped.push({ bot: bot.name, reason: 'Rien à proposer' });
            } else {
                skipped.push({ bot: bot.name, reason: 'aucune source exploitable' });
            }
        }
    }
    return { created, skipped, diagnoses, slot, scheduled: Boolean(options.scheduled) };
}

async function publishEditorialTask(supabase, task, editorText, approver) {
    const approval = assertHumanApproval(approver);
    if (!approval.ok) throw new Error(approval.reason);
    const metadata = task.metadata || {};
    if (!metadata.editorial) throw new Error('Cette tâche n’est pas une proposition éditoriale.');
    if (metadata.published_post_id) return metadata.published_post_id;
    if (metadata.validation_status === 'HUMAN_REQUIRED' && !editorText) {
        // Human approval is the validation. The editor must send the text explicitly.
    }
    const { data: agent } = await supabase.from('lyann_agents').select('status, linked_profile_id').eq('id', task.agent_id).maybeSingle();
    if (!agent || agent.status === 'SUSPENDED') throw new Error('Ce compte éditorial est suspendu.');
    const content = String(editorText || task.instruction || '').trim();
    if (!content || !metadata.source_url) throw new Error('La proposition n’a pas de source.');
    const body = content.replace(/\n*Source\s*:[\s\S]*$/i, '').trim();
    const { data: already } = await supabase
        .from('bokantaj_posts')
        .select('id')
        .eq('author_id', agent.linked_profile_id)
        .eq('source_url', metadata.source_url)
        .limit(1);
    if (already && already[0]) {
        const now = new Date().toISOString();
        await supabase.from('lyann_agent_tasks').update({
            status: 'COMPLETED',
            approval_status: 'APPROVED',
            approved_by: approver.userId,
            completed_at: task.completed_at || now,
            updated_at: now,
            metadata: Object.assign({}, metadata, {
                published_post_id: already[0].id,
                approved_at: metadata.approved_at || now,
                approval_actor: 'admin',
                human_validation: true,
                approved_by_email: approver.email || metadata.approved_by_email || null
            })
        }).eq('id', task.id);
        return already[0].id;
    }
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
    const now = new Date().toISOString();
    const revisions = Array.isArray(metadata.revisions) ? metadata.revisions.slice() : [];
    if (body !== String(task.instruction || '').trim()) {
        revisions.push({ at: now, by: approver.userId, previous: task.instruction, next: body });
    }
    await supabase.from('lyann_agent_tasks').update({
        status: 'COMPLETED',
        approval_status: 'APPROVED',
        approved_by: approver.userId,
        instruction: body,
        completed_at: now,
        updated_at: now,
        metadata: Object.assign({}, metadata, {
            revisions,
            approved_at: now,
            approval_actor: 'admin',
            human_validation: true,
            published_post_id: post.id,
            approved_by_email: approver.email || null
        })
    }).eq('id', task.id);
    return post.id;
}

module.exports = { collectEditorial, publishEditorialTask, providerConfig, oidcClaims };
