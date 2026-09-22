const { test, expect } = require('@playwright/test');
const express = require('express');
const { createRequestSummaryHandler, TITLE_MAX, parseProviderTitles } = require('../../api/request-summary');

const DESCRIPTION = "Bonjour, j'ai une fuite sous mon évier de cuisine, il me faudrait quelqu'un pour réparer ça ce week-end. L'eau coule partout.";
const AI_TITLES = [
  'Réparer une fuite sous l’évier de cuisine',
  'Intervention plomberie pour évier qui fuit',
  'Fuite sous l’évier à réparer'
];

async function isolated(request, { user = { id: 'author-1' }, env = { LYANN_AI_API_KEY: 'test-key' }, provider = null, body = { description: DESCRIPTION }, repeat = 1 } = {}) {
    const providerCalls = [];
    const fetchImpl = async (url, options) => {
        providerCalls.push({ url, headers: options.headers, body: JSON.parse(options.body) });
        if (typeof provider === 'function') return provider(providerCalls.length);
        throw new Error('provider not configured for this fixture');
    };
    const getSupabaseClient = () => ({ auth: { getUser: async () => ({ data: { user }, error: user ? null : { message: 'no session' } }) } });
    const app = express();
    app.use(express.json());
    app.post('/v1/requests/summary', createRequestSummaryHandler({ getSupabaseClient, env, fetchImpl }));
    const server = await new Promise(resolve => { const s = app.listen(0, '127.0.0.1', () => resolve(s)); });
    try {
        const url = `http://127.0.0.1:${server.address().port}/v1/requests/summary`;
        let response;
        for (let i = 0; i < repeat; i += 1) response = await request.post(url, { data: body });
        return { status: response.status(), body: await response.json(), providerCalls };
    } finally { await new Promise(resolve => server.close(resolve)); }
}

const ok = payload => async () => ({ ok: true, json: async () => payload });
const message = content => ({ choices: [{ message: { content } }] });

test('Only a signed-in member may spend a suggestion', async ({ request }) => {
    const result = await isolated(request, { user: null, provider: ok(message(JSON.stringify({ titles: AI_TITLES }))) });
    expect(result.status).toBe(401);
    expect(result.body).toEqual({ error: 'Connexion requise.' });
    expect(result.providerCalls).toEqual([]);
});

test('Descriptions that cannot be summarised, and unexpected fields, are refused', async ({ request }) => {
    for (const body of [{ description: 'court' }, { description: '' }, {}, { description: DESCRIPTION, select: '*' }, { description: 'x'.repeat(4001) }]) {
        const result = await isolated(request, { body, provider: ok(message(JSON.stringify({ titles: AI_TITLES }))) });
        expect(result.status).toBe(400);
        expect(result.body).toEqual({ error: 'Description invalide pour générer un titre.' });
        expect(result.providerCalls).toEqual([]);
    }
});

test('Without a configured provider the endpoint does not invent local titles', async ({ request }) => {
    const result = await isolated(request, { env: {}, provider: ok(message(JSON.stringify({ titles: AI_TITLES }))) });
    expect(result.status).toBe(503);
    expect(result.body).toEqual({ error: 'Les titres automatiques ne sont pas disponibles pour le moment.' });
    expect(result.providerCalls).toEqual([]);
});

test('A configured provider returns three distinct clamped titles from the written need', async ({ request }) => {
    const env = { LYANN_AI_API_KEY: 'test-key', LYANN_AI_MODEL: 'test-model', LYANN_AI_BASE_URL: 'https://provider.test/v1' };
    const result = await isolated(request, {
        env,
        provider: ok(message(JSON.stringify({ titles: ['Titre : "Réparer une fuite sous l\'évier"', 'Plombier pour évier de cuisine', 'Fuite d’évier à réparer'] })))
    });
    expect(result.status).toBe(200);
    expect(result.body.source).toBe('AI');
    expect(result.body.maxLength).toBe(TITLE_MAX);
    expect(result.body.titles).toHaveLength(3);
    expect(new Set(result.body.titles.map(t => t.toLowerCase())).size).toBe(3);
    for (const title of result.body.titles) expect(title.length).toBeLessThanOrEqual(TITLE_MAX);
    expect(result.body.title).toBe(result.body.titles[0]);
    expect(result.body.titles[0]).toBe("Réparer une fuite sous l'évier");

    expect(result.providerCalls).toHaveLength(1);
    expect(result.providerCalls[0].url).toBe('https://provider.test/v1/chat/completions');
    expect(result.providerCalls[0].headers.Authorization).toBe('Bearer test-key');
    expect(result.providerCalls[0].body.model).toBe('test-model');
    expect(result.providerCalls[0].body.messages[1].content).toBe(DESCRIPTION);
});

test('A failing or incomplete provider does not fall back to heuristic titles', async ({ request }) => {
    const env = { LYANN_AI_API_KEY: 'test-key' };
    const providers = [
        async () => ({ ok: false, status: 429, json: async () => ({ error: { message: 'quota secret' } }) }),
        async () => { throw new Error('ECONNRESET secret host'); },
        ok({ choices: [] }),
        ok(message('  ')),
        ok(message(JSON.stringify({ titles: ['Un seul titre'] })))
    ];
    for (const provider of providers) {
        const result = await isolated(request, { env, provider });
        expect(result.status).toBe(502);
        expect(result.body).toEqual({ error: 'Les titres n’ont pas pu être proposés. Réessayez.' });
        expect(result.body.titles).toBeUndefined();
        expect(JSON.stringify(result.body)).not.toMatch(/secret|quota|ECONNRESET|429/);
        expect(result.providerCalls.length).toBeGreaterThanOrEqual(1);
    }
});

test('Suggestions per member are capped so a provider bill cannot run away', async ({ request }) => {
    const result = await isolated(request, { repeat: 21, provider: ok(message(JSON.stringify({ titles: AI_TITLES }))) });
    expect(result.status).toBe(429);
    expect(result.body).toEqual({ error: 'Trop de suggestions demandées. Réessayez dans quelques minutes.' });
});

test('Numbered lines and JSON fences are parsed into three unique titles', () => {
    const numbered = parseProviderTitles('1. Réparer une fuite\n2. Plombier pour évier\n3. Fuite sous évier');
    expect(numbered).toEqual(['Réparer une fuite', 'Plombier pour évier', 'Fuite sous évier']);
    const fenced = parseProviderTitles('```json\n{"titles":["Aider à déménager un canapé","Transport d’un canapé au 3e","Déménagement canapé"]}\n```');
    expect(fenced).toHaveLength(3);
});
