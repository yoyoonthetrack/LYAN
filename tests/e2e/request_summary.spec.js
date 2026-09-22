const { test, expect } = require('@playwright/test');
const express = require('express');
const { createRequestSummaryHandler, TITLE_MAX } = require('../../api/request-summary');

const DESCRIPTION = "Bonjour, j'ai une fuite sous mon évier de cuisine, il me faudrait quelqu'un pour réparer ça ce week-end. L'eau coule partout.";

// Isolated HTTP fixture: no Supabase call and no provider call leave this process.
async function isolated(request, { user = { id: 'author-1' }, env = {}, provider = null, body = { description: DESCRIPTION }, repeat = 1 } = {}) {
    const providerCalls = [];
    const fetchImpl = async (url, options) => {
        providerCalls.push({ url, headers: options.headers, body: JSON.parse(options.body) });
        if (typeof provider === 'function') return provider();
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
    const result = await isolated(request, { user: null });
    expect(result.status).toBe(401);
    expect(result.body).toEqual({ error: 'Connexion requise.' });
    expect(result.providerCalls).toEqual([]);
});

test('Descriptions that cannot be summarised, and unexpected fields, are refused', async ({ request }) => {
    for (const body of [{ description: 'court' }, { description: '' }, {}, { description: DESCRIPTION, select: '*' }, { description: 'x'.repeat(4001) }]) {
        const result = await isolated(request, { body });
        expect(result.status).toBe(400);
        expect(result.body).toEqual({ error: 'Description invalide pour générer un titre.' });
        expect(result.providerCalls).toEqual([]);
    }
});

test('Without a configured provider the local summary answers, never an empty title', async ({ request }) => {
    const result = await isolated(request);
    expect(result.status).toBe(200);
    expect(result.body.source).toBe('HEURISTIC');
    expect(result.body.maxLength).toBe(TITLE_MAX);
    expect(result.body.title).toBe("J'ai une fuite sous mon évier de cuisine");
    expect(result.providerCalls).toEqual([]);
});

test('A configured provider produces the title, stripped of preamble and clamped', async ({ request }) => {
    const env = { LYANN_AI_API_KEY: 'test-key', LYANN_AI_MODEL: 'test-model', LYANN_AI_BASE_URL: 'https://provider.test/v1' };
    const result = await isolated(request, { env, provider: ok(message('Titre : "Réparer une fuite sous l\'évier"\nAutre ligne ignorée')) });
    expect(result.status).toBe(200);
    expect(result.body).toMatchObject({ title: "Réparer une fuite sous l'évier", source: 'AI' });

    // The member's own bearer token is never forwarded to the provider.
    expect(result.providerCalls).toHaveLength(1);
    expect(result.providerCalls[0].url).toBe('https://provider.test/v1/chat/completions');
    expect(result.providerCalls[0].headers.Authorization).toBe('Bearer test-key');
    expect(result.providerCalls[0].body.model).toBe('test-model');

    const long = await isolated(request, { env, provider: ok(message('Réparation urgente de la fuite située sous l\'évier de la cuisine du logement')) });
    expect(long.body.title.length).toBeLessThanOrEqual(TITLE_MAX);
    expect(long.body.source).toBe('AI');
});

test('A failing, empty or malformed provider falls back locally without leaking its error', async ({ request }) => {
    const env = { LYANN_AI_API_KEY: 'test-key' };
    const providers = [
        async () => ({ ok: false, status: 429, json: async () => ({ error: { message: 'quota secret' } }) }),
        async () => { throw new Error('ECONNRESET secret host'); },
        ok({ choices: [] }),
        ok(message('  ')),
        ok(message('ab'))
    ];
    for (const provider of providers) {
        const result = await isolated(request, { env, provider });
        expect(result.status).toBe(200);
        expect(result.body.source).toBe('HEURISTIC');
        expect(result.body.title).toBe("J'ai une fuite sous mon évier de cuisine");
        expect(JSON.stringify(result.body)).not.toMatch(/secret|quota|ECONNRESET|429/);
    }
});

test('Suggestions per member are capped so a provider bill cannot run away', async ({ request }) => {
    const result = await isolated(request, { repeat: 21 });
    expect(result.status).toBe(429);
    expect(result.body).toEqual({ error: 'Trop de suggestions demandées. Réessayez dans quelques minutes.' });
});
