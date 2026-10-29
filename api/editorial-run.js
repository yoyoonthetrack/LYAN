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
    essentialFacts,
    reviewEditorialText,
    assertHumanApproval,
    editorialPassSlot,
    nextEditorialPass,
    guadeloupeDayStart
} = require('./editorial-engine');
const { runModerationOnce } = require('./moderation-worker');
const STAGING_PROJECT_ID = 'prj_FHIKUKYa8IwpiitigUma4gTtTF6q';
const PRODUCTION_PROJECT_ID = 'prj_avTkY4HCjHZSdd9ZvRj1JPSQSAfM';
const PRODUCTION_SUPABASE_REF = 'gzispjfoywklpqatjyop';

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

function providerConfig(env = process.env) {
    const isProdSupabase = String(env.SUPABASE_URL || '').includes(PRODUCTION_SUPABASE_REF);
    if (isProdSupabase) {
        return { error: 'production-supabase-refused' };
    }
    const directKey = env.LYANN_AI_API_KEY || env.OPENAI_API_KEY || '';
    if (directKey) {
        return {
            mode: 'api-key',
            apiKey: directKey,
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

function sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchText(url, attempt = 0) {
    try {
        const response = await fetch(url, {
            headers: { 'user-agent': 'LYANN-Editorial/1.0 (+https://staging.lyann.app)' },
            redirect: 'follow',
            signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(8000) : undefined
        });
        if (!response.ok) {
            const error = new Error(`Source indisponible (${response.status})`);
            error.status = response.status;
            throw error;
        }
        return await response.text();
    } catch (error) {
        const status = Number(error.status) || 0;
        const retryable = status === 429 || status >= 500 || status === 0;
        if (attempt < 1 && retryable) {
            await sleep(500);
            return fetchText(url, attempt + 1);
        }
        throw error;
    }
}

function summarizeEditorialRun({ created = [], skipped = [], diagnoses = [], startedAt, finishedAt, slot }) {
    const duplicateReasons = new Set(['doublon']);
    const neutralReasons = new Set(['doublon', 'absent', 'plafond du jour', 'passage déjà traité', 'Rien à proposer', 'erreur de collecte', 'SUSPENDED', 'PAUSED', 'ACTIVE']);
    return {
        slot: slot || null,
        found: diagnoses.reduce((sum, row) => sum + Number(row.count || 0), 0),
        created: created.length,
        duplicates: skipped.filter((row) => duplicateReasons.has(row.reason)).length,
        errors: diagnoses.filter((row) => row.status === 'inaccessible' || row.status === 'flux invalide').length,
        rejected: skipped.filter((row) => row.reason && !neutralReasons.has(row.reason)).length,
        duration_ms: Math.max(0, new Date(finishedAt).getTime() - new Date(startedAt).getTime())
    };
}

async function completeOnce(config, messages, fetchImpl) {
    const response = await fetchImpl(`${config.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
        signal: typeof AbortSignal !== 'undefined' && AbortSignal.timeout ? AbortSignal.timeout(20000) : undefined,
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
    if (!config || config.error) return { ok: false, reason: config && config.error || 'clé IA absente', fatal: true };
    if (String(draft.facts || '').trim().length < 40) {
        return { ok: false, reason: 'faits insuffisants' };
    }
    const extracted = await completeOnce(config, [
        { role: 'system', content: 'Extrais uniquement les faits vérifiables. Réponds en JSON: {"faits":["qui","quoi","où","quand","chiffres","décision","réserves"]}. N’invente rien.' },
        { role: 'user', content: draft.facts }
    ], fetchImpl);
    if (!extracted.ok) return { ...extracted, fatal: /401|403|429/.test(String(extracted.reason || '')) };
    const factList = extracted.payload?.choices?.[0]?.message?.content || '';
    if (!/"faits"\s*:/.test(factList)) return { ok: false, reason: 'extraction refusée' };
    const requiredTokens = essentialFacts(draft.facts);
    const systemLines = [
        'Tu rédiges un court texte original en français courant, entre 55 et 95 mots (au moins 4 phrases complètes).',
        'Conserve chaque chiffre, date, lieu, acteur et décision présents dans les faits. Ne les remplace pas par une formule vague.',
        'Tu n’inventes aucun fait. Pas d’emoji, pas de créole forcé, pas de question, pas de conclusion artificielle.',
        'N’utilise jamais les expressions "il est important de noter", "en conclusion" ou "n’hésitez pas".',
        'Tu n’écris pas le nom du média ni d’URL. Tu gardes l’attribution si le fait est une décision, une déclaration ou une accusation.'
    ];
    if (draft.healthReview) {
        systemLines.push(
            'Le sujet concerne le patrimoine végétal ou botanique : présente uniquement la plante, son contexte botanique ou culturel et les précautions documentées.',
            'INTERDICTION STRICTE d’utiliser les mots ou racines : soulage, soulager, guérit, guérir, efficace, bénéfique, bénéfiques, apaise, apaiser, soigne, soigner, dosage, préparation.'
        );
    }
    const userPrompt = [
        `Faits extraits:\n${factList}`,
        `Faits source:\n${draft.facts}`,
        requiredTokens.length ? `Chiffres et dates obligatoires à inclure textuellement : ${requiredTokens.join(', ')}` : ''
    ].filter(Boolean).join('\n\n');
    const written = await completeOnce(config, [
        { role: 'system', content: systemLines.join(' ') },
        { role: 'user', content: userPrompt }
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
        completionTokens: usage.completionTokens || usage.completion_tokens || 0
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
    let query = supabase
        .from('lyann_agent_tasks')
        .select('metadata, status')
        .order('created_at', { ascending: false })
        .limit(300);
    if (agentId && !Array.isArray(agentId)) {
        query = query.eq('agent_id', agentId);
    } else if (Array.isArray(agentId) && agentId.length) {
        query = query.in('agent_id', agentId);
    }
    const { data, error } = await query;
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
    const nothing = outcome === 'nothing_to_propose' || outcome === 'pass_started';
    const { data, error } = await supabase.from('lyann_agent_tasks').insert({
        agent_id: agent.id,
        title: outcome === 'pass_started' ? 'Passage en cours' : (outcome === 'nothing_to_propose' ? 'Rien à proposer' : 'Erreur de collecte'),
        instruction: outcome === 'pass_started' ? 'Passage réservé' : (nothing ? 'Rien à proposer' : String(detail || 'Collecte impossible.')),
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
    const startedAt = new Date();
    const runAt = startedAt.toISOString();
    const perBot = {};
    for (const bot of EDITORIAL_BOTS) {
        if (options.onlySlug && options.onlySlug !== bot.slug) continue;
        const agent = (agents || []).find((row) => row.agent_name === bot.name);
        if (!agent) {
            skipped.push({ bot: bot.name, slug: bot.slug, reason: 'absent' });
            continue;
        }
        perBot[bot.slug] = { name: bot.name, agentId: agent.id, found: 0, created: 0, duplicates: 0, errors: 0, rejected: 0 };
        const { count: todayCount } = await supabase
            .from('lyann_agent_tasks')
            .select('id', { count: 'exact', head: true })
            .eq('agent_id', agent.id)
            .gte('created_at', dayStart)
            .eq('status', 'WAITING_APPROVAL');
        if (!canCollect({ status: agent.status, maxPerDay: bot.maxPerDay }, todayCount || 0)) {
            const reason = agent.status === 'ACTIVE' ? 'plafond du jour' : agent.status;
            skipped.push({ bot: bot.name, slug: bot.slug, reason });
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
                skipped.push({ bot: bot.name, slug: bot.slug, reason: 'passage déjà traité', slot });
                continue;
            }
            await recordEditorialNote(supabase, agent, slot, 'pass_started', 'Passage réservé');
        }
        const allAgentIds = (agents || []).map((row) => row.id);
        const seen = await existingSourceUrls(supabase, allAgentIds);
        const sources = bot.sources || [];
        let drafted = false;
        let lastRewriteFailure = '';
        for (const source of sources) {
            const found = await itemsFromSource(source, fetchText);
            diagnoses.push({ bot: bot.name, slug: bot.slug, source: source.name, status: found.status, url: source.url, count: (found.items || []).length });
            if (perBot[bot.slug]) {
                perBot[bot.slug].found += (found.items || []).length;
                if (found.status === 'inaccessible' || found.status === 'flux invalide') perBot[bot.slug].errors += 1;
            }
            if (found.status === 'veille manuelle' || !found.items.length) continue;
            for (const item of found.items.slice(0, 5)) {
                let article = item;
                if (source.kind === 'jsonld') {
                    try {
                        article = parseEventJsonLd(await fetchText(item.url)) || item;
                    } catch (error) {
                        diagnoses.push({ bot: bot.name, slug: bot.slug, source: source.name, status: 'inaccessible', url: item.url, detail: error.message });
                        continue;
                    }
                    if (!article.summary || !article.publishedAt) continue;
                }
                if (!article.url || seen.has(article.url)) {
                    if (article.url && seen.has(article.url)) {
                        skipped.push({ bot: bot.name, slug: bot.slug, reason: 'doublon', url: article.url });
                        if (perBot[bot.slug]) perBot[bot.slug].duplicates += 1;
                    }
                    continue;
                }
                const freshSeen = await existingSourceUrls(supabase, allAgentIds);
                if (freshSeen.has(article.url)) {
                    seen.add(article.url);
                    skipped.push({ bot: bot.name, slug: bot.slug, reason: 'doublon', url: article.url });
                    if (perBot[bot.slug]) perBot[bot.slug].duplicates += 1;
                    continue;
                }
                const draft = draftFromSource({ ...article, sourceName: source.name, territory: source.territory }, bot);
                if (!draft) continue;
                const rewritten = await rewriteDraft(draft, options.fetchImpl || fetch);
                if (!rewritten.ok) {
                    lastRewriteFailure = rewritten.reason || 'réécriture refusée';
                    skipped.push({ bot: bot.name, slug: bot.slug, reason: lastRewriteFailure, url: draft.sourceUrl });
                    if (rewritten.fatal) {
                        if (slot) await recordEditorialNote(supabase, agent, slot, 'collection_error', lastRewriteFailure);
                        drafted = true;
                        break;
                    }
                    continue;
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
                        collected_at: runAt,
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
                if (perBot[bot.slug]) perBot[bot.slug].created += 1;
                created.push({
                    bot: bot.name,
                    slug: bot.slug,
                    id: data.id,
                    title: draft.subject.slice(0, 180),
                    source: draft.sourceName,
                    territory: draft.territory,
                    url: draft.sourceUrl,
                    validation: draft.validationStatus
                });
                await supabase.from('lyann_agents').update({ last_activity_at: runAt, updated_at: runAt }).eq('id', agent.id);
                await supabase.from('lyann_agent_activity').insert({
                    agent_id: agent.id,
                    event_type: 'EDITORIAL_COLLECTED',
                    description: `Proposition générée depuis ${draft.sourceName} : ${draft.subject.slice(0, 90)}`,
                    metadata: { task_id: data.id, source_name: draft.sourceName, source_url: draft.sourceUrl, territory: draft.territory }
                });
                drafted = true;
                break;
            }
            if (drafted) break;
        }
        if (!drafted && !skipped.some((row) => row.bot === bot.name && row.reason !== 'doublon')) {
            const technical = diagnoses.filter((row) => row.bot === bot.name && ['inaccessible', 'flux invalide'].includes(row.status));
            const allDuplicates = skipped.some((row) => row.bot === bot.name && row.reason === 'doublon');
            const fallbackReason = allDuplicates ? 'aucun nouvel article (déjà collecté)' : (lastRewriteFailure || 'aucune source exploitable');
            if (slot && technical.length && !allDuplicates) {
                await recordEditorialNote(supabase, agent, slot, 'collection_error', technical.map((row) => `${row.source}: ${row.status}`).join(' ; '));
                skipped.push({ bot: bot.name, slug: bot.slug, reason: 'erreur de collecte' });
            } else if (slot) {
                await recordEditorialNote(supabase, agent, slot, 'nothing_to_propose', 'Rien à proposer');
                skipped.push({ bot: bot.name, slug: bot.slug, reason: 'Rien à proposer' });
            } else if (!allDuplicates) {
                skipped.push({ bot: bot.name, slug: bot.slug, reason: fallbackReason });
            }
            await supabase.from('lyann_agent_activity').insert({
                agent_id: agent.id,
                event_type: 'EDITORIAL_PASS_EMPTY',
                description: `Collecte sans nouvelle proposition (${fallbackReason})`,
                metadata: { reason: fallbackReason, slot }
            });
        }
    }
    const finishedAt = new Date().toISOString();
    const metrics = summarizeEditorialRun({ created, skipped, diagnoses, startedAt, finishedAt, slot });
    for (const bot of EDITORIAL_BOTS) {
        const row = perBot[bot.slug];
        if (!row) continue;
        await supabase.from('lyann_agent_activity').insert({
            agent_id: row.agentId,
            event_type: 'EDITORIAL_RUN',
            description: `Passage ${slot || 'manuel'} : ${row.created} proposition(s), ${row.found} trouvé(s), ${row.duplicates} doublon(s), ${row.errors} erreur(s).`,
            metadata: {
                slot,
                found: row.found,
                created: row.created,
                duplicates: row.duplicates,
                errors: row.errors,
                rejected: skipped.filter((item) => item.slug === bot.slug && item.reason && !['doublon', 'absent', 'plafond du jour', 'passage déjà traité', 'Rien à proposer', 'erreur de collecte'].includes(item.reason)).length,
                duration_ms: metrics.duration_ms,
                scheduled: Boolean(options.scheduled)
            }
        });
        await supabase.from('lyann_agents').update({ last_activity_at: finishedAt, updated_at: finishedAt }).eq('id', row.agentId);
    }
    return { created, skipped, diagnoses, metrics, slot, scheduled: Boolean(options.scheduled), collectedAt: runAt };
}

async function moderateEditorialPost(supabase, postId) {
    try {
        await supabase.rpc('lyann_enqueue_moderation_job', { p_type: 'post', p_id: postId });
    } catch (_) {}
    try {
        await runModerationOnce({
            supabaseAdmin: supabase,
            apiKey: process.env.OPENAI_API_KEY || process.env.LYANN_AI_API_KEY || '',
            fetchImpl: global.fetch,
            limit: 6
        });
    } catch (_) {}
}

async function publishEditorialTask(supabase, task, editorText, approver) {
    const approval = assertHumanApproval(approver);
    if (!approval.ok) throw new Error(approval.reason);
    const metadata = task.metadata || {};
    if (!metadata.editorial) throw new Error('Cette tâche n’est pas une proposition éditoriale.');
    if (metadata.published_post_id) {
        await moderateEditorialPost(supabase, metadata.published_post_id);
        return metadata.published_post_id;
    }
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
        await moderateEditorialPost(supabase, already[0].id);
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
    const defaultCityByTerritory = {
        guadeloupe: 'Pointe-à-Pitre',
        martinique: 'Fort-de-France',
        guyane: 'Cayenne',
        reunion: 'Saint-Denis'
    };
    const territory = metadata.territory || 'guadeloupe';
    const { data: post, error } = await supabase.from('bokantaj_posts').insert({
        author_id: agent.linked_profile_id,
        type: 'info',
        headline: metadata.subject || task.title || null,
        content: body,
        source_name: metadata.source_name || null,
        source_url: metadata.source_url || null,
        source_published_at: metadata.original_published_at || null,
        city: metadata.city || defaultCityByTerritory[territory] || null,
        territory,
        media_urls: []
    }).select('id').single();
    if (error) throw error;
    await moderateEditorialPost(supabase, post.id);
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
    await supabase.from('lyann_agent_activity').insert({
        agent_id: task.agent_id,
        event_type: 'EDITORIAL_PUBLISHED',
        description: `Proposition validée et publiée sur Bokantaj (${metadata.subject || task.title || post.id})`,
        metadata: { task_id: task.id, post_id: post.id, approved_by: approver.userId }
    });
    return post.id;
}

async function editorialDeskExtras(supabase) {
    const names = EDITORIAL_BOTS.map((bot) => bot.name);
    const { data: agents, error } = await supabase.from('lyann_agents').select('id, agent_name').in('agent_name', names);
    if (error) throw error;
    const nameOf = {};
    (agents || []).forEach((row) => { nameOf[row.id] = row.agent_name; });
    const ids = Object.keys(nameOf);
    const { data: history, error: historyError } = ids.length
        ? await supabase.from('lyann_agent_activity').select('agent_id, event_type, description, metadata, created_at').in('agent_id', ids).order('created_at', { ascending: false }).limit(40)
        : { data: [] };
    if (historyError) throw historyError;
    const rows = (history || []).map((row) => ({ ...row, agent_name: nameOf[row.agent_id] || '' }));
    const runs = rows.filter((row) => row.event_type === 'EDITORIAL_RUN');
    const durations = runs.map((row) => Number(row.metadata && row.metadata.duration_ms)).filter((value) => Number.isFinite(value) && value >= 0);
    const lastSuccess = rows.find((row) => row.event_type === 'EDITORIAL_COLLECTED' || row.event_type === 'EDITORIAL_PUBLISHED');
    const schedule = require('../config/editorial-schedule.json');
    const cfg = providerConfig();
    const next = nextEditorialPass();
    return {
        history: rows,
        environment: 'staging',
        collectionAllowed: !String(process.env.SUPABASE_URL || '').includes(PRODUCTION_SUPABASE_REF),
        aiProvider: cfg && cfg.error ? { configured: false, error: cfg.error } : { configured: true, mode: cfg.mode, model: cfg.model },
        schedule: {
            enabled: schedule.enabled !== false,
            passes: (schedule.passes || []).map((pass) => pass.local),
            next
        },
        metrics: {
            lastCollectAt: rows[0] ? rows[0].created_at : null,
            lastSuccessAt: lastSuccess ? lastSuccess.created_at : null,
            averageDurationMs: durations.length ? Math.round(durations.reduce((sum, value) => sum + value, 0) / durations.length) : null,
            lastRun: runs[0] && runs[0].metadata ? runs[0].metadata : null,
            nextPassLabel: next.label
        }
    };
}

module.exports = { collectEditorial, publishEditorialTask, providerConfig, oidcClaims, summarizeEditorialRun, editorialDeskExtras, fetchText };
