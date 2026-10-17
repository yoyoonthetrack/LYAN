'use strict';

const { EDITORIAL_BOTS, parseRssItems, draftFromSource, canCollect } = require('./editorial-engine');

async function fetchText(url) {
    const response = await fetch(url, {
        headers: { 'user-agent': 'LYANN-Editorial/1.0 (+https://staging.lyann.app)' },
        redirect: 'follow'
    });
    if (!response.ok) throw new Error(`Source indisponible (${response.status})`);
    return response.text();
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
        const source = (bot.sources || []).find((item) => item.kind === 'rss' && (!options.onlySlug || options.onlySlug === bot.slug));
        if (!source) {
            skipped.push({ bot: bot.name, reason: 'aucune source RSS prête' });
            continue;
        }
        let items = [];
        try {
            items = parseRssItems(await fetchText(source.url)).slice(0, 3);
        } catch (err) {
            skipped.push({ bot: bot.name, reason: err.message });
            continue;
        }
        if (!items.length) {
            skipped.push({ bot: bot.name, reason: 'flux vide', url: source.url });
            continue;
        }
        for (const item of items) {
            if (seen.has(item.url)) {
                skipped.push({ bot: bot.name, reason: 'doublon', url: item.url });
                continue;
            }
            const draft = draftFromSource({ ...item, sourceName: source.name, territory: source.territory }, bot);
            if (!draft) continue;
            const { data, error: insertError } = await supabase.from('lyann_agent_tasks').insert({
                agent_id: agent.id,
                title: draft.subject.slice(0, 180),
                instruction: draft.proposedText,
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
                    proposed_text: draft.proposedText,
                    profile_id: agent.linked_profile_id
                }
            }).select('id').single();
            if (insertError) throw insertError;
            seen.add(item.url);
            created.push({ bot: bot.name, id: data.id, url: draft.sourceUrl, validation: draft.validationStatus });
            break;
        }
    }
    return { created, skipped };
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
    const { data: post, error } = await supabase.from('bokantaj_posts').insert({
        author_id: agent.linked_profile_id,
        type: 'info',
        content,
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

module.exports = { collectEditorial, publishEditorialTask };
